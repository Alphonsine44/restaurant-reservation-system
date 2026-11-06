import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  SEATINGS,
  cancelMyReservation,
  forgetBooking,
  formatDateLong,
  formatTime,
  hhmm,
  isValidPhone,
  loadAvailability,
  lookupReservation,
  readSavedBookings,
  rememberBooking,
  rescheduleReservation,
  statusClass,
  statusLabel,
  todayISO,
  type DayAvailability,
  type ManagedReservation,
  type SavedBooking,
} from "../lib/reservations";

interface Entry {
  saved: SavedBooking;
  managed?: ManagedReservation;
  error?: string;
  gone?: boolean;
}

interface Props {
  /** Bumped by the parent after a new booking is made so the list refreshes. */
  version: number;
  onChanged?: () => void;
}

const inputCls =
  "mt-1.5 w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-sm font-medium text-foreground outline-none focus:border-sage/50";

export function ManageBookings({ version, onChanged }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [looking, setLooking] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const saved = readSavedBookings();
    if (saved.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await Promise.allSettled(
      saved.map((s) => lookupReservation(s.reference, s.phone)),
    );
    setEntries(
      results.map((result, i): Entry => {
        const savedBooking = saved[i]!;
        if (result.status === "fulfilled") return { saved: savedBooking, managed: result.value };
        const err = result.reason as unknown;
        if (err instanceof ApiError && err.status === 404) {
          return { saved: savedBooking, gone: true, error: err.message };
        }
        return {
          saved: savedBooking,
          error: err instanceof Error ? err.message : "Unable to load this booking.",
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setLookupError("");
    if (!reference.trim()) {
      setLookupError("Enter the booking reference from your confirmation (it looks like MV-AB12).");
      return;
    }
    if (!isValidPhone(phone)) {
      setLookupError("Enter the phone number you used when booking.");
      return;
    }
    setLooking(true);
    try {
      await lookupReservation(reference.trim(), phone.trim());
      rememberBooking({ reference: reference.trim(), phone: phone.trim() });
      setReference("");
      setPhone("");
      setNotice({ kind: "ok", text: "Booking found and added to your list." });
      await refresh();
    } catch (cause: unknown) {
      setLookupError(cause instanceof Error ? cause.message : "Unable to look up that booking.");
    } finally {
      setLooking(false);
    }
  }

  async function cancel(entry: Entry) {
    setBusyRef(entry.saved.reference);
    setNotice(null);
    try {
      await cancelMyReservation(entry.saved.reference, entry.saved.phone);
      setNotice({
        kind: "ok",
        text: `Booking ${entry.saved.reference} has been cancelled. The table is now free for other guests.`,
      });
      setConfirmCancel(null);
      await refresh();
      onChanged?.();
    } catch (cause: unknown) {
      setNotice({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Unable to cancel this booking.",
      });
    } finally {
      setBusyRef(null);
    }
  }

  return (
    <div id="your-tables" className="mt-14 scroll-mt-8">
      <div className="flex items-end justify-between">
        <h3 className="font-display text-2xl">Your tables</h3>
        <span className="text-sm text-foreground/50">
          {entries.filter((e) => e.managed).length} saved{" "}
          {entries.filter((e) => e.managed).length === 1 ? "booking" : "bookings"}
        </span>
      </div>

      <form
        onSubmit={find}
        className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-xl"
        noValidate
      >
        <p className="text-sm text-foreground/60">
          Find a booking with its reference and the phone number you booked with. Both are needed so
          nobody else can see or change your reservation.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-foreground/50">Booking reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="MV-AB12"
              autoCapitalize="characters"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-foreground/50">Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+27 82 123 4567"
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={looking}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {looking ? "Searching…" : "Find booking"}
          </button>
        </div>
        {lookupError && (
          <p role="alert" className="mt-3 text-xs font-medium text-destructive">
            {lookupError}
          </p>
        )}
      </form>

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            notice.kind === "ok"
              ? "border-sage/30 bg-sage/10 text-sage-deep"
              : "border-destructive/20 bg-destructive/5 text-destructive"
          }`}
        >
          {notice.text}
        </p>
      )}

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-8 text-center backdrop-blur-xl">
          <p className="text-sm text-foreground/50">Loading your bookings…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-8 text-center backdrop-blur-xl">
          <p className="text-sm text-foreground/50">
            No saved bookings yet — book a table above, or find an existing one with its reference.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => (
            <BookingCard
              key={entry.saved.reference}
              entry={entry}
              busy={busyRef === entry.saved.reference}
              confirming={confirmCancel === entry.saved.reference}
              editing={editing === entry.saved.reference}
              onAskCancel={() => setConfirmCancel(entry.saved.reference)}
              onKeep={() => setConfirmCancel(null)}
              onCancel={() => void cancel(entry)}
              onEdit={() => setEditing(entry.saved.reference)}
              onCloseEdit={() => setEditing(null)}
              onForget={() => {
                forgetBooking(entry.saved.reference);
                void refresh();
              }}
              onRescheduled={(text) => {
                setEditing(null);
                setNotice({ kind: "ok", text });
                void refresh();
                onChanged?.();
              }}
              onRetry={() => void refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  entry: Entry;
  busy: boolean;
  confirming: boolean;
  editing: boolean;
  onAskCancel: () => void;
  onKeep: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onCloseEdit: () => void;
  onForget: () => void;
  onRescheduled: (message: string) => void;
  onRetry: () => void;
}

function BookingCard(props: CardProps) {
  const { entry, busy, confirming, editing } = props;
  const shell = "rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-xl";

  if (!entry.managed) {
    return (
      <div className={shell}>
        <p className="font-display text-lg">{entry.saved.reference}</p>
        <p className="mt-2 text-sm text-foreground/60">
          {entry.gone
            ? "We can no longer find this booking."
            : (entry.error ?? "We couldn't load this booking.")}
        </p>
        <div className="mt-4 flex gap-4 text-xs font-medium">
          {!entry.gone && (
            <button
              type="button"
              onClick={props.onRetry}
              className="text-sage-deep hover:underline"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={props.onForget}
            className="text-foreground/50 hover:text-foreground"
          >
            Remove from list
          </button>
        </div>
      </div>
    );
  }

  const { reservation: r, canChange, changeBlockedReason } = entry.managed;
  const isActive = r.status === "CONFIRMED" || r.status === "PENDING";
  const isPast = r.date < todayISO();

  return (
    <div className={`${shell} ${isActive ? "" : "opacity-80"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg">
          {formatDateLong(r.date)} · {formatTime(r.time)}
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(r.status)}`}
        >
          {statusLabel(r.status)}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground/60">
        {r.partySize} {r.partySize === 1 ? "guest" : "guests"} · {r.seating} · {r.name}
      </p>
      {r.tableNumber && isActive && (
        <p className="mt-1 text-xs text-foreground/50">Table {r.tableNumber}</p>
      )}
      {r.requests && <p className="mt-1 text-xs text-foreground/40">“{r.requests}”</p>}
      <p className="mt-3 text-xs font-medium text-foreground/40">Ref · {r.reference}</p>

      {isActive && !isPast && !canChange && changeBlockedReason && (
        <p className="mt-3 rounded-lg bg-terra/10 px-3 py-2 text-xs text-terra">
          {changeBlockedReason}
        </p>
      )}

      {editing ? (
        <RescheduleForm entry={entry} onClose={props.onCloseEdit} onDone={props.onRescheduled} />
      ) : confirming ? (
        <div className="mt-4 rounded-xl bg-destructive/5 p-3">
          <p className="text-sm text-destructive">Cancel this booking? This can't be undone.</p>
          <div className="mt-3 flex gap-3 text-xs font-semibold">
            <button
              type="button"
              disabled={busy}
              onClick={props.onCancel}
              className="rounded-lg bg-destructive px-3 py-1.5 text-destructive-foreground disabled:opacity-60"
            >
              {busy ? "Cancelling…" : "Yes, cancel booking"}
            </button>
            <button type="button" onClick={props.onKeep} className="px-2 py-1.5 text-foreground/60">
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-4 text-xs font-medium">
          {isActive && (
            <>
              <button
                type="button"
                disabled={!canChange}
                onClick={props.onEdit}
                className="text-sage-deep hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Reschedule
              </button>
              <button
                type="button"
                disabled={!canChange}
                onClick={props.onAskCancel}
                className="text-destructive/70 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
            </>
          )}
          <button
            type="button"
            onClick={props.onForget}
            className="ml-auto text-foreground/40 hover:text-foreground"
          >
            Remove from list
          </button>
        </div>
      )}
    </div>
  );
}

function RescheduleForm({
  entry,
  onClose,
  onDone,
}: {
  entry: Entry;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const current = entry.managed!.reservation;
  const [date, setDate] = useState(current.date);
  const [time, setTime] = useState(hhmm(current.time));
  const [partySize, setPartySize] = useState(current.partySize);
  const [seating, setSeating] = useState(current.seating);
  const [availability, setAvailability] = useState<DayAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    loadAvailability(date, partySize)
      .then((data) => !cancelled && setAvailability(data))
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to check availability.");
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [date, partySize]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await rescheduleReservation({
        reference: entry.saved.reference,
        phone: entry.saved.phone,
        date,
        time,
        partySize,
        seating,
      });
      onDone(
        `Booking ${entry.saved.reference} updated: ${formatDateLong(result.reservation.date)} at ${formatTime(
          result.reservation.time,
        )} for ${result.reservation.partySize}.`,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to update this booking.");
    } finally {
      setSaving(false);
    }
  }

  const isCurrentSlot = (t: string) => date === current.date && t === hhmm(current.time);

  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-xl bg-white/60 p-3">
      <div className="grid grid-cols-2 gap-3">
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
          <select value={time} onChange={(e) => setTime(e.target.value)} className={inputCls}>
            {(availability?.slots ?? []).map((s) => (
              <option key={s.time} value={s.time} disabled={!s.available && !isCurrentSlot(s.time)}>
                {formatTime(s.time)}
                {!s.available && !isCurrentSlot(s.time) ? " — unavailable" : ""}
              </option>
            ))}
            {!availability && <option value={time}>{formatTime(time)}</option>}
          </select>
        </label>
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
          <select value={seating} onChange={(e) => setSeating(e.target.value)} className={inputCls}>
            {SEATINGS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {availability?.message && <p className="text-xs text-terra">{availability.message}</p>}
      {checking && <p className="text-xs text-foreground/40">Checking availability…</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3 text-xs font-semibold">
        <button
          type="submit"
          disabled={saving || checking}
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onClose} className="px-2 py-2 text-foreground/60">
          Close
        </button>
      </div>
    </form>
  );
}
