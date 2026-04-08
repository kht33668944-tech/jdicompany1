import { readFileSync } from "node:fs";
import pg from "pg";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT p.full_name, p.hire_date,
         public.calculate_vacation_days(p.hire_date, 2026) AS calc_days,
         vb.total_days, vb.used_days, vb.remaining_days
    FROM public.profiles p
    LEFT JOIN public.vacation_balances vb ON vb.user_id = p.id AND vb.year = 2026
   ORDER BY p.hire_date
`);
console.table(r.rows);
await c.end();
