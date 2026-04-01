import TasksWidget from "@/components/dashboard/widgets/TasksWidget";
import ScheduleWidget from "@/components/dashboard/widgets/ScheduleWidget";

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <TasksWidget />
      <ScheduleWidget />
    </div>
  );
}
