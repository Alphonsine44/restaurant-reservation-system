import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  SEATINGS,
  createReservation,
  formatDateLong,
  formatTime,
  isValidPhone,
  loadAvailability,
  loadCalendar,
  rememberBooking,
  todayISO,
  type CalendarDay,
  type DayAvailability,
  type Reservation,
} from "../lib/reservations";
import { ManageBookings } from "../components/ManageBookings";
import { MenuSection } from "../components/MenuSection";
import diningRoom from "../assets/dining-room.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maison Verre — Restaurant Reservations" },
      {
        name: "description",
        content:
          "Book a table at Maison Verre: a seasonal tasting counter and glass-walled cellar. Choose your date, time, and party size — instant confirmation.",
      },
      { property: "og:title", content: "Maison Verre — Restaurant Reservations" },
      {
        property: "og:description",
        content:
          "Reserve your evening at Maison Verre. Seasonal tasting, candlelit cellar, instant confirmation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function monthKey(iso: string) {
  return iso.slice(0, 7); // yyyy-mm
}

function monthLabel(key: string) {
  const d = new Date(`${key}-15T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(key: string, delta: number) {
  const d = new Date(`${key}-15T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
}

function daysInMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y!, m!, 0).getDate();
}

function firstWeekday(key: string) {
  // 0 = Monday
  const d = new Date(`${key}-01T12:00:00`);
  return (d.getDay() + 6) % 7;
}

function Index() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(todayISO(1));
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [seating, setSeating] = useState("Window");
  const [requests, setRequests] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  // Availability for the date/party chosen in the booking form
  const [availability, setAvailability] = useState<DayAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");

  // Tonight
  const [tonight, setTonight] = useState<DayAvailability | null>(null);
  const [tonightLoading, setTonightLoading] = useState(true);
  const [tonightError, setTonightError] = useState("");

  // Calendar
  const [calMonth, setCalMonth] = useState(monthKey(todayISO()));
  const [calDay, setCalDay] = useState(todayISO());
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const [dayAvailability, setDayAvailability] = useState<DayAvailability | null>(null);
  const [dayLoading, setDayLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    loadAvailability(date, partySize)
      .then((data) => {
        if (cancelled) return;
        setAvailability(data);
        setTime((current) => {
          const stillFree = data.slots.some((s) => s.time === current && s.available);
          return stillFree ? current : (data.slots.find((s) => s.available)?.time ?? "");
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setAvailability(null);
        setAvailabilityError(
          cause instanceof Error ? cause.message : "Unable to check availability.",
        );
      })
      .finally(() => !cancelled && setAvailabilityLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, partySize, availabilityVersion]);

  useEffect(() => {
    let cancelled = false;
    setTonightLoading(true);
    setTonightError("");
    loadAvailability(todayISO(), 2)
      .then((data) => !cancelled && setTonight(data))
      .catch((cause: unknown) => {
        if (!cancelled)
          setTonightError(
            cause instanceof Error ? cause.message : "Unable to load tonight's tables.",
          );
      })
      .finally(() => !cancelled && setTonightLoading(false));
    return () => {
      cancelled = true;
    };
  }, [availabilityVersion]);

  useEffect(() => {
    let cancelled = false;
    setCalendarLoading(true);
    setCalendarError("");
    loadCalendar(calMonth, partySize)
      .then((data) => !cancelled && setCalendar(data))
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCalendar([]);
          setCalendarError(cause instanceof Error ? cause.message : "Unable to load the calendar.");
        }
      })
      .finally(() => !cancelled && setCalendarLoading(false));
    return () => {
      cancelled = true;
    };
  }, [calMonth, partySize, availabilityVersion]);

  useEffect(() => {
    let cancelled = false;
    setDayLoading(true);
    loadAvailability(calDay, partySize)
      .then((data) => !cancelled && setDayAvailability(data))
      .catch(() => !cancelled && setDayAvailability(null))
      .finally(() => !cancelled && setDayLoading(false));
    return () => {
      cancelled = true;
    };
  }, [calDay, partySize, availabilityVersion]);

  const calendarByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const day of calendar) map.set(day.date, day);
    return map;
  }, [calendar]);

  const tonightSlots = useMemo(
    () => (tonight?.slots ?? []).filter((s) => s.available).slice(0, 3),
    [tonight],
  );

  async function confirmReservation(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError(
        "Please enter a valid phone number (at least 7 digits) — we use it to verify your booking.",
      );
      return;
    }
    if (!time) {
      setError(
        "There are no free times on this date for your party size. Please choose another date.",
      );
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const reservation = await createReservation({
        name: name.trim(),
        phone: phone.trim(),
        date,
        time,
        partySize,
        seating,
        ...(requests.trim() ? { requests: requests.trim() } : {}),
      });
      rememberBooking({ reference: reservation.reference, phone: phone.trim() });
      setConfirmed(reservation);
      setRequests("");
      setBookingsVersion((v) => v + 1);
      setAvailabilityVersion((v) => v + 1);
      window.setTimeout(
        () => document.getElementById("confirmation")?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to create reservation.");
      setAvailabilityVersion((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  }

  function pickSlot(slotTime: string) {
    setTime(slotTime);
    setDate(todayISO());
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
  }

  function bookCalendarDay() {
    setDate(calDay);
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
  }

  const inputCls =
    "mt-1.5 w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-sm font-medium text-foreground outline-none focus:border-sage/50";
  const noTimes =
    !availabilityLoading && availability !== null && !availability.slots.some((s) => s.available);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
      <div className="pointer-events-none absolute -top-24 -left-16 size-[440px] rounded-full bg-sage/30 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -right-24 size-[400px] rounded-full bg-terra/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 size-[380px] rounded-full bg-white/60 blur-3xl" />

      <header className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        <nav className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/55 px-6 py-4 shadow-[0_8px_30px_rgba(43,39,33,0.06)] backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-sage-deep font-display text-lg text-primary-foreground">
              M
            </div>
            <div>
              <p className="font-display text-lg leading-none">Maison Verre</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/40">
                Reservations
              </p>
            </div>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-medium text-foreground/70 md:flex">
            <a href="#book" className="hover:text-foreground">
              Book
            </a>
            <a href="#tonight" className="hover:text-foreground">
              Tonight
            </a>
            <a href="#calendar" className="hover:text-foreground">
              Calendar
            </a>
            <a href="#your-tables" className="hover:text-foreground">
              Your tables
            </a>
            <a href="#menu" className="hover:text-foreground">
              Menu
            </a>
            <a href="#experience" className="hover:text-foreground">
              The experience
            </a>
            <Link to="/admin" className="hover:text-foreground">
              Admin
            </Link>
          </div>
          <a
            href="#book"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Book a Table
          </a>
        </nav>
        <div className="mt-3 flex flex-wrap gap-2 pb-1 text-sm font-medium text-foreground/70 lg:hidden">
          {[
            ["#book", "Book"],
            ["#tonight", "Tonight"],
            ["#calendar", "Calendar"],
            ["#your-tables", "Your tables"],
            ["#menu", "Menu"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="shrink-0 rounded-full border border-white/80 bg-white/60 px-3.5 py-1.5"
            >
              {label}
            </a>
          ))}
          <Link
            to="/admin"
            className="shrink-0 rounded-full border border-white/80 bg-white/60 px-3.5 py-1.5"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-sage/30 bg-white/60 px-3 py-1.5 text-xs font-medium text-sage-deep backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-sage" /> Now taking reservations · 214 King
              Street
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Reserve your evening at <span className="text-sage-deep">Maison Verre</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-foreground/60">
              A seasonal tasting counter and glass-walled cellar. Pick a date, choose your party,
              and we'll hold the light by the window.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <div>
                <p className="font-display text-2xl">Tue–Sun</p>
                <p className="text-xs text-foreground/50">Dinner from 5:30 PM</p>
              </div>
              <div className="h-10 w-px bg-foreground/10" />
              <div>
                <p className="font-display text-2xl">Instant</p>
                <p className="text-xs text-foreground/50">Booking confirmation</p>
              </div>
              <div className="h-10 w-px bg-foreground/10" />
              <div>
                <p className="font-display text-2xl">4 hours</p>
                <p className="text-xs text-foreground/50">Free cancellation window</p>
              </div>
            </div>
          </div>

          <section
            id="book"
            className="scroll-mt-8 rounded-3xl border border-white/70 bg-white/60 p-6 shadow-[0_20px_60px_rgba(43,39,33,0.10)] backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Book a table</h2>
              <span className="rounded-full bg-sage/15 px-3 py-1 text-xs font-medium text-sage-deep">
                Instant confirm
              </span>
            </div>

            <form onSubmit={confirmReservation} noValidate>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-foreground/50">Date</span>
                  <input
                    type="date"
                    required
                    min={todayISO()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-foreground/50">Time</span>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={availabilityLoading || noTimes || !availability}
                    className={inputCls}
                  >
                    {availabilityLoading && <option value="">Checking…</option>}
                    {!availabilityLoading && (!availability || noTimes) && (
                      <option value="">No times</option>
                    )}
                    {(availability?.slots ?? []).map((slot) => (
                      <option key={slot.time} value={slot.time} disabled={!slot.available}>
                        {formatTime(slot.time)}
                        {slot.available ? "" : " — full"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-foreground/50">Party size</span>
                  <select
                    value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value))}
                    className={inputCls}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "guest" : "guests"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-foreground/50">Seating</span>
                  <select
                    value={seating}
                    onChange={(e) => setSeating(e.target.value)}
                    className={inputCls}
                  >
                    {SEATINGS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-foreground/50">Name</span>
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-foreground/50">Phone</span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+27 82 123 4567"
                    className={inputCls}
                  />
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-xs font-medium text-foreground/50">Special requests</span>
                <input
                  type="text"
                  value={requests}
                  onChange={(e) => setRequests(e.target.value)}
                  placeholder="Allergies, celebrations, accessibility…"
                  className={inputCls}
                />
              </label>

              {availabilityError && (
                <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                  {availabilityError}
                </p>
              )}
              {!availabilityError && availability?.message && (
                <p className="mt-3 text-xs font-medium text-terra">{availability.message}</p>
              )}
              {!availabilityError && !availability?.message && noTimes && (
                <p className="mt-3 text-xs font-medium text-terra">
                  Nothing is free for {partySize} {partySize === 1 ? "guest" : "guests"} on this
                  date. Try another day or a smaller party.
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || availabilityLoading || !time}
                className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving reservation…" : "Confirm reservation"}
              </button>
              <p className="mt-3 text-center text-xs text-foreground/40">
                Free cancellation up to 4 hours before
              </p>
            </form>
          </section>
        </div>

        {confirmed && (
          <section
            id="confirmation"
            className="mt-10 scroll-mt-8 rounded-3xl border border-sage/30 bg-white/70 p-6 backdrop-blur-2xl sm:p-8"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-sage-deep">
                  Booking confirmed
                </p>
                <h3 className="mt-2 font-display text-2xl sm:text-3xl">
                  See you {formatDateLong(confirmed.date)} at {formatTime(confirmed.time)},{" "}
                  {confirmed.name.split(" ")[0]}.
                </h3>
                <p className="mt-2 text-sm text-foreground/60">
                  {confirmed.partySize} {confirmed.partySize === 1 ? "guest" : "guests"} ·{" "}
                  {confirmed.seating}
                  {confirmed.tableNumber ? ` · Table ${confirmed.tableNumber}` : ""} — show this
                  reference at the door.
                </p>
                <p className="mt-1 text-xs text-foreground/50">
                  Status: {confirmed.status === "CONFIRMED" ? "Confirmed" : "Awaiting confirmation"}
                  . Keep the reference and your phone number — you need both to change or cancel it
                  below.
                </p>
              </div>
              <div className="shrink-0 rounded-2xl bg-primary px-6 py-4 text-center text-primary-foreground">
                <p className="text-xs uppercase tracking-[0.2em] opacity-70">Reference</p>
                <p className="mt-1 font-display text-2xl">{confirmed.reference}</p>
              </div>
            </div>
          </section>
        )}

        <div id="tonight" className="mt-14 scroll-mt-8">
          <div className="flex items-end justify-between">
            <h3 className="font-display text-2xl">Available tonight</h3>
            <span className="text-sm text-foreground/50">Live availability for 2 guests</span>
          </div>
          {tonightLoading ? (
            <div className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-8 text-center backdrop-blur-xl">
              <p className="text-sm text-foreground/50">Checking tonight's tables…</p>
            </div>
          ) : tonightError ? (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center"
            >
              <p className="text-sm text-destructive">{tonightError}</p>
            </div>
          ) : tonightSlots.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-8 text-center backdrop-blur-xl">
              <p className="text-sm text-foreground/50">
                {tonight?.message ??
                  "No tables are left tonight. Try the calendar below for another day."}
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {tonightSlots.map((slot) => (
                <div
                  key={slot.time}
                  className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-xl transition hover:bg-white/75"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-3xl">{formatTime(slot.time)}</span>
                    <span className="rounded-full bg-sage/20 px-2.5 py-1 text-[11px] font-semibold text-sage-deep">
                      Open
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-foreground/60">
                    {slot.tablesLeft} {slot.tablesLeft === 1 ? "table" : "tables"} left for two
                  </p>
                  <button
                    type="button"
                    onClick={() => pickSlot(slot.time)}
                    className="mt-4 w-full rounded-lg py-2 text-sm font-medium text-sage-deep transition hover:bg-sage/10"
                  >
                    Select {formatTime(slot.time)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div id="calendar" className="mt-14 scroll-mt-8">
          <div className="flex items-end justify-between">
            <h3 className="font-display text-2xl">Booking calendar</h3>
            <span className="text-sm text-foreground/50">
              Real availability for {partySize} {partySize === 1 ? "guest" : "guests"}
            </span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCalMonth(shiftMonth(calMonth, -1))}
                  className="grid size-8 place-items-center rounded-lg text-foreground/60 transition hover:bg-sage/10 hover:text-sage-deep"
                  aria-label="Previous month"
                >
                  ←
                </button>
                <p className="font-display text-lg">{monthLabel(calMonth)}</p>
                <button
                  type="button"
                  onClick={() => setCalMonth(shiftMonth(calMonth, 1))}
                  className="grid size-8 place-items-center rounded-lg text-foreground/60 transition hover:bg-sage/10 hover:text-sage-deep"
                  aria-label="Next month"
                >
                  →
                </button>
              </div>
              {calendarLoading && (
                <p className="mt-3 text-xs text-foreground/40">Loading availability…</p>
              )}
              {calendarError && (
                <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                  {calendarError}
                </p>
              )}
              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: firstWeekday(calMonth) }).map((_, i) => (
                  <span key={`blank-${i}`} />
                ))}
                {Array.from({ length: daysInMonth(calMonth) }).map((_, i) => {
                  const iso = `${calMonth}-${String(i + 1).padStart(2, "0")}`;
                  const info = calendarByDate.get(iso);
                  const count = info?.bookings ?? 0;
                  const isSelected = iso === calDay;
                  const isToday = iso === todayISO();
                  const isPast = iso < todayISO();
                  const closed = info ? !info.open : false;
                  const full = info?.full ?? false;
                  return (
                    <button
                      type="button"
                      key={iso}
                      onClick={() => setCalDay(iso)}
                      aria-pressed={isSelected}
                      aria-label={`${formatDateLong(iso)}${closed ? ", closed" : full ? ", fully booked" : ""}${count ? `, ${count} bookings` : ""}`}
                      className={`relative flex flex-col items-center rounded-xl py-2 text-sm transition ${
                        isSelected
                          ? "bg-sage-deep text-primary-foreground"
                          : isToday
                            ? "bg-sage/15 font-semibold text-sage-deep"
                            : "hover:bg-white/70"
                      } ${isPast || closed ? "opacity-40" : ""} ${full && !isSelected ? "line-through decoration-terra/60" : ""}`}
                    >
                      {i + 1}
                      <span className="mt-0.5 flex h-1 gap-0.5">
                        {Array.from({ length: Math.min(count, 3) }).map((_, d) => (
                          <span
                            key={d}
                            className={`size-1 rounded-full ${
                              isSelected ? "bg-primary-foreground" : "bg-terra"
                            }`}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg">{formatDateLong(calDay)}</p>
                <span className="rounded-full bg-sage/15 px-3 py-1 text-xs font-medium text-sage-deep">
                  {calendarByDate.get(calDay)?.bookings ?? 0}{" "}
                  {(calendarByDate.get(calDay)?.bookings ?? 0) === 1 ? "booking" : "bookings"}
                </span>
              </div>
              <div className="mt-4 space-y-1.5">
                {dayLoading ? (
                  <p className="text-sm text-foreground/50">Checking times…</p>
                ) : !dayAvailability ? (
                  <p className="text-sm text-foreground/50">
                    Availability is unavailable right now.
                  </p>
                ) : dayAvailability.message && !dayAvailability.open ? (
                  <p className="rounded-xl bg-white/50 px-3.5 py-2.5 text-sm text-foreground/60">
                    {dayAvailability.message}
                  </p>
                ) : (
                  dayAvailability.slots.map((slot) => (
                    <div
                      key={slot.time}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm ${
                        slot.available ? "bg-white/50" : "bg-terra/15"
                      }`}
                    >
                      <span className="font-medium">{formatTime(slot.time)}</span>
                      {slot.available ? (
                        <span className="text-xs font-medium text-sage-deep">
                          Open · {slot.tablesLeft} {slot.tablesLeft === 1 ? "table" : "tables"}
                        </span>
                      ) : (
                        <span className="text-xs text-terra">Unavailable</span>
                      )}
                    </div>
                  ))
                )}
              </div>
              {dayAvailability?.open && calDay >= todayISO() && (
                <button
                  type="button"
                  onClick={bookCalendarDay}
                  className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Book {formatDateLong(calDay)}
                </button>
              )}
            </div>
          </div>
        </div>

        <ManageBookings
          version={bookingsVersion}
          onChanged={() => setAvailabilityVersion((v) => v + 1)}
        />

        <MenuSection />

        <div
          id="experience"
          className="mt-14 scroll-mt-8 overflow-hidden rounded-3xl border border-white/70 bg-white/40 backdrop-blur-2xl"
        >
          <div className="grid md:grid-cols-2">
            <img
              src={diningRoom}
              alt="Candlelit glass dining room at Maison Verre"
              loading="lazy"
              width={1024}
              height={1024}
              className="h-full min-h-[280px] w-full object-cover"
            />
            <div className="p-8">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-terra">
                The experience
              </p>
              <p className="mt-4 font-display text-2xl leading-snug">
                A daily-changing counter, a living wine wall, and light that shifts with the
                evening.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Welcome & aperitif on the terrace",
                  "Seven-course seasonal tasting",
                  "Cellar pairing & final pour",
                ].map((step, i) => (
                  <div key={step} className="flex items-center gap-3 text-sm text-foreground/70">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/70 text-sage-deep">
                      0{i + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-foreground/10 pt-6 text-xs text-foreground/40 sm:flex-row">
          <span>Maison Verre · 214 King Street</span>
          <span>Tue–Sun · 5:30 PM – 11:00 PM</span>
        </div>
      </footer>
    </div>
  );
}
