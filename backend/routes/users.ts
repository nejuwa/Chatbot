import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import {
  getCurrentUser,
  getProfileAvatar,
  listContacts,
  createContact,
  deleteContact,
  listSavedMessages,
  saveMessage,
  searchUsers,
  searchUsersSchema,
  updateCurrentUser,
  uploadProfileAvatar,
} from "../controllers/index.js";
import { uploadError } from "../controllers/files.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validation.js";

const router = Router();
const userSearchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many searches. Try again shortly." },
  },
});
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});

router.get("/me", authenticate, getCurrentUser);
router.patch("/me", authenticate, updateCurrentUser);
router.get("/me/contacts", authenticate, listContacts);
router.post("/me/contacts", authenticate, createContact);
router.delete("/me/contacts/:contactId", authenticate, deleteContact);
router.post("/me/avatar", authenticate, avatarUpload.single("file"), uploadError, uploadProfileAvatar);
router.get("/me/saved-messages", authenticate, listSavedMessages);
router.post("/me/saved-messages", authenticate, saveMessage);
router.get("/:id/avatar/:filename", authenticate, getProfileAvatar);
router.post(
  "/search",
  authenticate,
  userSearchRateLimit,
  validateBody(searchUsersSchema),
  searchUsers,
);
router.get("/search", authenticate, userSearchRateLimit, searchUsers);

export { router as usersRouter };
