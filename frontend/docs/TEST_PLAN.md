# Maison Verre — Test plan and evidence

Status key: **PASSED** = actually run and confirmed; **NOT RUN** = written but not yet executed (needs your machine / Supabase).
Record screenshots or the console output in the "Evidence" column when you run each one.

## A. Executed during development

| ID | Objective | How it was run | Result |
|----|-----------|----------------|--------|
| U01 | Slot must be one of the configured times | `BookingRulesTest` (plain `javac` + test runner) | PASSED |
| U02 | Closed day (Monday) rejected | same | PASSED |
| U03 | Past date / too-soon time rejected | same | PASSED |
| U04 | Beyond 90-day horizon rejected; valid slot accepted | same | PASSED |
| U05 | 4-hour change window boundary (exactly 4h ok, 4h+1min refused) | same | PASSED |
| U06 | Two sittings under 2h apart overlap | same | PASSED |
| U07 | Smallest fitting table chosen; no double-booking; capacity enforced; free-table counts | same | PASSED |
| U08 | A booking can be rescheduled onto its own slot (self ignored) | same | PASSED |
| U09 | Phone matching ignores formatting (+27 82… = 082…), rejects different numbers | same | PASSED |
| F01 | Frontend type-check (`tsc --noEmit`) | command line | PASSED |
| F02 | Frontend production build (`npm run build`) | command line | PASSED |
| F03 | ESLint on changed code: 0 errors (7 pre-existing warnings) | command line | PASSED |
| F04 | UI flow against a **mocked** API: book → confirmation → saved booking card → cancel → menu shown; no horizontal scroll at 390px; no JS errors | Playwright | PASSED (mock only — not the real backend) |

## B. To run on your machine (not run here: the build sandbox could not download Maven dependencies)

| ID | Objective | Steps | Expected | Evidence |
|----|-----------|-------|----------|----------|
| B01 | Backend compiles and all tests pass | `cd backend && mvn test` | BUILD SUCCESS; `ReservationControllerTest` (11 cases) and `BookingRulesTest` pass | NOT RUN |
| B02 | Backend starts against Supabase | set `SUPABASE_DB_PASSWORD` etc., `mvn spring-boot:run` | Starts on :8080, no schema errors; `reservations` gains `status` column | NOT RUN |
| B03 | Create booking persists | Book on the site, refresh | Booking card still shown; row visible in Supabase `reservations` with `table_id` set | NOT RUN |
| B04 | No double-booking | Add one 2-seat table. Book 19:30 for 2; book 19:30 for 2 again | Second attempt: "No table is free…"; 19:30 shows "full" in the time list | NOT RUN |
| B05 | Capacity | Party of 8 with only a 4-seat table | Refused with a clear message | NOT RUN |
| B06 | Customer lookup needs both factors | Look up reference with wrong phone | "We couldn't find a reservation…" (same message as unknown reference) | NOT RUN |
| B07 | Reschedule | Change date/time/party on a booking > 4h away | Success message; availability updates for old and new slot | NOT RUN |
| B08 | Cancel rule | Book today's slot < 4h away, try to cancel | Cancel/Reschedule disabled with an explanation; API returns 409 | NOT RUN |
| B09 | Public list closed | `curl http://localhost:8080/api/reservations` | 403 | NOT RUN |
| B10 | Admin protected | Open `/admin` signed out; call `PATCH /api/reservations/{id}/status` without a token | Sign-in form; 403 | NOT RUN |
| B11 | Admin workflow | Sign in; search, filter, confirm, complete, cancel, assign table | Each change persists after Refresh | NOT RUN |
| B12 | Calendar | Make bookings on a day | Dots/counts appear; day panel shows booked times as Unavailable | NOT RUN |
| B13 | Menu | Open the Menu section with data in `categories` / `menu_items` | Categories as tabs, items with prices and availability | NOT RUN |
| B14 | Mobile layout | Browser dev tools at 390px width | No horizontal scroll; nav chips usable | NOT RUN |
