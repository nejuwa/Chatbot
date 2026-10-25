CREATE TABLE "MessageHidden" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageHidden_pkey" PRIMARY KEY ("messageId","userId")
);

CREATE INDEX "MessageHidden_userId_hiddenAt_idx" ON "MessageHidden"("userId", "hiddenAt");

ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
