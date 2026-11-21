import { z } from "zod";
import { AppError } from "../middleware/errors";

export const CATEGORIES = [
  "Construction Equipment",
  "Photography Equipment",
  "Vehicles & Transportation",
  "Agriculture Equipment",
  "Electronics",
  "Event Equipment",
] as const;
export const RENTAL_TYPES = ["daily", "weekly", "monthly"] as const;
export const CONDITIONS = ["new", "like-new", "good", "fair"] as const;
export const STATUSES = ["pending", "approved", "rejected"] as const;

export const equipmentSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(CATEGORIES),
  location: z.string().trim().min(2).max(100),
  rentalPrice: z.coerce.number().positive(),
  rentalType: z.enum(RENTAL_TYPES),
  availableQuantity: z.coerce.number().int().min(0).max(10000),
  condition: z.enum(CONDITIONS),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  image: z.string().trim().url(),
  terms: z.string().trim().min(10).max(2000),
});

export const statusSchema = z.object({ status: z.enum(STATUSES) });

// Returns clean data or throws a 400 with a readable message
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".") || "body";
    throw new AppError(400, `Invalid ${field}: ${issue.message}`);
  }
  return result.data;
}