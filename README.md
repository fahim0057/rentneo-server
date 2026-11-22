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
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Reserved; payments not implemented yet |

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

## Scripts

- `npm run dev` — tsx watch
- `npm run build` — compile to `dist/`
- `npm run start` — run the compiled server
- `npm run indexes` — create equipment indexes
- `npm run seed:equipment` — demo listings (`--clear` to remove them)
- `npm run seed:reviews` — demo reviews
