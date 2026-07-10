import { redirect } from "next/navigation";
import WorkTimelineSection from "@/components/dashboard/work-timeline/WorkTimelineSection";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getWorkTimelineEntries,
  getWorkTimelineProfiles,
} from "@/lib/work-timeline/queries";
import { getKstDayRange } from "@/lib/work-timeline/utils";

interface WorkTimelinePageProps {
  searchParams: Promise<{
    q?: string | string[];
    employee?: string | string[];
    date?: string | string[];
  }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function validDate(value: string): string {
  if (!value) return "";
  try {
    getKstDayRange(value);
    return value;
  } catch {
    return "";
  }
}

export default async function WorkTimelinePage({ searchParams }: WorkTimelinePageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const params = await searchParams;
  const initialQuery = firstValue(params.q);
  const initialEmployeeId = firstValue(params.employee);
  const initialDate = validDate(firstValue(params.date));
  const employeeId = UUID_PATTERN.test(initialEmployeeId) ? initialEmployeeId : "";
  const entriesPromise = initialQuery.length === 1
    ? Promise.resolve([])
    : getWorkTimelineEntries(auth.supabase, {
        limit: 15,
        query: initialQuery.length >= 2 ? initialQuery : null,
        employeeId: employeeId || null,
        date: initialDate || null,
      });
  const [entries, profiles] = await Promise.all([
    entriesPromise,
    getWorkTimelineProfiles(auth.supabase),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <WorkTimelineSection
        initialEntries={entries}
        profiles={profiles}
        currentUserId={auth.user.id}
        currentUserRole={auth.profile.role}
        initialQuery={initialQuery}
        initialEmployeeId={employeeId}
        initialDate={initialDate}
      />
    </div>
  );
}
