import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  RealtimeMessage,
  SendMessageAcknowledgement,
  ServerToClientEvents,
} from "../socket/types.js";
import "dotenv/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}
process.env.JWT_SECRET ||= "integration-test-secret-that-is-at-least-32-characters";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function waitForSocketEvent<T>(
  subscribe: (handler: (payload: T) => void) => void,
  unsubscribe: (handler: (payload: T) => void) => void,
  matches: (payload: T) => boolean = () => true,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe(handler);
      reject(new Error("Timed out waiting for Socket.IO event"));
    }, 5_000);
    const handler = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timeout);
      unsubscribe(handler);
      resolve(payload);
    };
    subscribe(handler);
  });
}

test(
  "database-backed auth, two-user Socket.IO messaging and presence, receipts, and private file access",
  { skip: !testDatabaseUrl },
  async () => {
    const [{ createApp }, { prisma }, { createSocketServer }, { env }] = await Promise.all([
      import("../app.js"),
      import("../config/prisma.js"),
      import("../socket/index.js"),
      import("../config/env.js"),
    ]);
    const server = createServer(createApp());
    const ioServer = createSocketServer(server);
    const sockets: TestSocket[] = [];
    const emails = [0, 1, 2].map(
      () => `integration-${randomUUID()}@example.invalid`,
    );
    const userIds: string[] = [];
    let sessionId: string | undefined;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    type CookieJar = Map<string, string>;
    const updateCookies = (jar: CookieJar, response: Response) => {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";", 1);
        const separator = pair.indexOf("=");
        if (separator < 1) {
          continue;
        }
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value) {
          jar.set(name, value);
        } else {
          jar.delete(name);
        }
      }
    };
    const csrfFor = (jar: CookieJar) => {
      const csrf = jar.get("csrf_token");
      assert.ok(csrf);
      return csrf;
    };
    const send = async (
      jar: CookieJar,
      url: string,
      init: RequestInit = {},
    ) => {
      const headers = new Headers(init.headers);
      headers.set(
        "cookie",
        [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      );
      if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) {
        headers.set("x-csrf-token", csrfFor(jar));
      }
      const response = await fetch(`${baseUrl}${url}`, { ...init, headers });
      updateCookies(jar, response);
      return response;
    };
    const createAccount = async (email: string) => {
      const jar: CookieJar = new Map();
      const csrf = await send(jar, "/api/auth/csrf");
      assert.equal(csrf.status, 200);
      const response = await send(jar, "/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "integration-test-password",
          displayName: "Integration Test",
        }),
      });
      assert.equal(response.status, 201);
      const payload = (await response.json()) as { data: { id: string } };
      userIds.push(payload.data.id);
      return { jar, user: payload.data };
    };

    try {
      const first = await createAccount(emails[0]);
      const second = await createAccount(emails[1]);
      const outsider = await createAccount(emails[2]);

      const emailSearchResponse = await send(first.jar, "/api/users/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: emails[1] }),
      });
      assert.equal(emailSearchResponse.status, 200);
      const emailSearchPayload = (await emailSearchResponse.json()) as {
        data: Array<{ id: string; email: string }>;
      };
      assert.ok(emailSearchPayload.data.some((result) => result.id === second.user.id));
      assert.ok(emailSearchPayload.data.every((result) => result.id !== first.user.id));

      const nameSearchResponse = await send(first.jar, "/api/users/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "Integration Test" }),
      });
      assert.equal(nameSearchResponse.status, 200);
      const nameSearchPayload = (await nameSearchResponse.json()) as {
        data: Array<{ id: string }>;
      };
      assert.ok(nameSearchPayload.data.some((result) => result.id === second.user.id));
      assert.ok(nameSearchPayload.data.some((result) => result.id === outsider.user.id));
      assert.ok(nameSearchPayload.data.every((result) => result.id !== first.user.id));

      const getSearchResponse = await send(
        first.jar,
        `/api/users/search?q=${encodeURIComponent(emails[1])}`,
      );
      assert.equal(getSearchResponse.status, 200);
      const getSearchPayload = (await getSearchResponse.json()) as {
        data: Array<{ id: string }>;
      };
      assert.ok(getSearchPayload.data.some((result) => result.id === second.user.id));

      const invalidSearchResponse = await send(first.jar, "/api/users/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: " " }),
      });
      assert.equal(invalidSearchResponse.status, 400);

      const createSessionResponse = await send(first.jar, "/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "GROUP",
          participantIds: [second.user.id],
          title: "Integration room",
        }),
      });
      assert.equal(createSessionResponse.status, 201);
      const sessionPayload = (await createSessionResponse.json()) as {
        data: { id: string };
      };
      const testSessionId = sessionPayload.data.id;
      sessionId = testSessionId;

      const directSessionResponse = await send(first.jar, "/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "DIRECT",
          participantIds: [second.user.id],
        }),
      });
      assert.equal(directSessionResponse.status, 201);
      const directSessionPayload = (await directSessionResponse.json()) as {
        data: { id: string };
      };
      const duplicateDirectSessionResponse = await send(first.jar, "/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "DIRECT",
          participantIds: [second.user.id],
        }),
      });
      assert.equal(duplicateDirectSessionResponse.status, 201);
      const duplicateDirectSessionPayload = (await duplicateDirectSessionResponse.json()) as {
        data: { id: string };
      };
      assert.equal(duplicateDirectSessionPayload.data.id, directSessionPayload.data.id);

      const connectUserSocket = async (jar: CookieJar) => {
        const socket: TestSocket = createSocketClient(baseUrl, {
          autoConnect: false,
          reconnection: false,
          transports: ["websocket"],
          extraHeaders: {
            origin: env.CORS_ORIGIN,
            cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
          },
        });
        sockets.push(socket);
        const connected = new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
        });
        const onlineUsers = waitForSocketEvent<string[]>(
          (handler) => socket.on("users:online", handler),
          (handler) => socket.off("users:online", handler),
        );
        socket.connect();
        await connected;
        return { socket, onlineUsers: await onlineUsers };
      };

      const firstSocket = await connectUserSocket(first.jar);
      assert.deepEqual(firstSocket.onlineUsers, []);
      const secondSocket = await connectUserSocket(second.jar);
      assert.ok(secondSocket.onlineUsers.includes(first.user.id));

      const liveText = `socket message ${randomUUID()}`;
      const receivedMessage = waitForSocketEvent<RealtimeMessage>(
        (handler) => secondSocket.socket.on("message:new", handler),
        (handler) => secondSocket.socket.off("message:new", handler),
        (message) => message.content === liveText,
      );
      const acknowledgement = new Promise<SendMessageAcknowledgement>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for message acknowledgement"));
        }, 5_000);
        firstSocket.socket.emit(
          "message:send",
          { sessionId: testSessionId, content: liveText },
          (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
        );
      });
      const [liveMessage, sent] = await Promise.all([receivedMessage, acknowledgement]);
      assert.equal(liveMessage.senderId, first.user.id);
      assert.equal(sent.message?.id, liveMessage.id);

      const typingEvent = waitForSocketEvent<
        Parameters<ServerToClientEvents["user:typing"]>[0]
      >(
        (handler) => secondSocket.socket.on("user:typing", handler),
        (handler) => secondSocket.socket.off("user:typing", handler),
        (payload) => payload.sessionId === sessionId && payload.userId === first.user.id,
      );
      firstSocket.socket.emit("typing:start", { sessionId });
      assert.equal((await typingEvent).isTyping, true);

      const outsiderSocket = await connectUserSocket(outsider.jar);
      const forbiddenJoin = waitForSocketEvent<
        Parameters<ServerToClientEvents["socket:error"]>[0]
      >(
        (handler) => outsiderSocket.socket.on("socket:error", handler),
        (handler) => outsiderSocket.socket.off("socket:error", handler),
        (payload) => payload.code === "FORBIDDEN",
      );
      outsiderSocket.socket.emit("session:join", { sessionId });
      assert.equal((await forbiddenJoin).code, "FORBIDDEN");

      const offlineEvent = waitForSocketEvent<
        Parameters<ServerToClientEvents["user:status"]>[0]
      >(
        (handler) => secondSocket.socket.on("user:status", handler),
        (handler) => secondSocket.socket.off("user:status", handler),
        (payload) => payload.userId === first.user.id && payload.status === "OFFLINE",
      );
      firstSocket.socket.disconnect();
      await offlineEvent;

      const messageResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: "hello from integration test" }),
        },
      );
      assert.equal(messageResponse.status, 201);
      const messagePayload = (await messageResponse.json()) as {
        data: { id: string };
      };
      const messageId = messagePayload.data.id;

      const readResponse = await send(
        second.jar,
        `/api/sessions/${sessionId}/messages/${messageId}/read`,
        { method: "PATCH" },
      );
      assert.equal(readResponse.status, 200);
      const readPayload = (await readResponse.json()) as {
        data: { updated: boolean };
      };
      assert.equal(readPayload.data.updated, true);

      const historyResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}/messages`,
      );
      const historyPayload = (await historyResponse.json()) as {
        data: { items: Array<{ id: string; readReceipts: Array<{ userId: string }> }> };
      };
      assert.equal(
        historyPayload.data.items.find((message) => message.id === messageId)
          ?.readReceipts.some((receipt) => receipt.userId === second.user.id),
        true,
      );

      const editResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: "edited integration message" }),
        },
      );
      assert.equal(editResponse.status, 200);
      const editPayload = (await editResponse.json()) as {
        data: { content: string };
      };
      assert.equal(editPayload.data.content, "edited integration message");

      const forbiddenEditResponse = await send(
        second.jar,
        `/api/sessions/${sessionId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: "unauthorized edit" }),
        },
      );
      assert.equal(forbiddenEditResponse.status, 403);

      const clearHistoryResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}/messages`,
        { method: "DELETE" },
      );
      assert.equal(clearHistoryResponse.status, 200);
      const clearedHistoryResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}/messages`,
      );
      const clearedHistoryPayload = (await clearedHistoryResponse.json()) as {
        data: { items: Array<{ id: string }> };
      };
      assert.equal(clearedHistoryPayload.data.items.length, 0);
      const otherMemberHistoryResponse = await send(
        second.jar,
        `/api/sessions/${sessionId}/messages`,
      );
      const otherMemberHistoryPayload = (await otherMemberHistoryResponse.json()) as {
        data: { items: Array<{ id: string }> };
      };
      assert.ok(otherMemberHistoryPayload.data.items.some((item) => item.id === messageId));

      const form = new FormData();
      form.set(
        "file",
        new Blob(["%PDF-1.4\nIntegration upload\n%%EOF"], {
          type: "application/pdf",
        }),
        "integration.pdf",
      );
      const uploadResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}/files`,
        { method: "POST", body: form },
      );
      assert.equal(uploadResponse.status, 201);
      const uploadPayload = (await uploadResponse.json()) as {
        data: { id: string; content: string };
      };
      const outsiderDownload = await send(
        outsider.jar,
        uploadPayload.data.content,
      );
      assert.equal(outsiderDownload.status, 403);
      const memberDownload = await send(second.jar, uploadPayload.data.content);
      assert.equal(memberDownload.status, 200);
      assert.match(memberDownload.headers.get("content-disposition") ?? "", /integration\.pdf/);

      const refreshResponse = await send(first.jar, "/api/auth/refresh", {
        method: "POST",
      });
      assert.equal(refreshResponse.status, 200);

      const deleteSessionResponse = await send(
        first.jar,
        `/api/sessions/${sessionId}`,
        { method: "DELETE" },
      );
      assert.equal(deleteSessionResponse.status, 204);
      sessionId = undefined;

      const logoutResponse = await send(first.jar, "/api/auth/logout", {
        method: "POST",
      });
      assert.equal(logoutResponse.status, 204);
    } finally {
      for (const socket of sockets) socket.disconnect();
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
      if (sessionId) {
        await prisma.chatSession.deleteMany({ where: { id: sessionId } });
      }
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.$disconnect();
    }
  },
);
