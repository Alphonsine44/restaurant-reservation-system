# Maison Verre — important verification notes

## Architecture correction
The ORIGINAL uploaded project already contains a Spring Boot backend (`backend/pom.xml`, Java controllers and services). The updated version retains and extends that same backend; it was not newly introduced by Claude. The frontend remains React/TanStack Start. The API continues to run on port 8080 by default.

## Supabase and schema
The backend's original configuration supports both local H2 and PostgreSQL/Supabase. Running with no Supabase connection variables uses local H2, **not Supabase**. Verify that the running backend is actually connected to the intended Supabase project before claiming end-to-end integration.

The updated booking logic requires a `status` column on `reservations` and matching entity/table definitions. Compare your live schema with the Java entities BEFORE running SQL. The optional SQL is in `docs/schema-notes.sql`.

For safety, the default `spring.jpa.hibernate.ddl-auto` has been changed from `update` to `validate` in this package. The backend will fail startup on schema mismatch rather than modify the schema automatically. Do not switch back to `update` against production without review.

## Verification
This package has NOT been verified against your live Supabase database. Maven tests and Spring startup were not run here; Maven is unavailable in this environment. Do not present the feature list as verified. Check `docs/TEST_PLAN.md`, test actual bookings against the database, and validate access controls before demonstration.

## Configuration
Copy `backend/.env.example` to `backend/.env` locally and fill in real credentials (never commit it). Follow README for frontend setup.
