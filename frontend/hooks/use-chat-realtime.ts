"use client";

import { useEffect, useRef } from "react";
import { useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import type { Message, UserStatus } from "@/types/api";
import { api, ApiError } from "@/lib/api";

interface ServerToClientEvents {
  "message:new": (message: Message) => void;
  "message:updated": (message: Message) => void;
  "ai:error": (payload: { sessionId: string; code: string; message: string }) => void;
  "session:added": (payload: { sessionId: string }) => void;
  "session:deleted": (payload: { sessionId: string }) => void;
  "message:deleted": (payload: { sessionId: string; messageId: string; deletedBy: string }) => void;
  "message:read": (payload: { sessionId: string; messageId: string; userId: string; readAt: string }) => void;
  "notification:new": (payload: {
    messageId: string;
    sessionId: string;
    senderId: string;
    preview: string;
    createdAt: string;
  }) => void;
  "socket:error": (payload: { code: string; message: string }) => void;
  "user:typing": (payload: { sessionId: string; userId: string; isTyping: boolean }) => void;
  "user:status": (payload: { userId: string; status: UserStatus; lastSeen: string }) => void;
  "users:online": (userIds: string[]) => void;
}

interface SendMessageAck {
  message?: Message;
  error?: { code: string; message: string };
}

interface ClientToServerEvents {
  "session:join": (payload: { sessionId: string }) => void;
  "message:send": (
    payload: { sessionId: string; content: string; receiverId?: string },
    acknowledge: (result: SendMessageAck) => void,
  ) => void;
  "typing:start": (payload: { sessionId: string }) => void;
  "typing:stop": (payload: { sessionId: string }) => void;
  "status:update": (payload: { status: "ONLINE" | "AWAY" }) => void;
}

interface RealtimeHandlers {
  activeSessionId: string | null;
  onConnectionState: (state: "connecting" | "connected" | "reconnecting" | "disconnected") => void;
  onMessage: (message: Message) => void;
  onMessageUpdated: (message: Message) => void;
  onSessionDeleted: (sessionId: string) => void;
  onSessionChanged: () => void;
  onMessageDeleted: (sessionId: string, messageId: string) => void;
  onMessageRead: (sessionId: string, messageId: string, userId: string, readAt: string) => void;
  onError: (message: string) => void;
  onRecovered: (reconnected: boolean) => void;
  onTyping: (sessionId: string, userId: string, isTyping: boolean) => void;
  onUserStatus: (userId: string, status: UserStatus, lastSeen: string) => void;
  onUsersOnline: (userIds: string[]) => void;
  onNotification: (message: Message) => void;
  onNotificationPreview: (notification: {
    messageId: string;
    sessionId: string;
    senderId: string;
    preview: string;
  }) => void;
}

export function useChatRealtime(userId: string | undefined, handlers: RealtimeHandlers) {
  const activeSessionId = handlers.activeSessionId;
  const handlersRef = useRef(handlers);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const typingSessionRef = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;

    handlersRef.current.onConnectionState("connecting");
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(api.baseUrl, {
      withCredentials: true,
      autoConnect: false,
    });
    socketRef.current = socket;
    let refreshingAuth = false;
    let hasConnected = false;

    socket.on("connect", () => {
      const reconnected = hasConnected;
      hasConnected = true;
      const activeSessionId = handlersRef.current.activeSessionId;
      if (activeSessionId) socket.emit("session:join", { sessionId: activeSessionId });
      handlersRef.current.onConnectionState("connected");
      handlersRef.current.onRecovered(reconnected);
    });
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") {
        handlersRef.current.onConnectionState("reconnecting");
        handlersRef.current.onError("Live updates disconnected. Reconnecting…");
      } else {
        handlersRef.current.onConnectionState("disconnected");
      }
    });
    socket.on("connect_error", (cause) => {
      handlersRef.current.onConnectionState("reconnecting");
      if (cause.message !== "Unauthorized") {
        handlersRef.current.onError("Live updates disconnected. Reconnecting…");
        return;
      }
      if (refreshingAuth) return;
      refreshingAuth = true;
      void api.sessions.list({ limit: 1 })
        .then(() => socket.connect())
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) {
            handlersRef.current.onError("Your session expired. Please sign in again.");
          } else {
            handlersRef.current.onError("Live updates could not connect.");
          }
        })
        .finally(() => {
          refreshingAuth = false;
        });
    });
    socket.on("message:new", (message) => {
      if (message.sessionId === handlersRef.current.activeSessionId) {
        handlersRef.current.onMessage(message);
      } else if (message.senderId !== userId) {
        handlersRef.current.onNotification(message);
      }
      handlersRef.current.onSessionChanged();
    });
    socket.on("message:updated", (message) => {
      if (message.sessionId === handlersRef.current.activeSessionId) {
        handlersRef.current.onMessageUpdated(message);
      }
    });
    socket.on("notification:new", (notification) =>
      handlersRef.current.onNotificationPreview(notification),
    );
    socket.on("session:added", () => handlersRef.current.onSessionChanged());
    socket.on("session:deleted", ({ sessionId }) =>
      handlersRef.current.onSessionDeleted(sessionId),
    );
    socket.on("message:deleted", ({ sessionId, messageId }) =>
      handlersRef.current.onMessageDeleted(sessionId, messageId),
    );
    socket.on("message:read", ({ sessionId, messageId, userId: readerId, readAt }) =>
      handlersRef.current.onMessageRead(sessionId, messageId, readerId, readAt),
    );
    socket.on("ai:error", ({ sessionId, message }) => {
      if (sessionId === handlersRef.current.activeSessionId) {
        handlersRef.current.onError(message);
      }
    });
    socket.on("socket:error", ({ message }) => handlersRef.current.onError(message));
    socket.on("user:typing", ({ sessionId, userId: typingUserId, isTyping }) =>
      handlersRef.current.onTyping(sessionId, typingUserId, isTyping),
    );
    socket.on("user:status", ({ userId: statusUserId, status, lastSeen }) =>
      handlersRef.current.onUserStatus(statusUserId, status, lastSeen),
    );
    socket.on("users:online", (onlineUserIds) => handlersRef.current.onUsersOnline(onlineUserIds));

    const updateStatus = () => {
      socket.emit("status:update", {
        status: document.visibilityState === "visible" ? "ONLINE" : "AWAY",
      });
    };
    socket.on("connect", updateStatus);
    document.addEventListener("visibilitychange", updateStatus);

    socket.connect();
    return () => {
      document.removeEventListener("visibilitychange", updateStatus);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      socketRef.current = null;
      socket.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.connected && activeSessionId) {
      socket.emit("session:join", { sessionId: activeSessionId });
    }
  }, [activeSessionId, userId]);

  const sendRealtimeMessage = useCallback((
    sessionId: string,
    content: string,
    receiverId?: string,
  ) => new Promise<Message>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      reject(new Error("Live chat is reconnecting. Please try again when it is connected."));
      return;
    }

    socket.timeout(10_000).emit(
      "message:send",
      { sessionId, content, ...(receiverId ? { receiverId } : {}) },
      (timeoutError, response) => {
        if (timeoutError) {
          reject(new Error("The message could not be sent over the live connection. Please retry."));
          return;
        }
        if (response.error) {
          reject(new ApiError(response.error.message, 400, response.error.code));
          return;
        }
        if (!response.message) {
          reject(new Error("The live connection returned an invalid message response."));
          return;
        }
        resolve(response.message);
      },
    );
  }), []);

  const setTyping = useCallback((sessionId: string | null, typing: boolean) => {
    if (!sessionId) return;
    const socket = socketRef.current;
    if (typing) {
      if (typingSessionRef.current !== sessionId) {
        if (typingSessionRef.current) {
          socket?.emit("typing:stop", { sessionId: typingSessionRef.current });
        }
        typingSessionRef.current = sessionId;
        socket?.emit("typing:start", { sessionId });
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        socketRef.current?.emit("typing:stop", { sessionId });
        typingSessionRef.current = null;
        typingTimerRef.current = null;
      }, 1800);
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingSessionRef.current === sessionId) {
        socket?.emit("typing:stop", { sessionId });
        typingSessionRef.current = null;
      }
      typingTimerRef.current = null;
    }
  }, []);

  return { setTyping, sendRealtimeMessage };
}
