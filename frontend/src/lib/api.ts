const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export class AuthExpiredError extends Error {
  constructor(message = "Session expired. Please log in again.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

export type Task = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  deadline: string | null;
  completed_at: string | null;
  owner_id: number;
  created_at: string;
  updated_at: string | null;
};

export type TaskUpdateInput = {
  title?: string;
  description?: string | null;
  location?: string | null;
  completed?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  deadline?: string | null;
  completed_at?: string | null;
};

export type TaskCreateInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  completed?: boolean;
  deadline?: string | null;
  completed_at?: string | null;
};

function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("auth_token");
}

function clearAuthToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("auth_token");
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = window.atob(normalized + padding);
    return JSON.parse(decoded) as { exp?: number };
  } catch {
    return null;
  }
}

export function getTokenExpiryMs(token: string) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return null;
  }
  return payload.exp * 1000;
}

function isTokenExpired(token: string) {
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) {
    return false;
  }
  return Date.now() >= expiryMs;
}

function buildHeaders(contentType = "application/json") {
  const token = getAuthToken();
  if (!token) {
    throw new AuthExpiredError("You are not logged in.");
  }
  if (isTokenExpired(token)) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": contentType,
  };
}

function parseErrorDetail(detail: unknown) {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === "string") {
      return first.msg;
    }
  }
  if (detail && typeof detail === "object") {
    return "Request failed due to invalid data.";
  }
  return "Request failed.";
}

export async function fetchTasks(limit = 2000, skip = 0): Promise<Task[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/tasks/?limit=${limit}&skip=${skip}`,
    {
      method: "GET",
      headers: buildHeaders("application/json"),
      cache: "no-store",
    },
  );

  if (response.status === 401) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }

  return (await response.json()) as Task[];
}

export async function updateTask(
  taskId: number,
  payload: TaskUpdateInput,
): Promise<Task> {
  const response = await fetch(`${getApiBaseUrl()}/tasks/${taskId}`, {
    method: "PUT",
    headers: buildHeaders("application/json"),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }

  return (await response.json()) as Task;
}

export async function createTask(payload: TaskCreateInput): Promise<Task> {
  const response = await fetch(`${getApiBaseUrl()}/tasks/`, {
    method: "POST",
    headers: buildHeaders("application/json"),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }

  return (await response.json()) as Task;
}

export type AITaskPlanResponse = {
  end_loop: boolean;
  assistant_message: string;
  thread_id: string;
  proposed_tasks: TaskCreateInput[];
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number | null;
  chat_limit: number;
  chat_used: number;
  chat_remaining: number | null;
};

export type AIUsageStatus = {
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number | null;
  chat_limit: number;
  chat_used: number;
  chat_remaining: number | null;
  enabled: boolean;
};

export async function fetchAiUsage(threadId?: string | null): Promise<AIUsageStatus> {
  const query = threadId ? `?thread_id=${encodeURIComponent(threadId)}` : "";
  const response = await fetch(`${getApiBaseUrl()}/ai/usage${query}`, {
    method: "GET",
    headers: buildHeaders("application/json"),
    cache: "no-store",
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }

  return (await response.json()) as AIUsageStatus;
}

export async function planTasksWithAi(
  message: string,
  threadId?: string | null,
): Promise<AITaskPlanResponse> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await fetch(`${getApiBaseUrl()}/ai/tasks`, {
    method: "POST",
    headers: buildHeaders("application/json"),
    body: JSON.stringify({
      message,
      thread_id: threadId || null,
      timezone,
    }),
    cache: "no-store",
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }

  const payload = (await response.json()) as AITaskPlanResponse;
  return {
    ...payload,
    proposed_tasks: payload.proposed_tasks.map(normalizeProposedTaskDatetimes),
  };
}

function normalizeProposedTaskDatetimes(task: TaskCreateInput): TaskCreateInput {
  return {
    ...task,
    start_time: asNaiveLocalDateTime(task.start_time),
    end_time: asNaiveLocalDateTime(task.end_time),
    deadline: asNaiveLocalDateTime(task.deadline),
    completed_at: asNaiveLocalDateTime(task.completed_at),
  };
}

function asNaiveLocalDateTime(value?: string | null) {
  if (!value) {
    return value ?? null;
  }
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value);
  return match ? match[1] : value;
}

export async function deleteTask(taskId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/tasks/${taskId}`, {
    method: "DELETE",
    headers: buildHeaders("application/json"),
    cache: "no-store",
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }
}
