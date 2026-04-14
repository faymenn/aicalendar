"use client";

import {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Task, TaskUpdateInput } from "@/lib/api";
import { hasSchedulingToken, parseTaskInput } from "@/lib/taskInputParser";
import { getDateKeyFromTask } from "@/lib/tasks";

type TaskItemProps = {
  task: Task;
  onSave: (taskId: number, payload: TaskUpdateInput) => Promise<void>;
  onDelete: (taskId: number) => Promise<void>;
  onComplete: (taskId: number) => Promise<void>;
  onDragHandleMouseDown?: () => void;
  onEditStateChange?: (taskId: number, isEditing: boolean) => void;
  forceShowMeta?: boolean;
  hideDragHandle?: boolean;
  showCompletedState?: boolean;
  completeAriaLabel?: string;
  timeLabel?: string | null;
  readOnly?: boolean;
};

function toInputValue(value: string | null) {
  return value ?? "";
}

function parseDateValue(value: string | null) {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  const localParts = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (localParts) {
    const year = Number(localParts[1]);
    const month = Number(localParts[2]) - 1;
    const day = Number(localParts[3]);
    const hour = Number(localParts[4] ?? "0");
    const minute = Number(localParts[5] ?? "0");
    const second = Number(localParts[6] ?? "0");
    return new Date(year, month, day, hour, minute, second);
  }
  const fallback = new Date(normalized);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }
  return fallback;
}

type DeadlineDisplay = {
  dateText: string;
  dayCount: number | null;
  isPast: boolean;
};

function formatDeadlineInputValue(value: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatDeadlineDisplay(value: string | null): DeadlineDisplay | null {
  const date = parseDateValue(value);
  if (!date) {
    return value ? { dateText: `Due at ${value}`, dayCount: null, isPast: false } : null;
  }

  const day = date.getDate();
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  const hasTime =
    date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const deadlineStart = new Date(date);
  deadlineStart.setHours(0, 0, 0, 0);
  const daysDiff = Math.round(
    (deadlineStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  const absDays = Math.abs(daysDiff);

  if (!hasTime) {
    return {
      dateText: `Due at ${day}${suffix} ${month}`,
      dayCount: absDays,
      isPast: daysDiff < 0,
    };
  }

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return {
    dateText: `Due at ${day}${suffix} ${month}, ${time}`,
    dayCount: absDays,
    isPast: daysDiff < 0,
  };
}

export default function TaskItem({
  task,
  onSave,
  onDelete,
  onComplete,
  onDragHandleMouseDown,
  onEditStateChange,
  forceShowMeta = false,
  hideDragHandle = false,
  showCompletedState = false,
  completeAriaLabel = "Mark task complete",
  timeLabel,
  readOnly = false,
}: TaskItemProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [locationDraft, setLocationDraft] = useState(toInputValue(task.location));
  const [deadlineDraft, setDeadlineDraft] = useState(
    formatDeadlineInputValue(task.deadline),
  );
  const skipDeadlineBlurSaveRef = useRef(false);
  const [descriptionDraft, setDescriptionDraft] = useState(
    toInputValue(task.description),
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function renderDeadlineLabel(value: string | null): ReactNode {
    const formatted = formatDeadlineDisplay(value);
    if (!formatted) {
      return null;
    }
    if (formatted.dayCount === null) {
      return formatted.dateText;
    }
    const unit = `day${formatted.dayCount === 1 ? "" : "s"}`;
    return (
      <>
        {formatted.dateText} (
        {formatted.isPast ? (
          <>
            <strong>{formatted.dayCount}</strong> {unit} ago
          </>
        ) : (
          <>
            in <strong>{formatted.dayCount}</strong> {unit}
          </>
        )}
        )
      </>
    );
  }

  const taskTime = useMemo(() => {
    if (timeLabel !== undefined) {
      return timeLabel;
    }
    const formatTime = (value: string | null) => {
      if (!value) {
        return null;
      }
      const date = new Date(value);
      const hasTime =
        date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
      if (!hasTime) {
        return null;
      }
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };
    const startLabel = formatTime(task.start_time);
    const endLabel = formatTime(task.end_time);
    if (startLabel && endLabel) {
      return `${startLabel} - ${endLabel}`;
    }
    if (startLabel) {
      return startLabel;
    }
    if (endLabel) {
      return endLabel;
    }
    if (!task.start_time && !task.end_time) {
      return null;
    }
    return null;
  }, [task.end_time, task.start_time, timeLabel]);

  async function saveChanges(payload: TaskUpdateInput, successText: string) {
    setIsError(false);
    setMessage("");
    try {
      await onSave(task.id, payload);
      setMessage(successText || "");
      return true;
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not save.");
      return false;
    }
  }

  async function saveTitleIfChanged() {
    const rawInput = titleDraft.trim();
    if (!rawInput) {
      setIsError(false);
      setMessage("");
      try {
        await onDelete(task.id);
      } catch (error) {
        setIsError(true);
        setMessage(error instanceof Error ? error.message : "Could not delete task.");
      }
      return;
    }

    if (hasSchedulingToken(rawInput)) {
      const parsed = parseTaskInput(rawInput, {
        defaultDateKey: getDateKeyFromTask(task),
      });
      const nextTitle = parsed.title || task.title;
      const payload: TaskUpdateInput = { title: nextTitle };
      if (parsed.startTime !== null) {
        payload.start_time = parsed.startTime;
      }
      if (parsed.endTime !== null) {
        payload.end_time = parsed.endTime;
      }
      await saveChanges(payload, "");
      setTitleDraft(nextTitle);
      return;
    }

    if (rawInput === task.title) {
      setTitleDraft(task.title);
      return;
    }
    await saveChanges({ title: rawInput }, "");
  }

  async function onTitleBlur() {
    await saveTitleIfChanged();
    setIsEditingTitle(false);
  }

  async function onCompleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      await onComplete(task.id);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not update task.");
    }
  }

  async function saveLocationIfChanged() {
    const nextLocation = locationDraft.trim();
    const currentLocation = task.location ?? "";
    if (nextLocation === currentLocation) {
      return;
    }
    await saveChanges(
      { location: nextLocation ? nextLocation : null, title: task.title },
      "",
    );
  }

  async function saveDescriptionIfChanged() {
    const nextDescription = descriptionDraft.trim();
    const currentDescription = task.description ?? "";
    if (nextDescription === currentDescription) {
      return;
    }
    await saveChanges(
      { description: nextDescription ? nextDescription : null, title: task.title },
      "",
    );
  }

  async function saveDeadlineIfChanged() {
    const nextDeadlineRaw = deadlineDraft.trim();
    if (!nextDeadlineRaw) {
      if (!task.deadline) {
        return true;
      }
      return saveChanges({ deadline: null, title: task.title }, "");
    }

    const parsed = parseTaskInput(`deadline ${nextDeadlineRaw}`, {
      defaultDateKey: getDateKeyFromTask(task),
    });
    if (!parsed.startTime) {
      setIsError(true);
      setMessage("Could not parse deadline. Try text like 'tomorrow 5pm'.");
      return false;
    }
    if (parsed.startTime === task.deadline) {
      return true;
    }
    const didSave = await saveChanges({ deadline: parsed.startTime, title: task.title }, "");
    if (didSave) {
      setDeadlineDraft(formatDeadlineInputValue(parsed.startTime));
    }
    return didSave;
  }

  async function onLocationBlur() {
    await saveLocationIfChanged();
    setIsEditingLocation(false);
  }

  async function onDescriptionBlur() {
    await saveDescriptionIfChanged();
    setIsEditingDescription(false);
  }

  async function onDeadlineBlur() {
    if (skipDeadlineBlurSaveRef.current) {
      skipDeadlineBlurSaveRef.current = false;
      return;
    }
    const didSave = await saveDeadlineIfChanged();
    if (didSave) {
      setIsEditingDeadline(false);
    }
  }

  async function onLocationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      await saveLocationIfChanged();
      setIsEditingLocation(false);
    }
    if (event.key === "Escape") {
      setLocationDraft(toInputValue(task.location));
      setIsEditingLocation(false);
    }
  }

  async function onDescriptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await saveDescriptionIfChanged();
      setIsEditingDescription(false);
    }
    if (event.key === "Escape") {
      setDescriptionDraft(toInputValue(task.description));
      setIsEditingDescription(false);
    }
  }

  async function onDeadlineKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      skipDeadlineBlurSaveRef.current = true;
      const didSave = await saveDeadlineIfChanged();
      if (didSave) {
        setIsEditingDeadline(false);
      } else {
        skipDeadlineBlurSaveRef.current = false;
      }
    }
    if (event.key === "Escape") {
      setDeadlineDraft(formatDeadlineInputValue(task.deadline));
      setIsEditingDeadline(false);
    }
  }

  async function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      await saveTitleIfChanged();
      setIsEditingTitle(false);
    }
    if (event.key === "Escape") {
      setTitleDraft(task.title);
      setIsEditingTitle(false);
    }
  }

  const showMetaPrompts = !readOnly && (isHovering || isEditingTitle || forceShowMeta);

  useEffect(() => {
    onEditStateChange?.(
      task.id,
      isEditingTitle || isEditingDescription || isEditingLocation || isEditingDeadline,
    );
  }, [
    isEditingDescription,
    isEditingDeadline,
    isEditingLocation,
    isEditingTitle,
    onEditStateChange,
    task.id,
  ]);

  return (
    <article
      className="taskItem"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="taskRow">
        {hideDragHandle ? (
          <span className="taskDragHandleSpacer" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="taskDragHandle"
            aria-label="Drag task"
            onMouseDown={() => onDragHandleMouseDown?.()}
          >
            ⋮⋮
          </button>
        )}
        <button
          type="button"
          className={showCompletedState ? "taskCompleteButton completed" : "taskCompleteButton"}
          onClick={onCompleteClick}
          aria-label={completeAriaLabel}
        >
          <span className="taskCompleteCheck">✔</span>
        </button>

        <div className="taskMain">
          <div className="taskMainLeft">
            {taskTime && <p className="taskTime">{taskTime}</p>}

            <div className="taskTextGroup">
              {readOnly ? (
                <p className="taskTitleReadonly">{task.title}</p>
              ) : isEditingTitle ? (
                <>
                  <input
                    className="taskMetaInlineInput taskTitleInlineInput"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => void onTitleBlur()}
                    onKeyDown={(event) => void onTitleKeyDown(event)}
                    autoFocus
                  />
                </>
              ) : (
                <button
                  type="button"
                  className="taskTitleButton"
                  onClick={() => setIsEditingTitle(true)}
                >
                  {task.title}
                </button>
              )}

              {readOnly ? (
                task.description ? (
                  <p className="taskDescriptionPreview readonly">{task.description}</p>
                ) : null
              ) : isEditingDescription ? (
                <textarea
                  className="taskMetaInlineInput taskMetaInlineTextarea"
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  onBlur={() => void onDescriptionBlur()}
                  onKeyDown={(event) => void onDescriptionKeyDown(event)}
                  autoFocus
                  rows={2}
                  placeholder="Add description"
                />
              ) : task.description ? (
                <button
                  type="button"
                  className="taskDescriptionPreview"
                  onClick={() => setIsEditingDescription(true)}
                >
                  {task.description}
                </button>
              ) : (
                showMetaPrompts && (
                  <button
                    type="button"
                    className="taskMetaGhostButton"
                    onClick={() => setIsEditingDescription(true)}
                  >
                    Add description
                  </button>
                )
              )}
            </div>
          </div>

          <div className="taskMetaColumn">
            {readOnly ? (
              task.location ? (
                <span className="taskLocation readonly">{task.location}</span>
              ) : null
            ) : isEditingLocation ? (
              <input
                className="taskMetaInlineInput taskLocationInput"
                value={locationDraft}
                onChange={(event) => setLocationDraft(event.target.value)}
                onBlur={() => void onLocationBlur()}
                onKeyDown={(event) => void onLocationKeyDown(event)}
                autoFocus
                placeholder="Add location"
              />
            ) : task.location ? (
              <button
                type="button"
                className="taskLocation"
                onClick={() => setIsEditingLocation(true)}
              >
                {task.location}
              </button>
            ) : (
              showMetaPrompts && (
                <button
                  type="button"
                  className="taskMetaGhostButton taskLocationGhost"
                  onClick={() => setIsEditingLocation(true)}
                >
                  Add location
                </button>
              )
            )}

            {readOnly ? (
              task.deadline ? (
                <span className="taskLocation taskDeadline readonly">
                  {renderDeadlineLabel(task.deadline)}
                </span>
              ) : null
            ) : isEditingDeadline ? (
              <input
                className="taskMetaInlineInput taskLocationInput taskDeadline"
                value={deadlineDraft}
                onChange={(event) => setDeadlineDraft(event.target.value)}
                onBlur={() => void onDeadlineBlur()}
                onKeyDown={(event) => void onDeadlineKeyDown(event)}
                placeholder="Set deadline"
              />
            ) : task.deadline ? (
              <button
                type="button"
                className="taskLocation taskDeadline"
                onClick={() => {
                  setDeadlineDraft(formatDeadlineInputValue(task.deadline));
                  setIsEditingDeadline(true);
                }}
              >
                {renderDeadlineLabel(task.deadline)}
              </button>
            ) : (
              showMetaPrompts && (
                <button
                  type="button"
                  className="taskMetaGhostButton taskLocationGhost"
                  onClick={() => {
                    setDeadlineDraft(formatDeadlineInputValue(task.deadline));
                    setIsEditingDeadline(true);
                  }}
                >
                  Add deadline
                </button>
              )
            )}
          </div>
        </div>
      </div>
      {message && (
        <p className={isError ? "statusMessage error" : "statusMessage"}>
          {message}
        </p>
      )}
    </article>
  );
}
