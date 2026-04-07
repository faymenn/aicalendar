const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export type Task = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
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
};

export type TaskCreateInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  completed?: boolean;
};

function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("auth_token");
}

function buildHeaders(contentType = "application/json") {
  const token = getAuthToken();
  if (!token) {
    throw new Error("You are not logged in.");
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

export async function fetchTasks(limit = 300, skip = 0): Promise<Task[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/tasks/?limit=${limit}&skip=${skip}`,
    {
      method: "GET",
      headers: buildHeaders("application/json"),
    },
  );

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
  });

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
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }

  return (await response.json()) as Task;
}

export async function deleteTask(taskId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/tasks/${taskId}`, {
    method: "DELETE",
    headers: buildHeaders("application/json"),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    throw new Error(parseErrorDetail(errorBody?.detail));
  }
}
