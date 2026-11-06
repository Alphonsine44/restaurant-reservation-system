# Maison Verre — Restaurant Reservation System

React + TypeScript (Vite, TanStack Start) frontend, Spring Boot API, Supabase PostgreSQL.

## Quick start

You need Node.js 20+, Java 21 and Maven.

```sh
# 1. Backend (terminal 1)
cd backend
cp .env.example .env        # then fill in SUPABASE_DB_PASSWORD, APP_ADMIN_PASSWORD, APP_SECURITY_JWT_SECRET
mvn spring-boot:run         # http://localhost:8080

# 2. Frontend (terminal 2, from the project root)
cp .env.example .env.local  # VITE_API_URL=http://localhost:8080
npm install
npm run dev                 # http://localhost:5173
```

Never commit `backend/.env` or `.env.local`. With no database variables set, the backend uses a local
H2 file database, which is handy for trying things out.

**First run:** online booking needs at least one table with status `AVAILABLE`. Sign in at `/admin`
and add tables, or see `docs/schema-notes.sql` for an optional starter set.

**Schema:** the only change from the original is a `status` column on `reservations`
(additive, default `CONFIRMED`). Hibernate adds it automatically under the existing
`ddl-auto=update`; `docs/schema-notes.sql` has the SQL if you want to run it yourself.

## What the app does

- **Booking** — date, time slot, party size, seating. Slots come from the database: a slot is
  offered only if a table that fits the party is free for the whole 2-hour sitting.
- **No double-booking** — the server picks the smallest free table that fits and row-locks tables
  during the booking transaction.
- **Your tables** — customers find a booking with its reference **and** the phone number used to
  book it, then reschedule or cancel. Changes are refused less than 4 hours before the booking.
  Lookups are rate-limited.
- **Calendar** — real per-day bookings and "fully booked / closed" days.
- **Menu** — read from `categories` and `menu_items` (no ordering or payments).
- **Admin** (`/admin`, JWT + `ADMIN` role checked on the server) — search and filter reservations,
  confirm / complete / no-show / cancel, assign tables, daily counts and guest totals, manage tables.

Opening days, time slots, sitting length and the cancellation window are configurable
(`APP_RESERVATIONS_*` variables in `backend/.env.example`).

## Tests

```sh
cd backend && mvn test     # booking rules + full booking flow on in-memory H2
npm run build              # type-checks and builds the frontend
```

See `docs/TEST_PLAN.md` for test cases and the evidence still to be collected.

## Spring Boot backend

The reservation API lives in [`backend/`](./backend/). It uses Java 21, Spring Boot,
Spring Data JPA, and an H2 file database by default. A PostgreSQL connection can be
provided through the standard `SPRING_DATASOURCE_*` environment variables.

From the repository root, run:

```sh
cd backend
mvn spring-boot:run
```

The API is available at `http://localhost:8080/api/reservations`:

Public (no login):

- `POST /api/reservations` creates a reservation (returns a booking reference).
- `POST /api/reservations/lookup` `{reference, phone}` returns that booking.
- `POST /api/reservations/reschedule` and `POST /api/reservations/cancel` need reference + phone.
- `GET /api/availability?date=YYYY-MM-DD&partySize=2` and `GET /api/availability/calendar?month=YYYY-MM`.
- `GET /api/menu`.

Admin only (Bearer token):

- `GET /api/reservations` lists every reservation (this used to be public; it exposes phone numbers).
- `PATCH /api/reservations/{id}/status` `{status}` and `PATCH /api/reservations/{id}/table` `{tableId}`.
- `DELETE /api/reservations/{id}` permanently deletes a reservation.

Example request:

```json
{
  "name": "Elena Marchetti",
  "phone": "+1 415 555 0182",
  "date": "2026-10-10",
  "time": "19:30",
  "partySize": 2,
  "seating": "Window",
  "requests": "Window seat"
}
```

Set `APP_CORS_ALLOWED_ORIGIN` when the frontend is hosted somewhere other than
`http://localhost:5173`.

### Supabase PostgreSQL

The backend uses local H2 by default. To use the project's Supabase database,
copy [`backend/.env.example`](./backend/.env.example) to `backend/.env` and
replace the password with the database password from Supabase Dashboard →
Project Settings → Database. Do not commit `backend/.env`.

Alternatively, export the same variables in the shell before running the
backend. The supported variables are:

```text
SUPABASE_DB_URL
SUPABASE_DB_USERNAME
SUPABASE_DB_PASSWORD
```

Use the connection string shown by Supabase if the project's database host or
pooler region differs from the example. The JDBC URL must include
`sslmode=require`.

### Restaurant database schema

When the backend starts with `SPRING_JPA_HIBERNATE_DDL_AUTO=update`, Hibernate
creates or updates these Supabase tables:

- `roles` and `users`
- `categories` and `menu_items`
- `restaurant_tables` and `reservations`
- `restaurant_orders` and `order_items`
- `payments`
- `reviews`
- `notifications`

The relationships follow the supplied ERD: users can have roles, reservations
can reference users and restaurant tables, menu items belong to categories,
orders reference users and tables, order items reference orders and menu items,
payments reference orders, and reviews/notifications reference users.

The restaurant table API is available at:

- `GET /api/tables`
- `POST /api/tables`
- `PUT /api/tables/{id}`
- `DELETE /api/tables/{id}`

### Admin authentication

The admin dashboard at `/admin` requires an authenticated administrator. The
backend creates the configured admin account on startup if it does not already
exist, using BCrypt password hashing:

```dotenv
APP_ADMIN_EMAIL=admin@your-domain.example
APP_ADMIN_PASSWORD=replace-with-a-strong-admin-password
APP_SECURITY_JWT_SECRET=replace-with-a-base64-encoded-32-byte-secret
APP_SECURITY_JWT_EXPIRATION=PT8H
```

Set these values in `backend/.env` before using the dashboard. The development
fallback credentials are intentionally only for local setup and should be
replaced. `POST /api/auth/login` returns a signed token for users with the
`ADMIN` role. Admin tokens are required for table management and reservation
cancellation; public reservation listing and creation remain available to
guests.

Create a table with:

```json
{
  "tableNumber": "T-01",
  "capacity": 4,
  "status": "AVAILABLE"
}
```

### ERD resource APIs

The remaining schema resources expose the same validated JSON CRUD pattern
(`GET` collection, `POST`, `PUT /{id}`, and `DELETE /{id}`):

- `/api/roles` and `/api/users`
- `/api/categories` and `/api/menu-items`
- `/api/orders` and `/api/order-items`
- `/api/payments`
- `/api/reviews`
- `/api/notifications`

Relationship fields use UUIDs: users accept `roleId`, menu items accept
`categoryId`, orders accept `userId` and optional `tableId`, order items accept
`orderId` and `menuItemId`, payments accept `orderId`, and reviews and
notifications accept `userId` (reviews also accept `menuItemId`). All endpoints
validate request bodies and allow the configured frontend origin via
`APP_CORS_ALLOWED_ORIGIN`.
