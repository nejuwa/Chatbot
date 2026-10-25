import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import {
  addAiParticipant,
  clearSessionHistory,
  createSession,
  deleteSession,
  deleteOwnMessage,
  downloadSessionFile,
  getSession,
  getGroupAvatar,
  inviteParticipant,
  leaveSession,
  listSessionMessages,
  listSessions,
  markMessageRead,
  removeParticipant,
  renameSession,
  sendSessionMessage,
  updateOwnMessage,
  updateGroupProfile,
  uploadGroupAvatar,
  uploadError,
  uploadSessionFile,
} from "../controllers/index.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validation.js";
import {
  createMessageSchema,
  updateMessageSchema,
} from "../services/messages.service.js";
import {
  createSessionSchema,
  inviteParticipantSchema,
  renameSessionSchema,
  updateGroupProfileSchema,
} from "../services/sessions.service.js";

const router = Router();
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
    fields: 0,
  },
});
const fileUploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many uploads. Please try again shortly.",
    },
  },
});

router.use(authenticate);
router.get("/", listSessions);
router.post("/", validateBody(createSessionSchema), createSession);
router.post(
  "/:id/files",
  fileUploadRateLimit,
  fileUpload.single("file"),
  uploadError,
  uploadSessionFile,
);
router.get("/:id/files/:fileId", downloadSessionFile);
router.get("/:id/messages", listSessionMessages);
router.delete("/:id/messages", clearSessionHistory);
router.post(
  "/:id/messages",
  validateBody(createMessageSchema),
  sendSessionMessage,
);
router.patch("/:id/messages/:messageId/read", markMessageRead);
router.patch(
  "/:id/messages/:messageId",
  validateBody(updateMessageSchema),
  updateOwnMessage,
);
router.delete("/:id/messages/:messageId", deleteOwnMessage);
router.post(
  "/:id/avatar",
  fileUploadRateLimit,
  fileUpload.single("file"),
  uploadError,
  uploadGroupAvatar,
);
router.get("/:id/avatar/:filename", getGroupAvatar);
router.get("/:id", getSession);
router.patch(
  "/:id/profile",
  validateBody(updateGroupProfileSchema),
  updateGroupProfile,
);
router.patch("/:id", validateBody(renameSessionSchema), renameSession);
router.delete("/:id", deleteSession);
router.post(
  "/:id/participants",
  validateBody(inviteParticipantSchema),
  inviteParticipant,
);
router.delete("/:id/participants/:userId", removeParticipant);
router.post("/:id/leave", leaveSession);
router.post("/:id/ai", addAiParticipant);

export { router as sessionsRouter };
