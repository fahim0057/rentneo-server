import { z } from "zod";
import { RENTAL_TYPES } from "./equipmentSchema";
import { AppError } from "../middleware/errors";

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "active",
  "completed",
  "cancelled",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const createBookingSchema = z.object({
  equipmentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid equipment id"),
  startDate: z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD"),
  endDate: z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD"),
  quantity: z.coerce.number().int().min(1).max(100),
  contactNumber: z.string().trim().min(6).max(20),
  deliveryAddress: z.string().trim().min(5).max(200),
  notes: z.string().trim().max(500).default(""),
});

export const bookingStatusSchema = z.object({
  bookingStatus: z.enum(BOOKING_STATUSES),
});

function parseUtcDate(value: string, label: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  // Reject impossible dates such as 2026-02-31, which Date would roll over.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return date;
}

// Rental length is calendar-based: every started week/month counts as a full unit.
export function calculateRental({
  startDate,
  endDate,
  rentalType,
  unitPrice,
  quantity,
}: {
  startDate: string;
  endDate: string;
  rentalType: (typeof RENTAL_TYPES)[number];
  unitPrice: number;
  quantity: number;
}) {
  const start = parseUtcDate(startDate, "start date");
  const end = parseUtcDate(endDate, "end date");
    const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (start < todayUtc) throw new AppError(400, "Start date cannot be in the past");

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days < 1) throw new AppError(400, "End date must be after start date");
  if (days > 365) throw new AppError(400, "Rental cannot exceed 365 days");

  const durationUnits =
    rentalType === "daily" ? days : rentalType === "weekly" ? Math.ceil(days / 7) : Math.ceil(days / 30);

  // Round to fils/cents so the stored amount matches the Stripe charge.
  const totalAmount = Math.round(unitPrice * durationUnits * quantity * 100) / 100;
  if (totalAmount <= 0) throw new AppError(400, "Booking total must be greater than zero");

  return { start, end, days, durationUnits, totalAmount };
}
