import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { identify } from "./routes/identify";
import { songs } from "./routes/songs";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/identify", identify);
app.route("/api/songs", songs);

export default app;
