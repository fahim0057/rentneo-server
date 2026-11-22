// The single place to change the platform currency. Stripe requires lowercase codes.
export const CURRENCY = "bdt" as const;
export type Currency = typeof CURRENCY;