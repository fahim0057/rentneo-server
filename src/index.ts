import { app } from "./app";
import { env } from "./config/env";
import { closeDb, getDb } from "./db";

async function start() {
  await getDb();
  console.log("MongoDB connected");

  const server = app.listen(env.port, () => console.log(`Server running on port ${env.port}`));

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    server.close(async () => {
      try {
        await closeDb();
      } finally {
        process.exit(0);
      }
    });
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
