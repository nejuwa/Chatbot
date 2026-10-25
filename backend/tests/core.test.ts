import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

process.env.JWT_SECRET ||= "test-only-secret-that-is-at-least-32-characters";
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

const [{ createCsrfToken, isValidCsrfToken, tokensMatch }, { mapAiError }, { isSupportedUpload }, { credentialsSchema }, { createMessageSchema }, { PresenceRegistry }, { searchUsersSchema, updateProfileSchema, createContactSchema }, { updateGroupProfileSchema }] =
  await Promise.all([
    import("../utils/csrf.js"),
    import("../services/ai.service.js"),
    import("../services/files.service.js"),
    import("../controllers/auth.controller.js"),
    import("../services/messages.service.js"),
    import("../socket/presence.js"),
    import("../controllers/users.controller.js"),
    import("../services/sessions.service.js"),
  ]);

test("user search requires a trimmed query of at least two characters", () => {
  assert.deepEqual(searchUsersSchema.safeParse({ query: "  al  " }).data, {
    query: "al",
  });
  assert.equal(searchUsersSchema.safeParse({ query: " a " }).success, false);
  assert.equal(searchUsersSchema.safeParse({ query: "x".repeat(101) }).success, false);
});

test("contact creation requires a valid non-empty account ID", () => {
  assert.deepEqual(createContactSchema.safeParse({ userId: " user-123 " }).data, {
    userId: "user-123",
  });
  assert.equal(createContactSchema.safeParse({ userId: " " }).success, false);
  assert.equal(createContactSchema.safeParse({ userId: "x".repeat(129) }).success, false);
});

test("profile updates validate optional usernames and bounded biography text", () => {
  assert.equal(updateProfileSchema.safeParse({
    displayName: "Example",
    username: "chat_user7",
    bio: "Available to chat",
  }).success, true);
  assert.equal(updateProfileSchema.safeParse({
    displayName: null,
    username: "not valid",
    bio: null,
  }).success, false);
  assert.equal(updateProfileSchema.safeParse({
    displayName: null,
    username: null,
    bio: "x".repeat(501),
  }).success, false);
});

test("group profile updates validate title and optional bounded description", () => {
  assert.deepEqual(updateGroupProfileSchema.safeParse({
    title: "  Team chat  ",
    description: " Project updates ",
  }).data, {
    title: "Team chat",
    description: "Project updates",
  });
  assert.equal(updateGroupProfileSchema.safeParse({
    title: " ",
    description: null,
  }).success, false);
  assert.equal(updateGroupProfileSchema.safeParse({
    title: "Team chat",
    description: "x".repeat(501),
  }).success, false);
});

test("presence remains online until the user's last socket disconnects", () => {
  const presence = new PresenceRegistry();

  assert.equal(presence.add("user-1", "socket-1"), true);
  assert.equal(presence.add("user-1", "socket-2"), false);
  assert.deepEqual(presence.onlineUserIds(["user-1", "user-2"]), ["user-1"]);
  assert.equal(presence.remove("user-1", "socket-1"), false);
  assert.equal(presence.has("user-1"), true);
  assert.equal(presence.remove("user-1", "socket-2"), true);
  assert.equal(presence.has("user-1"), false);
});

test("CSRF tokens validate and reject tampering", () => {
  const token = createCsrfToken();
  assert.equal(isValidCsrfToken(token), true);
  assert.equal(tokensMatch(token, token), true);
  assert.equal(isValidCsrfToken(`${token}x`), false);
  assert.equal(tokensMatch(token, `${token}x`), false);
});

test("credential validation normalizes email and rejects oversized bcrypt passwords", () => {
  const valid = credentialsSchema.safeParse({
    email: " PERSON@example.com ",
    password: "correct-horse-battery",
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.email, "person@example.com");
  }
  assert.equal(
    credentialsSchema.safeParse({
      email: "person@example.com",
      password: "é".repeat(37),
    }).success,
    false,
  );
});

test("message validation trims content and rejects blank text", () => {
  assert.equal(
    createMessageSchema.safeParse({ content: "  hello " }).success,
    true,
  );
  assert.equal(createMessageSchema.safeParse({ content: "  " }).success, false);
});

test("upload signature validation permits supported image headers and rejects spoofed MIME", () => {
  assert.equal(
    isSupportedUpload({
      mimetype: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
    true,
  );
  assert.equal(
    isSupportedUpload({
      mimetype: "image/png",
      buffer: Buffer.from("<script>alert(1)</script>"),
    }),
    false,
  );
  assert.equal(
    isSupportedUpload({
      mimetype: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    }),
    false,
  );
  assert.equal(
    isSupportedUpload({
      mimetype: "audio/webm",
      buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]),
    }),
    true,
  );
  assert.equal(
    isSupportedUpload({
      mimetype: "audio/webm",
      buffer: Buffer.from("not audio"),
    }),
    false,
  );
  assert.equal(
    isSupportedUpload({
      mimetype: "video/webm",
      buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]),
    }),
    true,
  );
});

test("Gemini quota errors map to a friendly stable error without provider details", () => {
  const error = mapAiError({ status: 429, message: "RESOURCE_EXHAUSTED secret detail" });
  assert.equal(error.code, "RATE_LIMITED");
  assert.equal(error.statusCode, 429);
  assert.equal(error.message.includes("RESOURCE_EXHAUSTED"), false);
});

test("health and API authorization/CSRF gates respond as expected", async () => {
  const { createApp } = await import("../app.js");
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const protectedUser = await fetch(`${baseUrl}/api/users/me`);
    assert.equal(protectedUser.status, 401);

    const csrfProtected = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
    });
    assert.equal(csrfProtected.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
