import Stripe from "stripe";
import { env } from "../config/env";
import { AppError } from "../middleware/errors";

let client: Stripe | null = null;

// Lazily create one client so the API boots even when Stripe is not configured.
export function getStripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new AppError(503, "Payments are not configured");
  }
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
}
