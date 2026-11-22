export type Role = "customer" | "owner" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      // Captured by the JSON body parser so Stripe can verify webhook signatures.
      rawBody?: Buffer;
    }
  }
}