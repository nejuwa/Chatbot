CREATE TABLE "UserContact" (
    "ownerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("ownerId", "contactId")
);

CREATE INDEX "UserContact_contactId_idx" ON "UserContact"("contactId");

ALTER TABLE "UserContact"
ADD CONSTRAINT "UserContact_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserContact"
ADD CONSTRAINT "UserContact_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
