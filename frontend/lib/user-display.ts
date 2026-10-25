import type { User } from "@/types/api";

export function userDisplayName(user: Pick<User, "username" | "displayName" | "email">) {
  return user.username ? `@${user.username}` : user.displayName || user.email;
}
