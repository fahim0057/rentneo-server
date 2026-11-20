import { MongoClient, Db } from "mongodb";
import { env } from "./config/env";

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    const client = new MongoClient(env.mongoUri);
    dbPromise = client
      .connect()
      .then((c) => c.db("rentneo"))
      .catch((err) => {
        dbPromise = null; // allow a retry on the next request
        throw err;
      });
  }
  return dbPromise;
}