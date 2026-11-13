import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : "";
      cb(null, `${crypto.randomUUID()}${safe}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Use a JPG, PNG, or WebP image"));
  },
});

const router = Router();

router.post("/", requireAuth, (req, res) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Choose an image to upload" });
      return;
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

export default router;
