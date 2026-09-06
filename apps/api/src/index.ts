import { Hono } from "hono";
import type { Env } from "./env";
import { identify } from "./routes/identify";
import { songs } from "./routes/songs";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/identify", identify);
app.route("/api/songs", songs);

export default app;
