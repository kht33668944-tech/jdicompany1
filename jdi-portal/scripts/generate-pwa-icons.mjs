// PWA 아이콘 PNG 자동 생성 스크립트
// public/icon.svg → public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
// 수동 실행: node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "public/icon.svg");

if (!existsSync(src)) {
  console.error("public/icon.svg 가 없습니다.");
  process.exit(1);
}

const svg = readFileSync(src);

const targets = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png" }, // iOS
  { size: 512, name: "icon-maskable-512.png", padding: 0.1 }, // 마스커블 (가장자리 안전 영역)
];

for (const t of targets) {
  const out = resolve(root, "public", t.name);
  let pipeline = sharp(svg, { density: 384 }).resize(t.size, t.size);
  if (t.padding) {
    const inner = Math.round(t.size * (1 - t.padding * 2));
    const offset = Math.round(t.size * t.padding);
    pipeline = sharp({
      create: {
        width: t.size,
        height: t.size,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 }, // brand-600
      },
    }).composite([
      {
        input: await sharp(svg, { density: 384 })
          .resize(inner, inner)
          .png()
          .toBuffer(),
        top: offset,
        left: offset,
      },
    ]);
  }
  await pipeline.png().toFile(out);
  console.log("✓", t.name);
}

console.log("\n생성 완료: public/");
