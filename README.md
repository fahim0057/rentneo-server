# RentNeo Server

Express 5 + MongoDB API for the RentNeo equipment rental marketplace.

Authentication is delegated to the Next.js client: this server verifies JWTs
against the client's JWKS (`<AUTH_URL>/api/auth/jwks`) and reads the user's role
from the `user` collection on every request.

## Setup

1. Copy `.env.example` to `.env` and fill in the values.
2. `npm install`
3. `npm run dev` (http://localhost:5000)

`AUTH_URL` must match the client's `BETTER_AUTH_URL` exactly, including scheme,
host and port, because the JWT `iss`/`aud` values are checked against it.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `5000`) |
| `MONGODB_URI` | MongoDB connection string (use a scoped DB user) |
| `MONGODB_DB` | Database name (default `rentneo`) |
| `MONGODB_TIMEOUT_MS` | Server selection timeout (default `10000`) |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated |
| `AUTH_URL` | Better Auth origin used for JWKS + JWT issuer/audience |
| `TRUST_PROXY` | Optional proxy hop count when behind a reverse proxy |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe test-mode keys; leave blank to keep checkout disabled |

## Endpoints

### Public

- `GET /api/health`
- `GET /api/equipment` — filters: `search`, `category`, `rentalType`, `minPrice`, `maxPrice`, `availability`, `sort`, `page`, `limit`
- `GET /api/equipment/featured`
- `GET /api/equipment/categories`
- `GET /api/reviews`

Public equipment responses omit `ownerEmail` and demo flags.

### Authenticated

- `GET /api/me`
- `GET /api/equipment/:id` — approved items, or the caller's own item, or anything for admins
- `GET /api/equipment/mine` — owner
- `POST /api/equipment` — owner
- `PUT /api/equipment/:id` — owning owner or admin
- `DELETE /api/equipment/:id` — owning owner or admin
- `GET /api/equipment/admin/all?status=` — admin
- `PATCH /api/equipment/:id/status` — admin
- `GET /api/users` — admin
- `PATCH /api/users/:id/role` — admin; cannot change your own role
- `GET /api/favorites` — current user's favorited equipment
- `POST /api/favorites/:equipmentId` — add a favorite
- `DELETE /api/favorites/:equipmentId` — remove a favorite
- `POST /api/bookings` — create a pending booking and Stripe Checkout Session
- `GET /api/bookings/mine` — renter's bookings (`page`, `limit`)
- `GET /api/bookings/owner` — owner's bookings (`page`, `limit`)
- `GET /api/bookings/admin?bookingStatus=&paymentStatus=` — admin
- `PATCH /api/bookings/:id/status` — owning owner or admin
- `GET /api/payments/success?session_id=` — renter's paid-booking confirmation fallback
- `GET /api/analytics/admin` — admin totals and 12-month activity
- `GET /api/analytics/owner` — owner totals and 12-month earnings

### Payments

- `POST /api/payments/webhook` — Stripe signature-verified webhook (no JWT)

All amounts are stored in **BDT** (`bdt` for Stripe). For local testing, run
`stripe listen --forward-to localhost:5000/api/payments/webhook` and put the
printed `whsec_...` value in `STRIPE_WEBHOOK_SECRET`.

## Scripts

- `npm run dev` — tsx watch
- `npm run build` — compile to `dist/`
- `npm run start` — run the compiled server
- `npm run indexes` — create equipment, favorite, booking and payment indexes
- `npm run seed:equipment` — demo listings (`--clear` to remove them)
- `npm run seed:reviews` — demo reviews
