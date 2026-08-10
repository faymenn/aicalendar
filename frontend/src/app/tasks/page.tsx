"use client";

import {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DateSection from "@/components/DateSection";
import TaskItem from "@/components/TaskItem";
import {
  AuthExpiredError,
  createTask,
  deleteTask,
  fetchTasks,
  getTokenExpiryMs,
  Task,
  TaskUpdateInput,
  updateTask,
} from "@/lib/api";
import {
  DAY_BATCH_SIZE,
  formatDateKey,
  formatDateLabelFromKey,
  formatDateShortLabelFromKey,
  getComparableTimestamp,
  groupTasks,
  hasExplicitTime,
  getStartOfDay,
} from "@/lib/tasks";
import { hasDateToken, parseTaskInput } from "@/lib/taskInputParser";

const TASK_ORDER_STORAGE_KEY = "task_order_by_bucket_v1";

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, count: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + count);
  return copy;
}

function createFutureDateKeys(startDate: Date, count: number) {
  if (count <= 0) {
    return [];
  }
  const start = getStartOfDay(startDate);
  return Array.from({ length: count }, (_, index) =>
    formatDateKey(addDays(start, index)),
  );
}

function moveId(ids: number[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0) {
    return ids;
  }
  const copy = [...ids];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

function dateDiffInDays(fromKey: string, toKey: string) {
  const from = fromDateKey(fromKey).getTime();
  const to = fromDateKey(toKey).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function createDateRangeKeys(startKey: string, endKey: string) {
  const total = dateDiffInDays(startKey, endKey);
  if (total < 0) {
    return [];
  }
  const start = fromDateKey(startKey);
  return Array.from({ length: total + 1 }, (_, index) =>
    formatDateKey(addDays(start, index)),
  );
}

type DateRenderEntry =
  | { type: "date"; dateKey: string; hasTasks: boolean }
  | { type: "gap"; rangeKey: string; startKey: string; endKey: string }
  | { type: "futureToggle"; startKey: string };

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeComposer, setActiveComposer] = useState<string | null>(null);
  const [futureDayCount, setFutureDayCount] = useState(0);
  const [hasReachedLastTaskDay, setHasReachedLastTaskDay] = useState(false);
  const [showFutureDays, setShowFutureDays] = useState(true);
  const [showPastDays, setShowPastDays] = useState(false);
  const [expandedMissingRanges, setExpandedMissingRanges] = useState<
    Record<string, boolean>
  >({});
  const [newTaskByDate, setNewTaskByDate] = useState<Record<string, string>>({});
  const [newDescriptionByDate, setNewDescriptionByDate] = useState<
    Record<string, string>
  >({});
  const [newLocationByDate, setNewLocationByDate] = useState<Record<string, string>>(
    {},
  );
  const [newDeadlineByDate, setNewDeadlineByDate] = useState<Record<string, string>>(
    {},
  );
  const [isEditingDescriptionByDate, setIsEditingDescriptionByDate] = useState<
    Record<string, boolean>
  >({});
  const [isEditingLocationByDate, setIsEditingLocationByDate] = useState<
    Record<string, boolean>
  >({});
  const [isEditingDeadlineByDate, setIsEditingDeadlineByDate] = useState<
    Record<string, boolean>
  >({});
  const [newUnscheduledTask, setNewUnscheduledTask] = useState("");
  const [newUnscheduledDescription, setNewUnscheduledDescription] = useState("");
  const [newUnscheduledLocation, setNewUnscheduledLocation] = useState("");
  const [newUnscheduledDeadline, setNewUnscheduledDeadline] = useState("");
  const [isEditingUnscheduledDescription, setIsEditingUnscheduledDescription] =
    useState(false);
  const [isEditingUnscheduledLocation, setIsEditingUnscheduledLocation] =
    useState(false);
  const [isEditingUnscheduledDeadline, setIsEditingUnscheduledDeadline] =
    useState(false);
  const [newlyAddedTaskId, setNewlyAddedTaskId] = useState<number | null>(null);
  const [creatingDateKey, setCreatingDateKey] = useState<string | null>(null);
  const [orderByBucket, setOrderByBucket] = useState<Record<string, number[]>>({});
  const [dragReadyTaskId, setDragReadyTaskId] = useState<number | null>(null);
  const [editingTaskIds, setEditingTaskIds] = useState<Record<number, boolean>>({});
  const [dropIndicator, setDropIndicator] = useState<{
    bucket: string;
    index: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    taskId: number;
    sourceBucket: string;
    isTimed: boolean;
  } | null>(null);
  const [isCreatingUnscheduled, setIsCreatingUnscheduled] = useState(false);
  const [createErrorByDate, setCreateErrorByDate] = useState<
    Record<string, string>
  >({});
  const [unscheduledCreateError, setUnscheduledCreateError] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastTaskDayTriggerRef = useRef<HTMLDivElement | null>(null);
  const hasRedirectedForAuthRef = useRef(false);

  const resetDragInteraction = useCallback(() => {
    setDragState(null);
    setDragReadyTaskId(null);
    setDropIndicator(null);
  }, []);

  const redirectToLogin = useCallback(() => {
    if (hasRedirectedForAuthRef.current) {
      return;
    }
    hasRedirectedForAuthRef.current = true;
    localStorage.removeItem("auth_token");
    router.push("/");
  }, [router]);

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof AuthExpiredError) {
        redirectToLogin();
        return true;
      }
      return false;
    },
    [redirectToLogin],
  );

  useEffect(() => {
    const stored = localStorage.getItem(TASK_ORDER_STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, number[]>;
      if (parsed && typeof parsed === "object") {
        setOrderByBucket(parsed);
      }
    } catch {
      localStorage.removeItem(TASK_ORDER_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TASK_ORDER_STORAGE_KEY, JSON.stringify(orderByBucket));
  }, [orderByBucket]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      redirectToLogin();
      return;
    }
    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) {
      return;
    }
    const remaining = expiryMs - Date.now();
    if (remaining <= 0) {
      redirectToLogin();
      return;
    }
    const timer = window.setTimeout(() => {
      redirectToLogin();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [redirectToLogin]);

  useEffect(() => {
    let isMounted = true;

    async function loadTasks() {
      setIsLoading(true);
      setError("");
      try {
        const data = await fetchTasks();
        if (isMounted) {
          setTasks(data.filter((task) => !task.completed));
        }
      } catch (loadError) {
        if (handleAuthError(loadError)) {
          return;
        }
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load tasks.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTasks();
    return () => {
      isMounted = false;
    };
  }, [handleAuthError]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasReachedLastTaskDay && showFutureDays) {
          setFutureDayCount((prev) => prev + DAY_BATCH_SIZE);
        }
      },
      { rootMargin: "220px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasReachedLastTaskDay, isLoading, error, showFutureDays]);

  useEffect(() => {
    if (newlyAddedTaskId === null) {
      return;
    }
    const timer = setTimeout(() => {
      setNewlyAddedTaskId(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [newlyAddedTaskId]);

  useEffect(() => {
    const handleMouseUp = () => {
      setDragReadyTaskId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        resetDragInteraction();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        resetDragInteraction();
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("dragend", resetDragInteraction);
    window.addEventListener("drop", resetDragInteraction);
    window.addEventListener("blur", resetDragInteraction);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("dragend", resetDragInteraction);
      window.removeEventListener("drop", resetDragInteraction);
      window.removeEventListener("blur", resetDragInteraction);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetDragInteraction]);

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const applyBucketOrder = useCallback(
    (bucketKey: string, bucketTasks: Task[]) => {
      const orderIds = orderByBucket[bucketKey] ?? [];
      const byId = new Map(bucketTasks.map((task) => [task.id, task]));
      const orderedFromState = orderIds
        .map((id) => byId.get(id))
        .filter((task): task is Task => Boolean(task));
      const missing = bucketTasks.filter(
        (task) => !orderedFromState.some((item) => item.id === task.id),
      );
      const preliminary = [...orderedFromState, ...missing];

      if (bucketKey === "unscheduled") {
        return preliminary;
      }

      const timedSorted = preliminary
        .filter((task) => hasExplicitTime(task.start_time) || hasExplicitTime(task.end_time))
        .sort((a, b) => getComparableTimestamp(a) - getComparableTimestamp(b));
      let timedIndex = 0;
      return preliminary.map((task) => {
        if (hasExplicitTime(task.start_time) || hasExplicitTime(task.end_time)) {
          const timedTask = timedSorted[timedIndex];
          timedIndex += 1;
          return timedTask;
        }
        return task;
      });
    },
    [orderByBucket],
  );
  const pastScheduledKeys = useMemo(
    () =>
      Object.keys(grouped.byDate)
        .filter(
          (dateKey) => dateKey < todayKey && (grouped.byDate[dateKey]?.length ?? 0) > 0,
        )
        .sort(),
    [grouped.byDate, todayKey],
  );
  const scheduledKeys = useMemo(
    () =>
      Object.keys(grouped.byDate)
        .filter(
          (dateKey) => dateKey >= todayKey && (grouped.byDate[dateKey]?.length ?? 0) > 0,
        )
        .sort(),
    [grouped.byDate, todayKey],
  );

  const lastScheduledDateKey = useMemo(() => {
    return scheduledKeys.length > 0 ? scheduledKeys[scheduledKeys.length - 1] : null;
  }, [scheduledKeys]);

  useEffect(() => {
    if (lastScheduledDateKey) {
      setHasReachedLastTaskDay(false);
      setFutureDayCount(0);
      setShowFutureDays(true);
      return;
    }
    setHasReachedLastTaskDay(true);
    setFutureDayCount(DAY_BATCH_SIZE);
    setShowFutureDays(false);
  }, [lastScheduledDateKey]);

  const futureStartKey = useMemo(() => {
    if (!lastScheduledDateKey) {
      return null;
    }
    return formatDateKey(addDays(fromDateKey(lastScheduledDateKey), 1));
  }, [lastScheduledDateKey]);

  const dateEntries = useMemo<DateRenderEntry[]>(() => {
    if (!lastScheduledDateKey) {
      const entries: DateRenderEntry[] = [
        { type: "date", dateKey: todayKey, hasTasks: false },
      ];
      entries.push({ type: "futureToggle", startKey: todayKey });
      if (showFutureDays && futureDayCount > 0) {
        const fallbackKeys = createFutureDateKeys(
          addDays(getStartOfDay(new Date()), 1),
          futureDayCount,
        );
        fallbackKeys.forEach((dateKey) => {
          entries.push({ type: "date", dateKey, hasTasks: false });
        });
      }
      return entries;
    }

    const start = addDays(fromDateKey(lastScheduledDateKey), 1);
    const futureKeys = createFutureDateKeys(start, futureDayCount);
    const entries: DateRenderEntry[] = [];
    const timelineKeys =
      scheduledKeys[0] === todayKey ? scheduledKeys : [todayKey, ...scheduledKeys];

    timelineKeys.forEach((dateKey, index) => {
      if (index > 0) {
        const prevKey = timelineKeys[index - 1];
        const gapDays = dateDiffInDays(prevKey, dateKey) - 1;
        if (gapDays > 0) {
          const gapStart = formatDateKey(addDays(fromDateKey(prevKey), 1));
          const gapEnd = formatDateKey(addDays(fromDateKey(dateKey), -1));
          const rangeKey = `${gapStart}__${gapEnd}`;
          entries.push({
            type: "gap",
            rangeKey,
            startKey: gapStart,
            endKey: gapEnd,
          });
          if (expandedMissingRanges[rangeKey]) {
            createDateRangeKeys(gapStart, gapEnd).forEach((gapDateKey) => {
              entries.push({ type: "date", dateKey: gapDateKey, hasTasks: false });
            });
          }
        }
      }
      entries.push({
        type: "date",
        dateKey,
        hasTasks: (grouped.byDate[dateKey]?.length ?? 0) > 0,
      });
    });

    if (futureStartKey && futureDayCount > 0) {
      entries.push({ type: "futureToggle", startKey: futureStartKey });
      if (showFutureDays) {
        futureKeys.forEach((dateKey) => {
          entries.push({ type: "date", dateKey, hasTasks: false });
        });
      }
    }

    return entries;
  }, [
    expandedMissingRanges,
    futureDayCount,
    futureStartKey,
    grouped.byDate,
    lastScheduledDateKey,
    todayKey,
    scheduledKeys,
    showFutureDays,
  ]);

  useEffect(() => {
    if (!lastScheduledDateKey) {
      return;
    }
    const node = lastTaskDayTriggerRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasReachedLastTaskDay(true);
          setFutureDayCount((prev) => (prev > 0 ? prev : DAY_BATCH_SIZE));
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [dateEntries, lastScheduledDateKey]);

  const getBucketTasks = useCallback(
    (bucketKey: string) => {
      const raw = bucketKey === "unscheduled" ? grouped.unscheduled : grouped.byDate[bucketKey] ?? [];
      return applyBucketOrder(bucketKey, raw);
    },
    [applyBucketOrder, grouped.byDate, grouped.unscheduled],
  );

  const handleTaskDragStart = useCallback(
    (task: Task, bucketKey: string) => {
      setDragState({
        taskId: task.id,
        sourceBucket: bucketKey,
        isTimed: hasExplicitTime(task.start_time) || hasExplicitTime(task.end_time),
      });
    },
    [],
  );

  const handleTaskDrop = useCallback(
    async (targetBucket: string, targetIndex: number) => {
      if (!dragState) {
        return;
      }
      const draggedTask = tasks.find((task) => task.id === dragState.taskId);
      if (!draggedTask) {
        setDragState(null);
        return;
      }

      const sourceTasks = getBucketTasks(dragState.sourceBucket);
      const targetTasks = getBucketTasks(targetBucket);

      if (dragState.sourceBucket === targetBucket) {
        if (dragState.isTimed && targetBucket !== "unscheduled") {
          setDragState(null);
          return;
        }
        const ids = sourceTasks.map((task) => task.id);
        const fromIndex = ids.indexOf(dragState.taskId);
        const toIndex = Math.max(0, Math.min(targetIndex, ids.length));
        const nextIds = moveId(ids, fromIndex, toIndex);
        setOrderByBucket((prev) => ({ ...prev, [targetBucket]: nextIds }));
        setDragState(null);
        setDragReadyTaskId(null);
        setDropIndicator(null);
        return;
      }

      let patch: TaskUpdateInput | null = null;
      if (targetBucket === "unscheduled") {
        patch = {
          title: draggedTask.title,
          start_time: null,
          end_time: null,
        };
      } else if (dragState.isTimed) {
        const sourceDate = new Date(draggedTask.start_time ?? draggedTask.end_time ?? "");
        const hours = sourceDate.getHours();
        const minutes = sourceDate.getMinutes();
        const seconds = sourceDate.getSeconds();
        const hh = String(hours).padStart(2, "0");
        const mm = String(minutes).padStart(2, "0");
        const ss = String(seconds).padStart(2, "0");
        patch = {
          title: draggedTask.title,
          start_time: `${targetBucket}T${hh}:${mm}:${ss}`,
        };
      } else {
        patch = {
          title: draggedTask.title,
          start_time: `${targetBucket}T00:00:00`,
        };
      }

      let updated: Task;
      try {
        updated = await updateTask(draggedTask.id, patch);
      } catch (dropError) {
        if (handleAuthError(dropError)) {
          return;
        }
        throw dropError;
      }
      setTasks((prev) =>
        prev.map((task) => (task.id === draggedTask.id ? { ...task, ...updated } : task)),
      );

      const sourceIds = sourceTasks
        .map((task) => task.id)
        .filter((id) => id !== draggedTask.id);
      const targetIdsRaw = targetTasks
        .map((task) => task.id)
        .filter((id) => id !== draggedTask.id);
      const insertAt = Math.max(0, Math.min(targetIndex, targetIdsRaw.length));
      targetIdsRaw.splice(insertAt, 0, draggedTask.id);
      setOrderByBucket((prev) => ({
        ...prev,
        [dragState.sourceBucket]: sourceIds,
        [targetBucket]: targetIdsRaw,
      }));
      setDragState(null);
      setDragReadyTaskId(null);
      setDropIndicator(null);
    },
    [dragState, getBucketTasks, handleAuthError, tasks],
  );

  const handleEditStateChange = useCallback((taskId: number, isEditing: boolean) => {
    setEditingTaskIds((prev) => {
      if (prev[taskId] === isEditing) {
        return prev;
      }
      return {
        ...prev,
        [taskId]: isEditing,
      };
    });
  }, []);

  const setDropIndicatorIfChanged = useCallback((bucket: string, index: number) => {
    setDropIndicator((prev) => {
      if (prev?.bucket === bucket && prev.index === index) {
        return prev;
      }
      return { bucket, index };
    });
  }, []);

  const handleTaskRowDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, bucket: string, rowIndex: number) => {
      if (!dragState) {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const rowMidpointY = rect.top + rect.height / 2;
      const insertIndex = event.clientY >= rowMidpointY ? rowIndex + 1 : rowIndex;
      setDropIndicatorIfChanged(bucket, insertIndex);
    },
    [dragState, setDropIndicatorIfChanged],
  );

  const handleTaskSave = useCallback(
    async (taskId: number, payload: TaskUpdateInput) => {
      const currentTask = tasks.find((task) => task.id === taskId);
      let updated: Task;
      try {
        updated = await updateTask(taskId, {
          title: currentTask?.title ?? "Task",
          ...payload,
        });
      } catch (saveError) {
        if (handleAuthError(saveError)) {
          return;
        }
        throw saveError;
      }
      if (updated.completed) {
        setTasks((prev) => prev.filter((task) => task.id !== taskId));
        return;
      }
      const mergedTask = {
        ...(currentTask ?? ({ id: taskId } as Task)),
        ...payload,
        ...updated,
      };
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, ...mergedTask } : task)),
      );
    },
    [handleAuthError, tasks],
  );

  const handleTaskComplete = useCallback(async (taskId: number) => {
    let removedTask: Task | undefined;
    setTasks((prev) => {
      removedTask = prev.find((task) => task.id === taskId);
      return prev.filter((task) => task.id !== taskId);
    });

    try {
      await updateTask(taskId, {
        title: removedTask?.title ?? "Task",
        completed: true,
      });
    } catch (completeError) {
      if (handleAuthError(completeError)) {
        return;
      }
      if (removedTask) {
        setTasks((prev) => [removedTask as Task, ...prev]);
      }
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Could not complete task.",
      );
      throw completeError;
    }
  }, [handleAuthError]);

  const handleTaskDelete = useCallback(async (taskId: number) => {
    try {
      await deleteTask(taskId);
    } catch (deleteError) {
      if (handleAuthError(deleteError)) {
        return;
      }
      throw deleteError;
    }
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, [handleAuthError]);

  function parseDeadlineInput(rawInput: string, defaultDateKey?: string) {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return { value: null as string | null, error: null as string | null };
    }
    const parsed = parseTaskInput(`deadline ${trimmed}`, { defaultDateKey });
    if (!parsed.startTime) {
      return { value: null, error: "Could not parse deadline. Try text like 'tomorrow 5pm'." };
    }
    return { value: parsed.startTime, error: null };
  }

  async function handleCreateTaskForDate(
    event: FormEvent<HTMLFormElement>,
    dateKey: string,
  ) {
    event.preventDefault();
    const raw = newTaskByDate[dateKey] ?? "";
    const parsed = parseTaskInput(raw, {
      defaultDateKey: dateKey,
    });
    if (!parsed.title) {
      return;
    }

    setCreatingDateKey(dateKey);
    setCreateErrorByDate((prev) => ({ ...prev, [dateKey]: "" }));
    try {
      const description = (newDescriptionByDate[dateKey] ?? "").trim();
      const location = (newLocationByDate[dateKey] ?? "").trim();
      const parsedDeadline = parseDeadlineInput(
        newDeadlineByDate[dateKey] ?? "",
        dateKey,
      );
      if (parsedDeadline.error) {
        setCreateErrorByDate((prev) => ({
          ...prev,
          [dateKey]: parsedDeadline.error as string,
        }));
        return;
      }
      const created = await createTask({
        title: parsed.title,
        start_time: parsed.startTime,
        end_time: parsed.endTime,
        description: description || null,
        location: location || null,
        deadline: parsedDeadline.value,
      });
      setTasks((prev) => [created, ...prev]);
      setNewlyAddedTaskId(created.id);
      setNewTaskByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setNewDescriptionByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setNewLocationByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setNewDeadlineByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setIsEditingDescriptionByDate((prev) => ({ ...prev, [dateKey]: false }));
      setIsEditingLocationByDate((prev) => ({ ...prev, [dateKey]: false }));
      setIsEditingDeadlineByDate((prev) => ({ ...prev, [dateKey]: false }));
    } catch (createError) {
      if (handleAuthError(createError)) {
        return;
      }
      setCreateErrorByDate((prev) => ({
        ...prev,
        [dateKey]:
          createError instanceof Error ? createError.message : "Could not create task.",
      }));
    } finally {
      setCreatingDateKey(null);
    }
  }

  async function handleCreateUnscheduledTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawInput = newUnscheduledTask;
    const parsed = parseTaskInput(rawInput);
    if (!parsed.title) {
      return;
    }

    setIsCreatingUnscheduled(true);
    setUnscheduledCreateError("");
    try {
      const description = newUnscheduledDescription.trim();
      const location = newUnscheduledLocation.trim();
      const parsedDeadline = parseDeadlineInput(newUnscheduledDeadline, todayKey);
      if (parsedDeadline.error) {
        setUnscheduledCreateError(parsedDeadline.error);
        return;
      }
      const created = await createTask({
        title: parsed.title,
        start_time: hasDateToken(rawInput) ? parsed.startTime : null,
        end_time: hasDateToken(rawInput) ? parsed.endTime : null,
        description: description || null,
        location: location || null,
        deadline: parsedDeadline.value,
      });
      setTasks((prev) => [created, ...prev]);
      setNewlyAddedTaskId(created.id);
      setNewUnscheduledTask("");
      setNewUnscheduledDescription("");
      setNewUnscheduledLocation("");
      setNewUnscheduledDeadline("");
      setIsEditingUnscheduledDescription(false);
      setIsEditingUnscheduledLocation(false);
      setIsEditingUnscheduledDeadline(false);
    } catch (createError) {
      if (handleAuthError(createError)) {
        return;
      }
      setUnscheduledCreateError(
        createError instanceof Error ? createError.message : "Could not create task.",
      );
    } finally {
      setIsCreatingUnscheduled(false);
    }
  }

  const showTopComposerMeta =
    activeComposer === "top" ||
    newUnscheduledTask.trim() !== "" ||
    newUnscheduledDescription.trim() !== "" ||
    newUnscheduledLocation.trim() !== "" ||
    newUnscheduledDeadline.trim() !== "" ||
    isEditingUnscheduledDescription ||
    isEditingUnscheduledLocation ||
    isEditingUnscheduledDeadline;
  const unscheduledTasks = getBucketTasks("unscheduled");

  function handleLogout() {
    localStorage.removeItem("auth_token");
    router.push("/");
  }

  function getDateLabel(dateKey: string) {
    const base = formatDateLabelFromKey(dateKey);
    return dateKey === todayKey ? `${base} - Today` : base;
  }

  function renderDateBucket(
    dateKey: string,
    hasTasks: boolean,
    suppressBottomDivider: boolean,
    strikethroughLabel = false,
  ) {
    const dateTasks = getBucketTasks(dateKey);
    const composerKey = `date:${dateKey}`;
    const showComposerMeta =
      activeComposer === composerKey ||
      (newTaskByDate[dateKey] ?? "").trim() !== "" ||
      (newDescriptionByDate[dateKey] ?? "").trim() !== "" ||
      (newLocationByDate[dateKey] ?? "").trim() !== "" ||
      (newDeadlineByDate[dateKey] ?? "").trim() !== "" ||
      isEditingDescriptionByDate[dateKey] ||
      isEditingLocationByDate[dateKey] ||
      isEditingDeadlineByDate[dateKey];

    return (
      <DateSection
        key={dateKey}
        label={getDateLabel(dateKey)}
        defaultOpen={dateTasks.length > 0}
        muted={!hasTasks}
        suppressBottomDivider={suppressBottomDivider}
        strikethroughLabel={strikethroughLabel}
        onBannerDragOver={(event) => {
          if (!dragState) {
            return;
          }
          event.preventDefault();
          setDropIndicatorIfChanged(dateKey, dateTasks.length);
        }}
        onBannerDrop={(event) => {
          event.preventDefault();
          void handleTaskDrop(dateKey, dateTasks.length);
        }}
      >
        <div className="quickAddComposer">
          <div className="quickAddTopRow">
            <form
              className="quickAddForm quickAddMainForm"
              onSubmit={(event) => void handleCreateTaskForDate(event, dateKey)}
            >
              <button
                type="submit"
                className="quickAddPlus"
                aria-label="Add task"
                disabled={
                  creatingDateKey === dateKey ||
                  !(newTaskByDate[dateKey] ?? "").trim()
                }
              >
                +
              </button>
              <input
                className="quickAddInput"
                value={newTaskByDate[dateKey] ?? ""}
                onChange={(event) =>
                  setNewTaskByDate((prev) => ({
                    ...prev,
                    [dateKey]: event.target.value,
                  }))
                }
                onFocus={() => setActiveComposer(composerKey)}
                onBlur={() => {
                  setTimeout(() => {
                    const shouldKeepOpen =
                      (newTaskByDate[dateKey] ?? "").trim() !== "" ||
                      (newDescriptionByDate[dateKey] ?? "").trim() !== "" ||
                      (newLocationByDate[dateKey] ?? "").trim() !== "" ||
                      (newDeadlineByDate[dateKey] ?? "").trim() !== "" ||
                      !!isEditingDescriptionByDate[dateKey] ||
                      !!isEditingLocationByDate[dateKey] ||
                      !!isEditingDeadlineByDate[dateKey];
                    if (!shouldKeepOpen) {
                      setActiveComposer((prev) => (prev === composerKey ? null : prev));
                    }
                  }, 120);
                }}
                enterKeyHint="done"
                placeholder="Add task"
              />
              {(newTaskByDate[dateKey] ?? "").trim() !== "" && (
                <button
                  type="submit"
                  className="quickAddSubmit"
                  disabled={creatingDateKey === dateKey}
                >
                  Add
                </button>
              )}
            </form>
            {showComposerMeta && (
              <div className="quickAddLocationSlot">
                <div className="quickAddMetaStack">
                  {isEditingLocationByDate[dateKey] ||
                  (newLocationByDate[dateKey] ?? "").trim() !== "" ? (
                    <input
                      className="taskMetaInlineInput quickAddMetaLocationInput"
                      value={newLocationByDate[dateKey] ?? ""}
                      onChange={(event) =>
                        setNewLocationByDate((prev) => ({
                          ...prev,
                          [dateKey]: event.target.value,
                        }))
                      }
                      onBlur={() => {
                        if (!(newLocationByDate[dateKey] ?? "").trim()) {
                          setIsEditingLocationByDate((prev) => ({
                            ...prev,
                            [dateKey]: false,
                          }));
                        }
                      }}
                      placeholder="Add location"
                    />
                  ) : (
                    <button
                      type="button"
                      className="taskMetaGhostButton taskLocationGhost"
                      onClick={() =>
                        setIsEditingLocationByDate((prev) => ({
                          ...prev,
                          [dateKey]: true,
                        }))
                      }
                    >
                      Add location
                    </button>
                  )}
                  {isEditingDeadlineByDate[dateKey] ||
                  (newDeadlineByDate[dateKey] ?? "").trim() !== "" ? (
                    <input
                      className="taskMetaInlineInput quickAddMetaDeadlineInput"
                      value={newDeadlineByDate[dateKey] ?? ""}
                      onChange={(event) =>
                        setNewDeadlineByDate((prev) => ({
                          ...prev,
                          [dateKey]: event.target.value,
                        }))
                      }
                      onBlur={() => {
                        if (!(newDeadlineByDate[dateKey] ?? "").trim()) {
                          setIsEditingDeadlineByDate((prev) => ({
                            ...prev,
                            [dateKey]: false,
                          }));
                        }
                      }}
                      placeholder="Set deadline"
                    />
                  ) : (
                    <button
                      type="button"
                      className="taskMetaGhostButton taskLocationGhost"
                      onClick={() =>
                        setIsEditingDeadlineByDate((prev) => ({
                          ...prev,
                          [dateKey]: true,
                        }))
                      }
                    >
                      Add deadline
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {showComposerMeta && (
          <div className="quickAddDescriptionRow">
            {isEditingDescriptionByDate[dateKey] ||
            (newDescriptionByDate[dateKey] ?? "").trim() !== "" ? (
              <textarea
                className="taskMetaInlineInput taskMetaInlineTextarea"
                value={newDescriptionByDate[dateKey] ?? ""}
                onChange={(event) =>
                  setNewDescriptionByDate((prev) => ({
                    ...prev,
                    [dateKey]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (!(newDescriptionByDate[dateKey] ?? "").trim()) {
                    setIsEditingDescriptionByDate((prev) => ({
                      ...prev,
                      [dateKey]: false,
                    }));
                  }
                }}
                rows={2}
                placeholder="Add description"
              />
            ) : (
              <button
                type="button"
                className="taskMetaGhostButton"
                onClick={() =>
                  setIsEditingDescriptionByDate((prev) => ({
                    ...prev,
                    [dateKey]: true,
                  }))
                }
              >
                Add description
              </button>
            )}
          </div>
        )}
        {createErrorByDate[dateKey] && (
          <p className="statusMessage error">{createErrorByDate[dateKey]}</p>
        )}

        {creatingDateKey === dateKey && <p className="statusMessage">Creating task...</p>}

        <div
          onDragOver={(event) => {
            if (!dragState) {
              return;
            }
            event.preventDefault();
            setDropIndicatorIfChanged(dateKey, dateTasks.length);
          }}
          onDrop={() => void handleTaskDrop(dateKey, dateTasks.length)}
        >
          {dateTasks.length > 0 &&
            dateTasks.map((task, index) => (
              <div key={task.id}>
                {dropIndicator?.bucket === dateKey && dropIndicator.index === index && (
                  <div className="dropIndicatorLine" />
                )}
                <div
                  className={
                    dragState?.taskId === task.id
                      ? "taskDragWrapper isDragging"
                      : "taskDragWrapper"
                  }
                  draggable={dragReadyTaskId === task.id && !editingTaskIds[task.id]}
                  onDragStart={() => handleTaskDragStart(task, dateKey)}
                  onDragEnd={() => {
                    setDragState(null);
                    setDragReadyTaskId(null);
                    setDropIndicator(null);
                  }}
                  onDragOver={(event) => {
                    event.stopPropagation();
                    handleTaskRowDragOver(event, dateKey, index);
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                    void handleTaskDrop(
                      dateKey,
                      dropIndicator?.bucket === dateKey ? dropIndicator.index : index,
                    );
                  }}
                >
                  <TaskItem
                    task={task}
                    onSave={handleTaskSave}
                    onDelete={handleTaskDelete}
                    onComplete={handleTaskComplete}
                    onDragHandleMouseDown={() => setDragReadyTaskId(task.id)}
                    onEditStateChange={handleEditStateChange}
                    forceShowMeta={newlyAddedTaskId === task.id}
                  />
                </div>
              </div>
            ))}
          {dropIndicator?.bucket === dateKey && dropIndicator.index === dateTasks.length && (
            <div className="dropIndicatorLine" />
          )}
        </div>
        {dateKey === lastScheduledDateKey && <div ref={lastTaskDayTriggerRef} className="lastTaskDayTrigger" />}
      </DateSection>
    );
  }

  return (
    <main className="tasksPage">
      <header className="tasksPageHeader">
        <h1 className="tasksPageTitle">whatdowhen</h1>
        <div className="tasksHeaderActions">
          <Link href="/completed" className="logoutButton">
            Completed
          </Link>
          <button type="button" className="logoutButton" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>
      {isLoading && <p className="statusMessage">Loading tasks...</p>}
      {error && <p className="statusMessage error">{error}</p>}

      {!isLoading && !error && (
        <div className="tasksContainer">
          <div className="quickAddComposer">
            <div className="quickAddTopRow">
              <form
                className="quickAddForm quickAddMainForm"
                onSubmit={(event) => void handleCreateUnscheduledTask(event)}
              >
                <button
                  type="submit"
                  className="quickAddPlus"
                  aria-label="Add task"
                  disabled={isCreatingUnscheduled || !newUnscheduledTask.trim()}
                >
                  +
                </button>
                <input
                  className="quickAddInput"
                  value={newUnscheduledTask}
                  onChange={(event) => setNewUnscheduledTask(event.target.value)}
                  onFocus={() => setActiveComposer("top")}
                  onBlur={() => {
                    setTimeout(() => {
                      const shouldKeepOpen =
                        newUnscheduledTask.trim() !== "" ||
                        newUnscheduledDescription.trim() !== "" ||
                        newUnscheduledLocation.trim() !== "" ||
                        newUnscheduledDeadline.trim() !== "" ||
                        isEditingUnscheduledDescription ||
                        isEditingUnscheduledLocation ||
                        isEditingUnscheduledDeadline;
                      if (!shouldKeepOpen) {
                        setActiveComposer((prev) => (prev === "top" ? null : prev));
                      }
                    }, 120);
                  }}
                  enterKeyHint="done"
                  placeholder="Add task"
                />
                {newUnscheduledTask.trim() !== "" && (
                  <button
                    type="submit"
                    className="quickAddSubmit"
                    disabled={isCreatingUnscheduled}
                  >
                    Add
                  </button>
                )}
              </form>
              {showTopComposerMeta && (
                <div className="quickAddLocationSlot">
                  <div className="quickAddMetaStack">
                    {isEditingUnscheduledLocation || newUnscheduledLocation.trim() !== "" ? (
                      <input
                        className="taskMetaInlineInput quickAddMetaLocationInput"
                        value={newUnscheduledLocation}
                        onChange={(event) => setNewUnscheduledLocation(event.target.value)}
                        onBlur={() => {
                          if (!newUnscheduledLocation.trim()) {
                            setIsEditingUnscheduledLocation(false);
                          }
                        }}
                        placeholder="Add location"
                      />
                    ) : (
                      <button
                        type="button"
                        className="taskMetaGhostButton taskLocationGhost"
                        onClick={() => setIsEditingUnscheduledLocation(true)}
                      >
                        Add location
                      </button>
                    )}
                    {isEditingUnscheduledDeadline || newUnscheduledDeadline.trim() !== "" ? (
                      <input
                        className="taskMetaInlineInput quickAddMetaDeadlineInput"
                        value={newUnscheduledDeadline}
                        onChange={(event) => setNewUnscheduledDeadline(event.target.value)}
                        onBlur={() => {
                          if (!newUnscheduledDeadline.trim()) {
                            setIsEditingUnscheduledDeadline(false);
                          }
                        }}
                        placeholder="Set deadline"
                      />
                    ) : (
                      <button
                        type="button"
                        className="taskMetaGhostButton taskLocationGhost"
                        onClick={() => setIsEditingUnscheduledDeadline(true)}
                      >
                        Add deadline
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {showTopComposerMeta && (
            <div className="quickAddDescriptionRow">
              {isEditingUnscheduledDescription || newUnscheduledDescription.trim() !== "" ? (
                <textarea
                  className="taskMetaInlineInput taskMetaInlineTextarea"
                  value={newUnscheduledDescription}
                  onChange={(event) => setNewUnscheduledDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() => {
                    if (!newUnscheduledDescription.trim()) {
                      setIsEditingUnscheduledDescription(false);
                    }
                  }}
                  rows={2}
                  placeholder="Add description"
                />
              ) : (
                <button
                  type="button"
                  className="taskMetaGhostButton"
                  onClick={() => setIsEditingUnscheduledDescription(true)}
                >
                  Add description
                </button>
              )}
            </div>
          )}
          {unscheduledCreateError && (
            <p className="statusMessage error">{unscheduledCreateError}</p>
          )}
          {isCreatingUnscheduled && <p className="statusMessage">Creating task...</p>}

          <DateSection
            label="Unscheduled"
            defaultOpen
            suppressBottomDivider={pastScheduledKeys.length > 0}
            onBannerDragOver={(event) => {
              if (!dragState) {
                return;
              }
              event.preventDefault();
              setDropIndicatorIfChanged("unscheduled", unscheduledTasks.length);
            }}
            onBannerDrop={(event) => {
              event.preventDefault();
              void handleTaskDrop("unscheduled", unscheduledTasks.length);
            }}
          >
            <div
              onDragOver={(event) => {
                if (!dragState) {
                  return;
                }
                event.preventDefault();
                setDropIndicatorIfChanged("unscheduled", unscheduledTasks.length);
              }}
              onDrop={() => void handleTaskDrop("unscheduled", unscheduledTasks.length)}
            >
              {unscheduledTasks.length > 0 &&
                unscheduledTasks.map((task, index) => (
                  <div key={task.id}>
                    {dropIndicator?.bucket === "unscheduled" &&
                      dropIndicator.index === index && <div className="dropIndicatorLine" />}
                    <div
                      className={
                        dragState?.taskId === task.id
                          ? "taskDragWrapper isDragging"
                          : "taskDragWrapper"
                      }
                      draggable={
                        dragReadyTaskId === task.id && !editingTaskIds[task.id]
                      }
                      onDragStart={() => handleTaskDragStart(task, "unscheduled")}
                      onDragEnd={() => {
                        setDragState(null);
                        setDragReadyTaskId(null);
                        setDropIndicator(null);
                      }}
                      onDragOver={(event) =>
                        {
                          event.stopPropagation();
                          handleTaskRowDragOver(event, "unscheduled", index);
                        }
                      }
                      onDrop={(event) => {
                        event.stopPropagation();
                        void handleTaskDrop(
                          "unscheduled",
                          dropIndicator?.bucket === "unscheduled"
                            ? dropIndicator.index
                            : index,
                        );
                      }}
                    >
                      <TaskItem
                        task={task}
                        onSave={handleTaskSave}
                        onDelete={handleTaskDelete}
                        onComplete={handleTaskComplete}
                        onDragHandleMouseDown={() => setDragReadyTaskId(task.id)}
                        onEditStateChange={handleEditStateChange}
                        forceShowMeta={newlyAddedTaskId === task.id}
                      />
                    </div>
                  </div>
                ))}
              {dropIndicator?.bucket === "unscheduled" &&
                dropIndicator.index === unscheduledTasks.length && (
                  <div className="dropIndicatorLine" />
                )}
            </div>
          </DateSection>

          {pastScheduledKeys.length > 0 && (
            <button
              type="button"
              className="missingDatesToggle"
              onClick={() => setShowPastDays((prev) => !prev)}
            >
              <span className="missingDatesToggleText">past</span>
            </button>
          )}
          {showPastDays &&
            pastScheduledKeys.map((dateKey) =>
              renderDateBucket(dateKey, true, false, true),
            )}

          {dateEntries.map((entry, index) => {
            if (entry.type === "gap") {
              const startLabel = formatDateShortLabelFromKey(entry.startKey);
              const endLabel = formatDateShortLabelFromKey(entry.endKey);
              const gapLabel =
                entry.startKey === entry.endKey
                  ? startLabel
                  : `${startLabel} - ${endLabel}`;
              const isExpanded = !!expandedMissingRanges[entry.rangeKey];
              return (
                <button
                  key={entry.rangeKey}
                  type="button"
                  className="missingDatesToggle"
                  onClick={() =>
                    setExpandedMissingRanges((prev) => ({
                      ...prev,
                      [entry.rangeKey]: !prev[entry.rangeKey],
                    }))
                  }
                >
                  <span className="missingDatesToggleText">{gapLabel}</span>
                  <span className="missingDatesToggleHint">
                    {isExpanded ? "Hide missing dates" : "Show missing dates"}
                  </span>
                </button>
              );
            }
            if (entry.type === "futureToggle") {
              return (
                <button
                  key={`future-${entry.startKey}`}
                  type="button"
                  className="missingDatesToggle"
                  onClick={() => setShowFutureDays((prev) => !prev)}
                >
                  <span className="missingDatesToggleText">
                    {formatDateShortLabelFromKey(entry.startKey)} onwards
                  </span>
                  <span className="missingDatesToggleHint">
                    {showFutureDays ? "Hide dates" : "Show dates"}
                  </span>
                </button>
              );
            }
            const { dateKey } = entry;
            const nextEntry = dateEntries[index + 1];
            return renderDateBucket(
              dateKey,
              entry.hasTasks,
              nextEntry?.type === "gap" || nextEntry?.type === "futureToggle",
            );
          })}

          <div ref={sentinelRef} className="scrollSentinel" />
        </div>
      )}
    </main>
  );
}
