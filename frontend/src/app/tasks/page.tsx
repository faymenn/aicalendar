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
import { useRouter } from "next/navigation";
import DateSection from "@/components/DateSection";
import TaskItem from "@/components/TaskItem";
import {
  createTask,
  deleteTask,
  fetchTasks,
  Task,
  TaskUpdateInput,
  updateTask,
} from "@/lib/api";
import {
  DAY_BATCH_SIZE,
  formatDateKey,
  formatDateLabelFromKey,
  formatDateShortLabelFromKey,
  groupTasks,
  getStartOfDay,
} from "@/lib/tasks";
import { parseTaskInput } from "@/lib/taskInputParser";

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

function taskHasExplicitTime(task: Task) {
  const value = task.start_time ?? task.end_time;
  if (!value) {
    return false;
  }
  const date = new Date(value);
  return (
    date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0
  );
}

function getTimeStamp(task: Task) {
  const value = task.start_time ?? task.end_time;
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }
  return new Date(value).getTime();
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
  if (total <= 0) {
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
  const [isEditingDescriptionByDate, setIsEditingDescriptionByDate] = useState<
    Record<string, boolean>
  >({});
  const [isEditingLocationByDate, setIsEditingLocationByDate] = useState<
    Record<string, boolean>
  >({});
  const [newUnscheduledTask, setNewUnscheduledTask] = useState("");
  const [newUnscheduledDescription, setNewUnscheduledDescription] = useState("");
  const [newUnscheduledLocation, setNewUnscheduledLocation] = useState("");
  const [isEditingUnscheduledDescription, setIsEditingUnscheduledDescription] =
    useState(false);
  const [isEditingUnscheduledLocation, setIsEditingUnscheduledLocation] =
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
  }, []);

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
        .filter((task) => taskHasExplicitTime(task))
        .sort((a, b) => getTimeStamp(a) - getTimeStamp(b));
      let timedIndex = 0;
      return preliminary.map((task) => {
        if (taskHasExplicitTime(task)) {
          const timedTask = timedSorted[timedIndex];
          timedIndex += 1;
          return timedTask;
        }
        return task;
      });
    },
    [orderByBucket],
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
    setShowFutureDays(true);
  }, [lastScheduledDateKey]);

  const futureStartKey = useMemo(() => {
    if (!lastScheduledDateKey) {
      return null;
    }
    return formatDateKey(addDays(fromDateKey(lastScheduledDateKey), 1));
  }, [lastScheduledDateKey]);

  const dateEntries = useMemo<DateRenderEntry[]>(() => {
    if (!lastScheduledDateKey) {
      const fallbackKeys = createFutureDateKeys(getStartOfDay(new Date()), futureDayCount);
      return fallbackKeys.map((dateKey) => ({ type: "date", dateKey, hasTasks: false }));
    }

    const start = addDays(fromDateKey(lastScheduledDateKey), 1);
    const futureKeys = createFutureDateKeys(start, futureDayCount);
    const entries: DateRenderEntry[] = [];

    scheduledKeys.forEach((dateKey, index) => {
      if (index > 0) {
        const prevKey = scheduledKeys[index - 1];
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
      entries.push({ type: "date", dateKey, hasTasks: true });
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
    lastScheduledDateKey,
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
        isTimed: taskHasExplicitTime(task),
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

      const updated = await updateTask(draggedTask.id, patch);
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
    [dragState, getBucketTasks, tasks],
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
      const updated = await updateTask(taskId, {
        title: currentTask?.title ?? "Task",
        ...payload,
      });
      if (updated.completed) {
        setTasks((prev) => prev.filter((task) => task.id !== taskId));
        return;
      }
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, ...updated } : task)),
      );
    },
    [tasks],
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
  }, []);

  const handleTaskDelete = useCallback(async (taskId: number) => {
    await deleteTask(taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, []);

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
      const created = await createTask({
        title: parsed.title,
        start_time: parsed.startTime,
        description: description || null,
        location: location || null,
      });
      setTasks((prev) => [created, ...prev]);
      setNewlyAddedTaskId(created.id);
      setNewTaskByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setNewDescriptionByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setNewLocationByDate((prev) => ({ ...prev, [dateKey]: "" }));
      setIsEditingDescriptionByDate((prev) => ({ ...prev, [dateKey]: false }));
      setIsEditingLocationByDate((prev) => ({ ...prev, [dateKey]: false }));
    } catch (createError) {
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
    const parsed = parseTaskInput(newUnscheduledTask);
    if (!parsed.title) {
      return;
    }

    setIsCreatingUnscheduled(true);
    setUnscheduledCreateError("");
    try {
      const description = newUnscheduledDescription.trim();
      const location = newUnscheduledLocation.trim();
      const created = await createTask({
        title: parsed.title,
        start_time: parsed.startTime,
        description: description || null,
        location: location || null,
      });
      setTasks((prev) => [created, ...prev]);
      setNewlyAddedTaskId(created.id);
      setNewUnscheduledTask("");
      setNewUnscheduledDescription("");
      setNewUnscheduledLocation("");
      setIsEditingUnscheduledDescription(false);
      setIsEditingUnscheduledLocation(false);
    } catch (createError) {
      setUnscheduledCreateError(
        createError instanceof Error ? createError.message : "Could not create task.",
      );
    } finally {
      setIsCreatingUnscheduled(false);
    }
  }

  const showUnscheduledComposerMeta =
    activeComposer === "unscheduled" ||
    newUnscheduledTask.trim() !== "" ||
    newUnscheduledDescription.trim() !== "" ||
    newUnscheduledLocation.trim() !== "" ||
    isEditingUnscheduledDescription ||
    isEditingUnscheduledLocation;
  const unscheduledTasks = getBucketTasks("unscheduled");

  function handleLogout() {
    localStorage.removeItem("auth_token");
    router.push("/");
  }

  return (
    <main className="tasksPage">
      <header className="tasksPageHeader">
        <h1 className="tasksPageTitle">whatdowhen</h1>
        <button type="button" className="logoutButton" onClick={handleLogout}>
          Logout
        </button>
      </header>
      {isLoading && <p className="statusMessage">Loading tasks...</p>}
      {error && <p className="statusMessage error">{error}</p>}

      {!isLoading && !error && (
        <div className="tasksContainer">
          <DateSection label="Unscheduled" defaultOpen>
            <div className="quickAddComposer">
              <div className="quickAddTopRow">
                <form
                  className="quickAddForm quickAddMainForm"
                  onSubmit={(event) => void handleCreateUnscheduledTask(event)}
                >
                  <span className="quickAddPlus">+</span>
                  <input
                    className="quickAddInput"
                    value={newUnscheduledTask}
                    onChange={(event) => setNewUnscheduledTask(event.target.value)}
                    onFocus={() => setActiveComposer("unscheduled")}
                    onBlur={() => {
                      setTimeout(() => {
                        const shouldKeepOpen =
                          newUnscheduledTask.trim() !== "" ||
                          newUnscheduledDescription.trim() !== "" ||
                          newUnscheduledLocation.trim() !== "" ||
                          isEditingUnscheduledDescription ||
                          isEditingUnscheduledLocation;
                        if (!shouldKeepOpen) {
                          setActiveComposer((prev) =>
                            prev === "unscheduled" ? null : prev,
                          );
                        }
                      }, 120);
                    }}
                    placeholder="Add task"
                  />
                </form>
                {showUnscheduledComposerMeta && (
                  <div className="quickAddLocationSlot">
                    {isEditingUnscheduledLocation ||
                    newUnscheduledLocation.trim() !== "" ? (
                      <input
                        className="taskMetaInlineInput quickAddMetaLocationInput"
                        value={newUnscheduledLocation}
                        onChange={(event) =>
                          setNewUnscheduledLocation(event.target.value)
                        }
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
                  </div>
                )}
              </div>
            </div>
            {showUnscheduledComposerMeta && (
              <div className="quickAddDescriptionRow">
                {isEditingUnscheduledDescription ||
                newUnscheduledDescription.trim() !== "" ? (
                  <input
                    className="taskMetaInlineInput"
                    value={newUnscheduledDescription}
                    onChange={(event) =>
                      setNewUnscheduledDescription(event.target.value)
                    }
                    onBlur={() => {
                      if (!newUnscheduledDescription.trim()) {
                        setIsEditingUnscheduledDescription(false);
                      }
                    }}
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
            {isCreatingUnscheduled && (
              <p className="statusMessage">Creating task...</p>
            )}

            {unscheduledTasks.length > 0 ? (
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
                {unscheduledTasks.map((task, index) => (
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
            ) : null}
          </DateSection>

          {dateEntries.map((entry, index) => {
            if (entry.type === "gap") {
              const gapLabel = `${formatDateShortLabelFromKey(entry.startKey)} - ${formatDateShortLabelFromKey(entry.endKey)}`;
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
            const dateTasks = getBucketTasks(dateKey);
            const composerKey = `date:${dateKey}`;
            const nextEntry = dateEntries[index + 1];
            const showComposerMeta =
              activeComposer === composerKey ||
              (newTaskByDate[dateKey] ?? "").trim() !== "" ||
              (newDescriptionByDate[dateKey] ?? "").trim() !== "" ||
              (newLocationByDate[dateKey] ?? "").trim() !== "" ||
              isEditingDescriptionByDate[dateKey] ||
              isEditingLocationByDate[dateKey];
            return (
              <DateSection
                key={dateKey}
                label={formatDateLabelFromKey(dateKey)}
                defaultOpen={dateTasks.length > 0}
                muted={!entry.hasTasks}
                suppressBottomDivider={
                  nextEntry?.type === "gap" || nextEntry?.type === "futureToggle"
                }
              >
                <div className="quickAddComposer">
                  <div className="quickAddTopRow">
                    <form
                      className="quickAddForm quickAddMainForm"
                      onSubmit={(event) => void handleCreateTaskForDate(event, dateKey)}
                    >
                      <span className="quickAddPlus">+</span>
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
                              !!isEditingDescriptionByDate[dateKey] ||
                              !!isEditingLocationByDate[dateKey];
                            if (!shouldKeepOpen) {
                              setActiveComposer((prev) =>
                                prev === composerKey ? null : prev,
                              );
                            }
                          }, 120);
                        }}
                        placeholder="Add task"
                      />
                    </form>
                    {showComposerMeta && (
                      <div className="quickAddLocationSlot">
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
                      </div>
                    )}
                  </div>
                </div>
                {showComposerMeta && (
                  <div className="quickAddDescriptionRow">
                    {isEditingDescriptionByDate[dateKey] ||
                    (newDescriptionByDate[dateKey] ?? "").trim() !== "" ? (
                      <input
                        className="taskMetaInlineInput"
                        value={newDescriptionByDate[dateKey] ?? ""}
                        onChange={(event) =>
                          setNewDescriptionByDate((prev) => ({
                            ...prev,
                            [dateKey]: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          if (!(newDescriptionByDate[dateKey] ?? "").trim()) {
                            setIsEditingDescriptionByDate((prev) => ({
                              ...prev,
                              [dateKey]: false,
                            }));
                          }
                        }}
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

                {creatingDateKey === dateKey && (
                  <p className="statusMessage">Creating task...</p>
                )}

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
                        {dropIndicator?.bucket === dateKey &&
                          dropIndicator.index === index && (
                            <div className="dropIndicatorLine" />
                          )}
                        <div
                          className={
                            dragState?.taskId === task.id
                              ? "taskDragWrapper isDragging"
                              : "taskDragWrapper"
                          }
                          draggable={
                            dragReadyTaskId === task.id && !editingTaskIds[task.id]
                          }
                          onDragStart={() => handleTaskDragStart(task, dateKey)}
                          onDragEnd={() => {
                            setDragState(null);
                            setDragReadyTaskId(null);
                            setDropIndicator(null);
                          }}
                          onDragOver={(event) =>
                            {
                              event.stopPropagation();
                              handleTaskRowDragOver(event, dateKey, index);
                            }
                          }
                          onDrop={(event) => {
                            event.stopPropagation();
                            void handleTaskDrop(
                              dateKey,
                              dropIndicator?.bucket === dateKey
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
                  {dropIndicator?.bucket === dateKey &&
                    dropIndicator.index === dateTasks.length && (
                      <div className="dropIndicatorLine" />
                    )}
                </div>
                {dateKey === lastScheduledDateKey && (
                  <div ref={lastTaskDayTriggerRef} className="lastTaskDayTrigger" />
                )}
              </DateSection>
            );
          })}

          <div ref={sentinelRef} className="scrollSentinel" />
        </div>
      )}
    </main>
  );
}
