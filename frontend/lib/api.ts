import type {
  AiChatCallbacks,
  AiChatResult,
  ApiErrorBody,
  ApiPage,
  ChatSession,
  InviteParticipantResponse,
  Message,
  MessageType,
  SavedContact,
  SavedMessage,
  SessionType,
  User,
  UserSearchResult,
} from "@/types/api";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "")
).replace(/\/+$/, "");

if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured for production builds.");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code = "API_ERROR",
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken: string | undefined;
let csrfInFlight: Promise<string> | undefined;
let refreshInFlight: Promise<boolean> | undefined;

function isSafeMethod(method: string) {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function isAuthRoute(path: string) {
  return path.startsWith("/api/auth/");
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Non-JSON server and network errors still receive a stable client error.
  }
  return new ApiError(
    body.error?.message ?? `Request failed with status ${response.status}`,
    response.status,
    body.error?.code ?? "API_ERROR",
    body.error?.details,
  );
}

async function ensureCsrf(forceRefresh = false) {
  if (forceRefresh) csrfToken = undefined;
  if (csrfToken) return csrfToken;
  if (csrfInFlight) return csrfInFlight;
  csrfInFlight = (async () => {
    const response = await fetch(apiUrl("/api/auth/csrf"), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw await readError(response);
    const body = (await response.json()) as { csrfToken: string };
    csrfToken = body.csrfToken;
    return body.csrfToken;
  })().finally(() => {
    csrfInFlight = undefined;
  });
  return csrfInFlight;
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      await ensureCsrf();
      const response = await fetch(apiUrl("/api/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken ?? "" },
        cache: "no-store",
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { csrfToken: string };
      csrfToken = body.csrfToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = undefined;
    }
  })();
  return refreshInFlight;
}

async function rawRequest(
  path: string,
  init: RequestInit = {},
  canRefresh = true,
  canRetryCsrf = true,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!isSafeMethod(method)) {
    await ensureCsrf();
    headers.set("x-csrf-token", csrfToken ?? "");
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (
    response.status === 403 &&
    canRetryCsrf &&
    !isSafeMethod(method) &&
    (await isCsrfFailure(response))
  ) {
    await ensureCsrf(true);
    return rawRequest(path, init, canRefresh, false);
  }

  if (
    response.status === 401 &&
    canRefresh &&
    !isAuthRoute(path) &&
    (await refreshSession())
  ) {
    return rawRequest(path, init, false, canRetryCsrf);
  }
  return response;
}

async function isCsrfFailure(response: Response) {
  try {
    const body = (await response.clone().json()) as ApiErrorBody;
    return body.error?.code === "CSRF_INVALID";
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await rawRequest(path, init);
  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonBody(data: unknown): string {
  return JSON.stringify(data);
}

export const api = {
  baseUrl: API_BASE_URL,

  auth: {
    async csrf() {
      csrfToken = undefined;
      return ensureCsrf();
    },
    async register(input: {
      email: string;
      password: string;
      displayName?: string;
    }) {
      await ensureCsrf();
      const result = await request<{ data: User; csrfToken: string }>(
        "/api/auth/register",
        { method: "POST", headers: { "content-type": "application/json" }, body: jsonBody(input) },
      );
      csrfToken = result.csrfToken;
      return result.data;
    },
    async login(input: { email: string; password: string }) {
      await ensureCsrf();
      const result = await request<{ data: User; csrfToken: string }>(
        "/api/auth/login",
        { method: "POST", headers: { "content-type": "application/json" }, body: jsonBody(input) },
      );
      csrfToken = result.csrfToken;
      return result.data;
    },
    async refresh() {
      const result = await request<{ data: User; csrfToken: string }>(
        "/api/auth/refresh",
        { method: "POST" },
      );
      csrfToken = result.csrfToken;
      return result.data;
    },
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    requestPasswordReset: (email: string) =>
      request<{ data: { message: string } }>("/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ data: { message: string } }>("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ token, password }),
      }),
    googleLoginUrl: () => apiUrl("/api/auth/google"),
  },

  users: {
    current: async () => (await request<{ data: User }>("/api/users/me")).data,
    update: async (input: Pick<User, "displayName" | "username" | "bio">) =>
      (await request<{ data: User }>("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: jsonBody(input),
      })).data,
    uploadAvatar: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return (await request<{ data: User }>("/api/users/me/avatar", {
        method: "POST",
        body: form,
      })).data;
    },
    savedMessages: async () =>
      (await request<{ data: SavedMessage[] }>("/api/users/me/saved-messages")).data,
    saveMessage: async (messageId: string) =>
      (await request<{ data: SavedMessage }>("/api/users/me/saved-messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ messageId }),
      })).data,
    search: async (query: string) => {
      const params = new URLSearchParams({ q: query });
      return (await request<{ data: UserSearchResult[] }>(
        `/api/users/search?${params.toString()}`,
      )).data;
    },
    contacts: async () =>
      (await request<{ data: SavedContact[] }>("/api/users/me/contacts")).data,
    addContact: async (userId: string) =>
      (await request<{ data: SavedContact }>("/api/users/me/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ userId }),
      })).data,
    removeContact: (userId: string) =>
      request<void>(`/api/users/me/contacts/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      }),
  },

  sessions: {
    list: async (options: { limit?: number; cursor?: string } = {}) => {
      const query = new URLSearchParams();
      if (options.limit) query.set("limit", String(options.limit));
      if (options.cursor) query.set("cursor", options.cursor);
      const suffix = query.size ? `?${query.toString()}` : "";
      return (await request<{ data: ApiPage<ChatSession> }>(`/api/sessions${suffix}`)).data;
    },
    create: async (input: {
      type: SessionType;
      title?: string;
      participantIds?: string[];
    }) =>
      (await request<{ data: ChatSession }>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody(input),
      })).data,
    get: async (sessionId: string, options: { limit?: number; cursor?: string } = {}) => {
      const query = new URLSearchParams();
      if (options.limit) query.set("limit", String(options.limit));
      if (options.cursor) query.set("cursor", options.cursor);
      const suffix = query.size ? `?${query.toString()}` : "";
      return (await request<{
        data: { session: ChatSession; messages: Message[]; nextCursor: string | null };
      }>(`/api/sessions/${encodeURIComponent(sessionId)}${suffix}`)).data;
    },
    rename: async (sessionId: string, title: string) =>
      (await request<{ data: ChatSession }>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: jsonBody({ title }),
      })).data,
    updateGroupProfile: async (
      sessionId: string,
      input: { title: string; description: string | null },
    ) =>
      (await request<{ data: ChatSession }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/profile`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: jsonBody(input),
        },
      )).data,
    uploadGroupAvatar: async (sessionId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return (await request<{ data: ChatSession }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/avatar`,
        { method: "POST", body: formData },
      )).data;
    },
    delete: (sessionId: string) =>
      request<void>(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
    invite: async (sessionId: string, userId: string) =>
      (await request<{ data: InviteParticipantResponse }>(`/api/sessions/${encodeURIComponent(sessionId)}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ userId }),
      })).data,
    removeParticipant: async (sessionId: string, userId: string) =>
      (await request<{ data: { removed: boolean } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      )).data,
    leave: async (sessionId: string) =>
      (await request<{ data: { deleted: boolean } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/leave`,
        { method: "POST" },
      )).data,
    addAi: async (sessionId: string) =>
      (await request<{ data: { added: boolean; participantId: string } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/ai`,
        { method: "POST" },
      )).data,
  },

  messages: {
    list: async (sessionId: string, options: { limit?: number; cursor?: string } = {}) => {
      const query = new URLSearchParams();
      if (options.limit) query.set("limit", String(options.limit));
      if (options.cursor) query.set("cursor", options.cursor);
      const suffix = query.size ? `?${query.toString()}` : "";
      return (await request<{ data: ApiPage<Message> }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages${suffix}`,
      )).data;
    },
    send: async (sessionId: string, input: {
      content: string;
      type?: MessageType;
      receiverId?: string;
    }) =>
      (await request<{ data: Message }>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody(input),
      })).data,
    markRead: async (sessionId: string, messageId: string) =>
      (await request<{ data: { updated: boolean; messageId: string; readAt?: string } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/read`,
        { method: "PATCH" },
      )).data,
    delete: async (sessionId: string, messageId: string) =>
      (await request<{ data: { deletedMessageId: string } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      )).data,
    update: async (sessionId: string, messageId: string, content: string) =>
      (await request<{ data: Message }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: jsonBody({ content }),
        },
      )).data,
    clearHistory: async (sessionId: string) =>
      (await request<{ data: { hiddenCount: number } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
        { method: "DELETE" },
      )).data,
  },

  files: {
    upload: async (sessionId: string, file: File) => {
      const form = new FormData();
      form.set("file", file);
      return (await request<{ data: Message }>(`/api/sessions/${encodeURIComponent(sessionId)}/files`, {
        method: "POST",
        body: form,
      })).data;
    },
    downloadUrl: (sessionId: string, fileId: string) =>
      apiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`),
    async download(sessionId: string, fileId: string) {
      const response = await rawRequest(
        `/api/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`,
      );
      if (!response.ok) throw await readError(response);
      return response.blob();
    },
  },

  ai: {
    async chat(
      sessionId: string,
      message: string,
      callbacks: AiChatCallbacks,
      signal?: AbortSignal,
    ): Promise<AiChatResult> {
      const response = await rawRequest("/api/ai/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: jsonBody({ sessionId, message }),
        signal,
      });
      if (!response.ok) throw await readError(response);
      if (!response.body) throw new ApiError("The AI stream was empty.", response.status);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: AiChatResult | undefined;
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary).replace(/\r/g, "");
            buffer = buffer.slice(boundary + 2);
            let eventName = "message";
            const data: string[] = [];
            for (const line of frame.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              if (line.startsWith("data:")) data.push(line.slice(5).trim());
            }
            const payload = data.join("\n");
            if (payload) {
              const parsed = JSON.parse(payload) as Record<string, unknown>;
              if (eventName === "meta") {
                callbacks.onMeta?.(parsed as { sessionId: string; messageId: string });
              } else if (eventName === "token" && typeof parsed.delta === "string") {
                callbacks.onToken?.(parsed.delta);
              } else if (eventName === "done") {
                result = parsed as unknown as AiChatResult;
                callbacks.onDone?.(result);
              } else if (eventName === "error") {
                throw new ApiError(
                  typeof parsed.message === "string" ? parsed.message : "The AI response failed.",
                  502,
                  typeof parsed.code === "string" ? parsed.code : "LLM_ERROR",
                );
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!result) throw new ApiError("The AI stream ended before completing.", 502);
      return result;
    },
  },

  health: {
    live: () => request<{ status: "ok" }>("/health"),
    ready: () => request<{ status: "ready" | "not_ready" }>("/health/ready"),
  },
};
