import { Router, type Request, type Response } from "express";
import type { Document } from "mongodb";
import { env } from "../config/env";
import { getDb } from "../db";
import { AppError } from "../middleware/errors";
import {
  verifyAdmin,
  verifyOwner,
  verifyOwnerOrAdmin,
  verifyRenter,
  verifyToken,
} from "../middleware/auth";
import { parseBody } from "../lib/equipmentSchema";
import {
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  bookingStatusSchema,
  calculateRental,
  createBookingSchema,
} from "../lib/bookingSchema";
import { toObjectId } from "../lib/ids";
import { getStripe } from "../lib/stripe";
import { CURRENCY } from "../lib/currency";
import type { BookingDoc } from "../lib/bookingPayments";

const router = Router();

// Unpaid bookings hold stock only while their Stripe Checkout Session is still open.
const HOLD_MINUTES = 31; // Stripe needs sessions to live at least 30 minutes

const bookingsCol = async () => (await getDb()).collection<BookingDoc>("bookings");

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Cancels unpaid bookings whose checkout window has passed. Runs lazily, so no cron is needed. */
async function expireStaleHolds(extra: Document = {}) {
  await (await bookingsCol()).updateMany(
    {
      ...extra,
      paymentStatus: "pending",
      createdAt: { $lt: new Date(Date.now() - (HOLD_MINUTES + 1) * 60_000) },
    },
    { $set: { paymentStatus: "failed", bookingStatus: "cancelled", updatedAt: new Date() } }
  );
}

async function sendPage(req: Request, res: Response, filter: Document) {
  const page = Math.max(1, Math.trunc(Number(str(req.query.page)) || 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(Number(str(req.query.limit)) || 10)));
  const col = await bookingsCol();
  const [data, total] = await Promise.all([
    col
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// POST /api/bookings -> creates a pending booking and a Stripe Checkout Session
router.post("/", verifyToken, verifyRenter, async (req, res) => {
  const input = parseBody(createBookingSchema, req.body);
  const user = req.user!;

  const stripe = getStripe(); // fail early (503) before touching the database

  const db = await getDb();
  const equipment = await db
    .collection("equipment")
    .findOne({ _id: toObjectId(input.equipmentId, "equipment id"), status: "approved" });
  if (!equipment) throw new AppError(404, "Equipment not found");

  // The price always comes from the database, never from the browser
  const { start, end, durationUnits, totalAmount } = calculateRental({
    startDate: input.startDate,
    endDate: input.endDate,
    rentalType: equipment.rentalType,
    unitPrice: equipment.rentalPrice,
    quantity: input.quantity,
  });

  const equipmentId = equipment._id.toHexString();
  const bookings = await bookingsCol();
  await expireStaleHolds({ equipmentId });

  // How many units are already reserved for overlapping dates?
  const holdCutoff = new Date(Date.now() - HOLD_MINUTES * 60_000);
  const overlap = await bookings
    .aggregate([
      {
        $match: {
          equipmentId,
          bookingStatus: { $in: ["pending", "confirmed", "active"] },
          startDate: { $lt: end },
          endDate: { $gt: start },
          $or: [{ paymentStatus: "paid" }, { createdAt: { $gt: holdCutoff } }],
        },
      },
      { $group: { _id: null, reserved: { $sum: "$quantity" } } },
    ])
    .toArray();
  const reserved: number = overlap[0]?.reserved ?? 0;
  if (equipment.availableQuantity - reserved < input.quantity) {
    throw new AppError(409, "Not enough equipment available for those dates");
  }

  const now = new Date();
  const booking: BookingDoc = {
    customerId: user.id,
    customerName: user.name,
    customerEmail: user.email,
    ownerId: equipment.ownerId,
    ownerName: equipment.ownerName,
    equipmentId,
    equipmentName: equipment.name, // snapshots keep history stable if the listing changes
    rentalType: equipment.rentalType,
    unitPrice: equipment.rentalPrice,
    quantity: input.quantity,
    startDate: start,
    endDate: end,
    durationUnits,
    totalAmount,
    currency: CURRENCY,
    contactNumber: input.contactNumber,
    deliveryAddress: input.deliveryAddress,
    notes: input.notes,
    paymentStatus: "pending",
    bookingStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await bookings.insertOne(booking);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: Math.round(totalAmount * 100), // smallest currency unit
            product_data: {
              name: `${equipment.name} rental`,
              description: `${durationUnits} ${equipment.rentalType} unit(s) x ${input.quantity}`,
            },
          },
        },
      ],
      metadata: {
        bookingId: insertedId.toHexString(),
        customerId: user.id,
        ownerId: equipment.ownerId,
        equipmentId,
      },
      // Copy the booking id onto the PaymentIntent so card-failure events can
      // be tied back to a booking without another lookup.
      payment_intent_data: {
        metadata: { bookingId: insertedId.toHexString() },
      },
      expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60,
      success_url: `${env.clientBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.clientBaseUrl}/equipment/${equipmentId}?payment=cancelled`,
    });
    if (!session.url) throw new AppError(502, "Could not start checkout");

    await bookings.updateOne({ _id: insertedId }, { $set: { stripeSessionId: session.id } });
    res.status(201).json({
      success: true,
      data: { bookingId: insertedId.toHexString(), checkoutUrl: session.url },
    });
  } catch (err) {
    // Don't leave a ghost booking that blocks stock
    await bookings.deleteOne({ _id: insertedId });
    throw err;
  }
});

// GET /api/bookings/mine
router.get("/mine", verifyToken, verifyRenter, async (req, res) => {
  const filter = { customerId: req.user!.id };
  await expireStaleHolds(filter);
  await sendPage(req, res, filter);
});

// GET /api/bookings/owner
router.get("/owner", verifyToken, verifyOwner, async (req, res) => {
  const filter = { ownerId: req.user!.id };
  await expireStaleHolds(filter);
  await sendPage(req, res, filter);
});

// GET /api/bookings/admin?bookingStatus=&paymentStatus=
router.get("/admin", verifyToken, verifyAdmin, async (req, res) => {
  await expireStaleHolds();
  const filter: Document = {};
  const bookingStatus = str(req.query.bookingStatus);
  const paymentStatus = str(req.query.paymentStatus);
  if (bookingStatus && (BOOKING_STATUSES as readonly string[]).includes(bookingStatus)) {
    filter.bookingStatus = bookingStatus;
  }
  if (paymentStatus && (PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
    filter.paymentStatus = paymentStatus;
  }
  await sendPage(req, res, filter);
});

// PATCH /api/bookings/:id/status
const TERMINAL = ["completed", "cancelled"];
const OWNER_TRANSITIONS: Record<string, string[]> = {
  confirmed: ["active", "cancelled"],
  active: ["completed"],
};

router.patch("/:id/status", verifyToken, verifyOwnerOrAdmin, async (req, res) => {
  const { bookingStatus: next } = parseBody(bookingStatusSchema, req.body);
  const _id = toObjectId(req.params.id, "booking id");
  const col = await bookingsCol();

  const booking = await col.findOne({ _id });
  if (!booking) throw new AppError(404, "Booking not found");

  const user = req.user!;
  const current = booking.bookingStatus;

  if (user.role === "owner") {
    if (booking.ownerId !== user.id) {
      throw new AppError(403, "You can only manage bookings for your own equipment");
    }
    if (booking.paymentStatus !== "paid") {
      throw new AppError(400, "Only paid bookings can be managed");
    }
    if (!OWNER_TRANSITIONS[current]?.includes(next)) {
      throw new AppError(400, `Cannot change a ${current} booking to ${next}`);
    }
  }
  if (TERMINAL.includes(current)) throw new AppError(400, `A ${current} booking cannot be changed`);
  if (next === current) throw new AppError(400, `Booking is already ${current}`);
  if (next === "pending") throw new AppError(400, "A booking cannot be moved back to pending");

  // Matching on the current status stops two people changing it at the same moment
  const result = await col.findOneAndUpdate(
    { _id, bookingStatus: current },
    { $set: { bookingStatus: next, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) throw new AppError(409, "This booking was just changed. Please refresh.");
  res.json({ success: true, data: result });
});

export default router;