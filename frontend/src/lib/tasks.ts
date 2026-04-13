import type { Task } from "@/lib/api";

export const DAY_BATCH_SIZE = 7;

export function getStartOfDay(input: Date) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

export function formatDateKey(input: Date) {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateLabelFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayValue = date.getDate();
  const suffix = getOrdinalSuffix(dayValue);
  const monthName = date.toLocaleDateString("en-GB", { month: "long" });
  const weekdayName = date.toLocaleDateString("en-GB", { weekday: "long" });
  return `${dayValue}${suffix} ${monthName} - ${weekdayName}`;
}

export function formatDateShortLabelFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayValue = date.getDate();
  const suffix = getOrdinalSuffix(dayValue);
  const monthName = date.toLocaleDateString("en-GB", { month: "long" });
  return `${dayValue}${suffix} ${monthName}`;
}

function getOrdinalSuffix(day: number) {
  if (day >= 11 && day <= 13) {
    return "th";
  }
  const lastDigit = day % 10;
  if (lastDigit === 1) {
    return "st";
  }
  if (lastDigit === 2) {
    return "nd";
  }
  if (lastDigit === 3) {
    return "rd";
  }
  return "th";
}

function getDateFromTask(task: Task) {
  const dateValue = task.start_time ?? task.end_time;
  return dateValue ? new Date(dateValue) : null;
}

export function getDateKeyFromTask(task: Task) {
  const taskDate = getDateFromTask(task);
  if (!taskDate) {
    return undefined;
  }
  return formatDateKey(taskDate);
}

export function hasExplicitTime(dateValue: string | null) {
  if (!dateValue) {
    return false;
  }
  const date = new Date(dateValue);
  return (
    date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0
  );
}

export function getComparableTimestamp(task: Task) {
  const value = task.start_time ?? task.end_time;
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }
  return new Date(value).getTime();
}

export function groupTasks(tasks: Task[]) {
  const unscheduled: Task[] = [];
  const byDate: Record<string, Task[]> = {};

  tasks.forEach((task) => {
    if (!task.start_time && !task.end_time) {
      unscheduled.push(task);
      return;
    }
    const taskDate = getDateFromTask(task);
    if (!taskDate) {
      unscheduled.push(task);
      return;
    }
    const key = formatDateKey(taskDate);
    byDate[key] = byDate[key] ?? [];
    byDate[key].push(task);
  });

  const sortDateBucket = (bucket: Task[]) =>
    bucket.sort((a, b) => {
      const aHasTime = hasExplicitTime(a.start_time) || hasExplicitTime(a.end_time);
      const bHasTime = hasExplicitTime(b.start_time) || hasExplicitTime(b.end_time);

      if (aHasTime !== bHasTime) {
        return aHasTime ? 1 : -1;
      }
      return getComparableTimestamp(a) - getComparableTimestamp(b);
    });

  sortDateBucket(unscheduled);
  Object.keys(byDate).forEach((key) => {
    sortDateBucket(byDate[key]);
  });

  return {
    unscheduled,
    byDate,
  };
}
