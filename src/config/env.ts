import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Comma-separated list, e.g. "http://localhost:3000,https://rentneo.vercel.app"
const clientUrls = required("CLIENT_URL")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 5000,
  authUrl: required("AUTH_URL").replace(/\/$/, ""),
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB?.trim() || "rentneo",
  mongoTimeoutMs: Number(process.env.MONGODB_TIMEOUT_MS) || 10_000,
  clientUrls,
  // Used for Stripe success/cancel redirects; the first allowed origin is canonical.
  clientBaseUrl: (clientUrls[0] ?? "").replace(/\/$/, ""),
  // Payments stay optional so the API can boot before Stripe is configured.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || "",
};