import type { MessageType, UserStatus } from "@prisma/client";

export interface SessionPayload {
  sessionId: string;
}

export interface SendMessagePayload extends SessionPayload {
  content: string;
  type?: MessageType;
  receiverId?: string;
}

export interface ReadMessagePayload extends SessionPayload {
  messageId: string;
}

export interface StatusUpdatePayload {
  status: Extract<UserStatus, "ONLINE" | "AWAY">;
}

export interface RealtimeMessage {
  id: string;
  sessionId: string;
  senderId: string | null;
  receiverId: string | null;
  role: string;
  type: MessageType;
  content: string;
  isRead: boolean;
  readAt: Date | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: Date;
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  readReceipts?: Array<{ userId: string; readAt: Date }>;
}

export interface SendMessageAcknowledgement {
  message?: RealtimeMessage;
  error?: { code: string; message: string };
}

export interface ClientToServerEvents {
  "session:join": (payload: SessionPayload) => void;
  "session:leave": (payload: SessionPayload) => void;
  "message:send": (
    payload: SendMessagePayload,
    acknowledge?: (result: SendMessageAcknowledgement) => void,
  ) => void;
  "message:read": (payload: ReadMessagePayload) => void;
  "typing:start": (payload: SessionPayload) => void;
  "typing:stop": (payload: SessionPayload) => void;
  "status:update": (payload: StatusUpdatePayload) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: RealtimeMessage) => void;
  "message:updated": (message: RealtimeMessage) => void;
  "ai:error": (payload: { sessionId: string; code: string; message: string }) => void;
  "session:added": (payload: { sessionId: string }) => void;
  "session:deleted": (payload: { sessionId: string }) => void;
  "message:deleted": (payload: {
    sessionId: string;
    messageId: string;
    deletedBy: string;
  }) => void;
  "message:read": (payload: ReadMessagePayload & {
    userId: string;
    readAt: string;
  }) => void;
  "notification:new": (payload: {
    messageId: string;
    sessionId: string;
    senderId: string;
    preview: string;
    createdAt: string;
  }) => void;
  "user:typing": (payload: {
    sessionId: string;
    userId: string;
    isTyping: boolean;
  }) => void;
  "user:status": (payload: {
    userId: string;
    status: UserStatus;
    lastSeen: string;
  }) => void;
  "users:online": (userIds: string[]) => void;
  "socket:error": (payload: { code: string; message: string }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}
