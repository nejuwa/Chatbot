export type UserStatus = "ONLINE" | "AWAY" | "OFFLINE";
export type SessionType = "DIRECT" | "GROUP" | "AI";
export type ParticipantRole = "OWNER" | "ADMIN" | "MEMBER";
export type MessageType = "TEXT" | "IMAGE" | "FILE" | "VOICE" | "VIDEO" | "SYSTEM";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeen: string | null;
}

export type UserSearchResult = Pick<
  User,
  "id" | "email" | "displayName" | "username" | "avatarUrl" | "status"
>;
export type SavedContact = Pick<
  User,
  "id" | "email" | "displayName" | "username" | "avatarUrl" | "status" | "lastSeen"
>;

export interface SessionParticipant {
  id: string;
  role: ParticipantRole;
  joinedAt: string;
  lastReadAt: string | null;
  user: Pick<User, "id" | "email" | "displayName" | "username" | "bio" | "avatarUrl" | "status" | "lastSeen">;
}

export interface MessageReadReceipt {
  userId: string;
  readAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  senderId: string | null;
  receiverId: string | null;
  role: MessageRole;
  type: MessageType;
  content: string;
  isRead: boolean;
  readAt: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
  sender: Pick<User, "id" | "email" | "displayName" | "username" | "avatarUrl"> | null;
  readReceipts?: MessageReadReceipt[];
}

export interface SavedMessage {
  userId: string;
  messageId: string;
  savedAt: string;
  message: Message;
}

export interface ChatSession {
  id: string;
  type: SessionType;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  users: SessionParticipant[];
  messages?: Array<Pick<Message, "id" | "senderId" | "type" | "content" | "createdAt">>;
  mediaCounts?: { photos: number; videos: number; files: number; voice: number };
}

export interface InviteParticipantResponse {
  id: string;
  role: ParticipantRole;
  joinedAt: string;
  lastReadAt: string | null;
  user: Pick<User, "id" | "email" | "displayName" | "avatarUrl">;
}

export interface ApiPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, string[]>;
  };
}

export interface AiChatResult {
  messageId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface AiChatCallbacks {
  onMeta?: (meta: { sessionId: string; messageId: string }) => void;
  onToken?: (delta: string) => void;
  onDone?: (result: AiChatResult) => void;
}
