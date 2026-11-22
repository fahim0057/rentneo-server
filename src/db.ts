import { MongoClient, Db } from "mongodb";
import { env } from "./config/env";

let client: MongoClient | null = null;
let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    const mongo = new MongoClient(env.mongoUri, {
      serverSelectionTimeoutMS: env.mongoTimeoutMs,
    });
    client = mongo;
    dbPromise = mongo
      .connect()
      .then((c) => c.db(env.mongoDb))
      .catch(async (err) => {
        dbPromise = null;
        await mongo.close().catch(() => {});
        if (client === mongo) client = null;
        throw err; // allow a retry on the next request
      });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  const mongo = client;
  client = null;
  dbPromise = null;
  await mongo?.close();
}
