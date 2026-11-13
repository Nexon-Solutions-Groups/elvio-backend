import "dotenv/config";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { errorHandler } from "./lib/http";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import cartRoutes from "./routes/cart";
import catalogRoutes from "./routes/catalog";
import orderRoutes from "./routes/orders";
import sellerRoutes from "./routes/seller";
import uploadRoutes from "./routes/uploads";

const app = express();
const port = Number(process.env.PORT || 4000);
const origin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api", catalogRoutes);
app.use("/api", orderRoutes);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
