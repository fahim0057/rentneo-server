import Stripe from "stripe";
import { env } from "../config/env";
import { AppError } from "../middleware/errors";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.stripeSecretKey) throw new AppError(503, "Payments are not configured");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}