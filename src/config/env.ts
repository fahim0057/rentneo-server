import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: required("MONGODB_URI"),
  // Comma-separated list, e.g. "http://localhost:3000,https://rentneo.vercel.app"
  clientUrls: required("CLIENT_URL").split(",").map((u) => u.trim()),
};