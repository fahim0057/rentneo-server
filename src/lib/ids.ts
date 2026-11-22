import { ObjectId } from "mongodb";
import { AppError } from "../middleware/errors";

// Validates a 24-character hex id before it reaches MongoDB.
export function toObjectId(id: unknown, label = "id"): ObjectId {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return new ObjectId(id);
}
