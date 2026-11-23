import { ObjectId, type Document, type WithId } from "mongodb";
import type Stripe from "stripe";
import { getDb } from "../db";
import type { BookingStatus, PaymentStatus } from "./bookingSchema";
import { CURRENCY, type Currency } from "./currency";

export interface BookingDoc extends Document {
  customerId: string;
  customerName: string;
  customerEmail: string;
  ownerId: string;
  ownerName: string;
  equipmentId: string;
  equipmentName: string;
  rentalType: "daily" | "weekly" | "monthly";
  unitPrice: number;
  quantity: number;
  startDate: Date;
  endDate: Date;
  durationUnits: number;
  totalAmount: number;
  currency: Currency;
  contactNumber: string;
  deliveryAddress: string;
  notes: string;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  stripeSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
}

function bookingObjectId(bookingId: string | undefined): ObjectId | null {
  if (!bookingId || !/^[a-f\d]{24}$/i.test(bookingId)) return null;
  return new ObjectId(bookingId);
}

function paymentIntentId(session: Stripe.Checkout.Session): string | undefined {
  const intent = session.payment_intent;
  return typeof intent === "string" ? intent : intent?.id;
}

/**
 * Marks a booking paid and records the payment. Safe to call repeatedly:
 * Stripe can deliver the same webhook event more than once, and the success
 * page calls this as a fallback.
 */
export async function confirmBookingPayment(
  session: Stripe.Checkout.Session
): Promise<WithId<BookingDoc> | null> {
  if (session.payment_status !== "paid") return null;

  const _id = bookingObjectId(session.metadata?.bookingId);
  if (!_id) return null;

  const db = await getDb();
  const bookings = db.collection<BookingDoc>("bookings");
  const payments = db.collection("payments");

  const booking = await bookings.findOne({ _id });
  if (!booking) return null;

  const now = new Date();

  // Record the money even if the booking was cancelled in the meantime, but only
  // move a booking forward: a late or duplicate event must never turn a
  // completed or cancelled booking back into "confirmed".
  await bookings.updateOne(
    { _id, paymentStatus: { $ne: "paid" } },
    {
      $set: {
        paymentStatus: "paid",
        paidAt: now,
        updatedAt: now,
      },
    }
  );
  await bookings.updateOne(
    { _id, bookingStatus: { $nin: ["cancelled", "completed"] } },
    { $set: { bookingStatus: "confirmed", updatedAt: now } }
  );
  await bookings.updateOne({ _id }, { $set: { stripeSessionId: session.id } });

  const intent = paymentIntentId(session);
  try {
    await payments.updateOne(
      { stripeSessionId: session.id },
      {
        $set: {
          status: "succeeded",
          ...(intent ? { stripePaymentIntentId: intent } : {}),
        },
        $setOnInsert: {
          bookingId: _id.toHexString(),
          customerId: booking.customerId,
          ownerId: booking.ownerId,
          equipmentId: booking.equipmentId,
          amount: booking.totalAmount,
          currency: CURRENCY,
          createdAt: now,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    // The unique index on stripeSessionId rejects the losing duplicate. That is fine.
    if ((err as { code?: number }).code !== 11000) throw err;
  }

  return bookings.findOne({ _id });
}

/** Cancels an unpaid booking after its Checkout Session expires. */
export async function expireBookingPayment(
  session: Stripe.Checkout.Session
): Promise<void> {
  const _id = bookingObjectId(session.metadata?.bookingId);
  if (!_id) return;

  await (await getDb())
    .collection<BookingDoc>("bookings")
    .updateOne(
      { _id, paymentStatus: { $ne: "paid" } },
      {
        $set: {
          paymentStatus: "failed",
          bookingStatus: "cancelled",
          updatedAt: new Date(),
        },
      }
    );
}

/** Records a card decline reported through a payment_intent event. */
export async function failBookingPayment(bookingId: string | undefined): Promise<void> {
  const _id = bookingObjectId(bookingId);
  if (!_id) return;

  const db = await getDb();
  await db.collection<BookingDoc>("bookings").updateOne(
    { _id, paymentStatus: { $ne: "paid" } },
    { $set: { paymentStatus: "failed", updatedAt: new Date() } }
  );
}
