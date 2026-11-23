import { Router } from "express";
import type Stripe from "stripe";
import { env } from "../config/env";
import { AppError } from "../middleware/errors";
import { verifyRenter, verifyToken } from "../middleware/auth";
import { getStripe } from "../lib/stripe";
import { confirmBookingPayment, expireBookingPayment, failBookingPayment } from "../lib/bookingPayments";

const router = Router();

// POST /api/payments/webhook
// No JWT here. Stripe proves who it is with a signature over the raw request body.
router.post("/webhook", async (req, res) => {
  if (!env.stripeWebhookSecret) throw new AppError(503, "Payments are not configured");

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !req.rawBody) {
    throw new AppError(400, "Missing Stripe signature");
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, signature, env.stripeWebhookSecret);
  } catch {
    throw new AppError(400, "Invalid Stripe signature");
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await confirmBookingPayment(event.data.object);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await expireBookingPayment(event.data.object);
      break;
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      await failBookingPayment(intent.metadata?.bookingId);
      break;
    }
    default:
      break; // events we don't care about are acknowledged and ignored
  }

  // A 2xx tells Stripe we got it. Errors above return 4xx/5xx so Stripe retries.
  res.json({ received: true });
});

// GET /api/payments/success?session_id=cs_...
// Fallback for the success page in case the webhook is a moment late. Safe to call repeatedly.
router.get("/success", verifyToken, verifyRenter, async (req, res) => {
  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    throw new AppError(400, "Invalid session id");
  }

  const session = await getStripe().checkout.sessions.retrieve(sessionId);

  if (session.metadata?.customerId !== req.user!.id) {
    throw new AppError(403, "This payment does not belong to you");
  }
  if (session.payment_status !== "paid") {
    throw new AppError(402, "Payment has not been completed");
  }

  const booking = await confirmBookingPayment(session);
  if (!booking) throw new AppError(404, "Booking not found");

  res.json({ success: true, data: booking });
});

export default router;