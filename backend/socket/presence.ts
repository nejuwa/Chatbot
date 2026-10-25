export class PresenceRegistry {
  private readonly socketsByUser = new Map<string, Set<string>>();

  add(userId: string, socketId: string) {
    let socketIds = this.socketsByUser.get(userId);
    const becameOnline = !socketIds;

    if (!socketIds) {
      socketIds = new Set();
      this.socketsByUser.set(userId, socketIds);
    }

    socketIds.add(socketId);
    return becameOnline;
  }

  remove(userId: string, socketId: string) {
    const socketIds = this.socketsByUser.get(userId);
    if (!socketIds) {
      return false;
    }

    socketIds.delete(socketId);
    if (socketIds.size > 0) {
      return false;
    }

    this.socketsByUser.delete(userId);
    return true;
  }

  has(userId: string) {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  socketIds(userId: string) {
    return [...(this.socketsByUser.get(userId) ?? [])];
  }

  onlineUserIds(userIds: Iterable<string>) {
    return [...new Set(userIds)].filter((userId) => this.has(userId));
  }
}
