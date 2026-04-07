"use client";

import {
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Task, TaskUpdateInput } from "@/lib/api";
import { parseTaskInput } from "@/lib/taskInputParser";

type TaskItemProps = {
  task: Task;
  onSave: (taskId: number, payload: TaskUpdateInput) => Promise<void>;
  onDelete: (taskId: number) => Promise<void>;
  onComplete: (taskId: number) => Promise<void>;
  onDragHandleMouseDown?: () => void;
  onEditStateChange?: (taskId: number, isEditing: boolean) => void;
  forceShowMeta?: boolean;
};

function toInputValue(value: string | null) {
  return value ?? "";
}

function hasSchedulingToken(text: string) {
  return /\b(today|tomorrow|sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|\d{4}-\d{2}-\d{2}|\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2})\b/i.test(
    text,
  );
}

function getDateKeyFromTask(task: Task) {
  const value = task.start_time ?? task.end_time;
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TaskItem({
  task,
  onSave,
  onDelete,
  onComplete,
  onDragHandleMouseDown,
  onEditStateChange,
  forceShowMeta = false,
}: TaskItemProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [locationDraft, setLocationDraft] = useState(toInputValue(task.location));
  const [descriptionDraft, setDescriptionDraft] = useState(
    toInputValue(task.description),
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const taskTime = useMemo(() => {
    const baseValue = task.start_time ?? task.end_time;
    if (!baseValue) {
      return null;
    }
    const date = new Date(baseValue);
    const hasTime =
      date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    if (!hasTime) {
      return null;
    }
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [task.end_time, task.start_time]);

  async function saveChanges(payload: TaskUpdateInput, successText: string) {
    setIsError(false);
    setMessage("");
    try {
      await onSave(task.id, payload);
      setMessage(successText || "");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not save.");
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
      setMessage(error instanceof Error ? error.message : "Could not complete task.");
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

  async function onLocationBlur() {
    await saveLocationIfChanged();
    setIsEditingLocation(false);
  }

  async function onDescriptionBlur() {
    await saveDescriptionIfChanged();
    setIsEditingDescription(false);
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

  async function onDescriptionKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      await saveDescriptionIfChanged();
      setIsEditingDescription(false);
    }
    if (event.key === "Escape") {
      setDescriptionDraft(toInputValue(task.description));
      setIsEditingDescription(false);
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

  const showMetaPrompts = isHovering || isEditingTitle || forceShowMeta;

  useEffect(() => {
    onEditStateChange?.(
      task.id,
      isEditingTitle || isEditingDescription || isEditingLocation,
    );
  }, [
    isEditingDescription,
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
        <button
          type="button"
          className="taskDragHandle"
          aria-label="Drag task"
          onMouseDown={() => onDragHandleMouseDown?.()}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          className="taskCompleteButton"
          onClick={onCompleteClick}
          aria-label="Mark task complete"
        >
          <span className="taskCompleteCheck">✓</span>
        </button>

        <div className="taskMain">
          <div className="taskMainLeft">
            {taskTime && <p className="taskTime">{taskTime}</p>}

            <div className="taskTextGroup">
              {isEditingTitle ? (
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

              {isEditingDescription ? (
                <input
                  className="taskMetaInlineInput"
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  onBlur={() => void onDescriptionBlur()}
                  onKeyDown={(event) => void onDescriptionKeyDown(event)}
                  autoFocus
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

          {isEditingLocation ? (
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
