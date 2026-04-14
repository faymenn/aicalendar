"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TaskItem from "@/components/TaskItem";
import {
  AuthExpiredError,
  deleteTask,
  fetchTasks,
  getTokenExpiryMs,
  Task,
  TaskUpdateInput,
  updateTask,
} from "@/lib/api";

function getCompletedTimestamp(task: Task) {
  const value = task.completed_at ?? task.updated_at ?? task.created_at;
  return new Date(value).getTime();
}

function formatTaskDateAndTime(task: Task) {
  const value = task.start_time ?? task.end_time ?? task.deadline ?? task.completed_at;
  if (!value) {
    return null;
  }
  const date = new Date(value);
  const hasTime =
    date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;

  if (!hasTime) {
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CompletedPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const hasRedirectedForAuthRef = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (hasRedirectedForAuthRef.current) {
      return;
    }
    hasRedirectedForAuthRef.current = true;
    localStorage.removeItem("auth_token");
    router.push("/");
  }, [router]);

  const handleAuthError = useCallback(
    (nextError: unknown) => {
      if (nextError instanceof AuthExpiredError) {
        redirectToLogin();
        return true;
      }
      return false;
    },
    [redirectToLogin],
  );

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
        const data = await fetchTasks(600, 0);
        if (isMounted) {
          setTasks(data.filter((task) => task.completed));
        }
      } catch (loadError) {
        if (handleAuthError(loadError)) {
          return;
        }
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load completed tasks.",
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

  const completedTasks = useMemo(
    () => [...tasks].sort((a, b) => getCompletedTimestamp(b) - getCompletedTimestamp(a)),
    [tasks],
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

      if (!updated.completed) {
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

  const handleTaskDelete = useCallback(
    async (taskId: number) => {
      try {
        await deleteTask(taskId);
      } catch (deleteError) {
        if (handleAuthError(deleteError)) {
          return;
        }
        throw deleteError;
      }
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
    },
    [handleAuthError],
  );

  const handleTaskUncomplete = useCallback(
    async (taskId: number) => {
      let removedTask: Task | undefined;
      setTasks((prev) => {
        removedTask = prev.find((task) => task.id === taskId);
        return prev.filter((task) => task.id !== taskId);
      });

      try {
        await updateTask(taskId, {
          title: removedTask?.title ?? "Task",
          completed: false,
        });
      } catch (updateError) {
        if (handleAuthError(updateError)) {
          return;
        }
        if (removedTask) {
          setTasks((prev) => [removedTask as Task, ...prev]);
        }
        setError(
          updateError instanceof Error ? updateError.message : "Could not restore task.",
        );
        throw updateError;
      }
    },
    [handleAuthError],
  );

  function handleLogout() {
    localStorage.removeItem("auth_token");
    router.push("/");
  }

  return (
    <main className="tasksPage">
      <header className="tasksPageHeader">
        <h1 className="tasksPageTitle">whatdowhen</h1>
        <div className="tasksHeaderActions">
          <Link href="/tasks" className="logoutButton">
            Tasks
          </Link>
          <button type="button" className="logoutButton" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {isLoading && <p className="statusMessage">Loading completed tasks...</p>}
      {error && <p className="statusMessage error">{error}</p>}

      {!isLoading && !error && (
        <section className="dateSection noDivider">
          <div className="dateBanner">
            <span className="dateLabel">Completed</span>
          </div>
          <div className="dateTasks">
            {completedTasks.length === 0 && (
              <p className="emptyText">No completed tasks yet.</p>
            )}
            {completedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onSave={handleTaskSave}
                onDelete={handleTaskDelete}
                onComplete={handleTaskUncomplete}
                hideDragHandle
                showCompletedState
                completeAriaLabel="Mark task as active"
                timeLabel={formatTaskDateAndTime(task)}
                readOnly
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
