import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { clearAdminSession, getAdminToken, loginAdmin, saveAdminSession } from "../lib/auth";
import {
  assignReservationTable,
  createTable,
  deleteTable,
  loadAdminReservations,
  loadTables,
  setReservationStatus,
  type RestaurantTable,
  type RestaurantTableInput,
  updateTable,
} from "../lib/admin";
import {
  ApiError,
  formatDateLong,
  formatTime,
  statusClass,
  statusLabel,
  todayISO,
  type Reservation,
} from "../lib/reservations";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Maison Verre — Admin Dashboard" }] }),
  component: AdminDashboard,
});

const emptyTable: RestaurantTableInput = {
  tableNumber: "",
  capacity: 2,
  status: "AVAILABLE",
};

function AdminDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tableForm, setTableForm] = useState(emptyTable);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTable, setSavingTable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [range, setRange] = useState("UPCOMING");
  const [dateFilter, setDateFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setToken(getAdminToken());
  }, []);

  function handleAuthFailure(cause: unknown): boolean {
    if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
      clearAdminSession();
      setToken(null);
      setLoginError("Your admin session has expired. Please sign in again.");
      return true;
    }
    return false;
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [reservationData, tableData] = await Promise.all([
        loadAdminReservations(),
        loadTables(),
      ]);
      setReservations(reservationData);
      setTables(tableData);
    } catch (cause: unknown) {
      if (handleAuthFailure(cause)) return;
      setError(cause instanceof Error ? cause.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void refresh();
  }, [token]);

  const today = todayISO();
  const isActive = (r: Reservation) => r.status === "CONFIRMED" || r.status === "PENDING";
  const todays = useMemo(
    () => reservations.filter((r) => r.date === today && isActive(r)),
    [reservations, today],
  );
  const upcoming = useMemo(
    () => reservations.filter((r) => r.date >= today && isActive(r)),
    [reservations, today],
  );
  const pendingCount = reservations.filter((r) => r.status === "PENDING").length;
  const availableTables = tables.filter((table) => table.status === "AVAILABLE").length;

  const nextDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const iso = todayISO(i);
      const list = reservations.filter((r) => r.date === iso && isActive(r));
      return { iso, bookings: list.length, guests: list.reduce((n, r) => n + r.partySize, 0) };
    });
  }, [reservations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations
      .filter((r) => {
        if (dateFilter) return r.date === dateFilter;
        if (range === "TODAY") return r.date === today;
        if (range === "UPCOMING") return r.date >= today;
        if (range === "PAST") return r.date < today;
        return true;
      })
      .filter((r) => {
        if (statusFilter === "ALL") return true;
        if (statusFilter === "ACTIVE") return isActive(r);
        return r.status === statusFilter;
      })
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.reference.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        range === "PAST"
          ? `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
          : `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      );
  }, [reservations, search, statusFilter, range, dateFilter, today]);

  function startEdit(table: RestaurantTable) {
    setEditingId(table.id);
    setTableForm({
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      status: table.status,
    });
  }

  function resetTableForm() {
    setEditingId(null);
    setTableForm(emptyTable);
  }

  async function saveTable(event: React.FormEvent) {
    event.preventDefault();
    setSavingTable(true);
    setError("");
    try {
      const saved = editingId
        ? await updateTable(editingId, tableForm)
        : await createTable(tableForm);
      setTables((current) =>
        editingId
          ? current.map((table) => (table.id === saved.id ? saved : table))
          : [...current, saved],
      );
      resetTableForm();
    } catch (cause: unknown) {
      if (handleAuthFailure(cause)) return;
      setError(cause instanceof Error ? cause.message : "Unable to save table.");
    } finally {
      setSavingTable(false);
    }
  }

  async function removeTable(id: string) {
    setBusyId(id);
    setError("");
    try {
      await deleteTable(id);
      setTables((current) => current.filter((table) => table.id !== id));
    } catch (cause: unknown) {
      if (handleAuthFailure(cause)) return;
      setError(cause instanceof Error ? cause.message : "Unable to delete table.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(reservation: Reservation, status: string) {
    setBusyId(reservation.id);
    setError("");
    try {
      const saved = await setReservationStatus(reservation.id, status);
      setReservations((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause: unknown) {
      if (handleAuthFailure(cause)) return;
      setError(cause instanceof Error ? cause.message : "Unable to update the reservation.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeTable(reservation: Reservation, tableId: string) {
    if (!tableId) return;
    setBusyId(reservation.id);
    setError("");
    try {
      const saved = await assignReservationTable(reservation.id, tableId);
      setReservations((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause: unknown) {
      if (handleAuthFailure(cause)) return;
      setError(cause instanceof Error ? cause.message : "Unable to assign the table.");
    } finally {
      setBusyId(null);
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const session = await loginAdmin(email, password);
      saveAdminSession(session);
      setToken(session.token);
      setPassword("");
    } catch (cause: unknown) {
      setLoginError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setLoggingIn(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <form
          onSubmit={signIn}
          className="w-full max-w-md rounded-2xl border border-white/70 bg-white/70 p-7 shadow-sm"
        >
          <Link to="/" className="text-sm font-medium text-sage-deep hover:underline">
            ← Back to reservations
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-sage-deep">
            Maison Verre
          </p>
          <h1 className="mt-2 font-display text-4xl">Admin sign in</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Sign in to manage reservations and restaurant tables.
          </p>
          {loginError && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {loginError}
            </p>
          )}
          <label className="mt-6 block text-sm font-medium">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-foreground/10 bg-white/70 px-3 py-2.5 outline-none focus:border-sage"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-foreground/10 bg-white/70 px-3 py-2.5 outline-none focus:border-sage"
            />
          </label>
          <button
            disabled={loggingIn}
            className="mt-6 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-foreground/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to="/" className="text-sm font-medium text-sage-deep hover:underline">
              ← Back to reservations
            </Link>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-sage-deep">
              Maison Verre
            </p>
            <h1 className="mt-2 font-display text-4xl">Operations dashboard</h1>
            <p className="mt-2 text-sm text-foreground/60">
              Manage today&apos;s bookings and your dining room tables.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border border-foreground/10 bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            Refresh data
          </button>
          <button
            type="button"
            onClick={() => {
              clearAdminSession();
              setToken(null);
            }}
            className="text-sm font-medium text-foreground/60 hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        {error && (
          <p className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            ["Today's bookings", todays.length],
            ["Today's guests", todays.reduce((n, r) => n + r.partySize, 0)],
            ["Upcoming bookings", upcoming.length],
            ["Awaiting confirmation", pendingCount],
            ["Available tables", `${availableTables} / ${tables.length}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-white/70 bg-white/65 p-5 shadow-sm"
            >
              <p className="text-sm text-foreground/50">{label}</p>
              <p className="mt-2 font-display text-3xl">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-2xl border border-white/70 bg-white/65 p-5 shadow-sm">
          <h2 className="font-display text-xl">Next 7 days</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {nextDays.map((day) => (
              <button
                type="button"
                key={day.iso}
                onClick={() => {
                  setDateFilter(day.iso);
                  setStatusFilter("ACTIVE");
                }}
                className={`rounded-xl border px-3 py-2 text-left transition hover:bg-white ${
                  dateFilter === day.iso
                    ? "border-sage bg-white"
                    : "border-foreground/10 bg-white/60"
                }`}
              >
                <p className="text-xs text-foreground/50">{formatDateLong(day.iso)}</p>
                <p className="mt-1 text-sm font-medium">
                  {day.bookings} {day.bookings === 1 ? "booking" : "bookings"}
                </p>
                <p className="text-xs text-foreground/50">
                  {day.guests} {day.guests === 1 ? "guest" : "guests"}
                </p>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-white/70 bg-white/65 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Reservations</h2>
              <span className="text-sm text-foreground/50">
                {filtered.length} shown · {reservations.length} total
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, phone or reference"
                aria-label="Search reservations"
                className="sm:col-span-2 rounded-xl border border-foreground/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-sage"
              />
              <select
                value={dateFilter ? "DATE" : range}
                onChange={(event) => {
                  setDateFilter("");
                  setRange(event.target.value === "DATE" ? "ALL" : event.target.value);
                }}
                aria-label="Date range"
                className="rounded-xl border border-foreground/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-sage"
              >
                <option value="UPCOMING">Today and upcoming</option>
                <option value="TODAY">Today only</option>
                <option value="PAST">Past</option>
                <option value="ALL">All dates</option>
                {dateFilter && <option value="DATE">{formatDateLong(dateFilter)}</option>}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Status"
                className="rounded-xl border border-foreground/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-sage"
              >
                <option value="ACTIVE">Active (confirmed + pending)</option>
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="COMPLETED">Completed</option>
                <option value="NO_SHOW">No-show</option>
              </select>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                aria-label="Specific date"
                className="sm:col-span-2 rounded-xl border border-foreground/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-sage"
              />
            </div>
            {loading ? (
              <p className="mt-6 text-sm text-foreground/50">Loading reservations…</p>
            ) : filtered.length === 0 ? (
              <p className="mt-6 text-sm text-foreground/50">
                No reservations match these filters.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {filtered.map((reservation) => {
                  const open = expanded === reservation.id;
                  const busy = busyId === reservation.id;
                  const active = isActive(reservation);
                  return (
                    <div
                      key={reservation.id}
                      className="rounded-xl border border-foreground/10 bg-white/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {formatDateLong(reservation.date)} · {formatTime(reservation.time)}
                          </p>
                          <p className="mt-1 text-sm text-foreground/60">
                            {reservation.name} · {reservation.partySize}{" "}
                            {reservation.partySize === 1 ? "guest" : "guests"} ·{" "}
                            {reservation.seating}
                          </p>
                          <p className="mt-1 text-xs text-foreground/40">
                            {reservation.phone} · Ref {reservation.reference}
                            {reservation.tableNumber
                              ? ` · Table ${reservation.tableNumber}`
                              : " · No table"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(reservation.status)}`}
                        >
                          {statusLabel(reservation.status)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium">
                        {reservation.status === "PENDING" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void changeStatus(reservation, "CONFIRMED")}
                            className="text-sage-deep hover:underline disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        )}
                        {active && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void changeStatus(reservation, "COMPLETED")}
                              className="text-sage-deep hover:underline disabled:opacity-50"
                            >
                              Mark completed
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void changeStatus(reservation, "NO_SHOW")}
                              className="text-foreground/60 hover:text-foreground disabled:opacity-50"
                            >
                              No-show
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Cancel ${reservation.name}'s booking (${reservation.reference})?`,
                                  )
                                )
                                  void changeStatus(reservation, "CANCELLED");
                              }}
                              className="text-destructive/70 hover:text-destructive disabled:opacity-50"
                            >
                              Cancel booking
                            </button>
                          </>
                        )}
                        {!active && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void changeStatus(reservation, "CONFIRMED")}
                            className="text-sage-deep hover:underline disabled:opacity-50"
                          >
                            Reinstate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : reservation.id)}
                          aria-expanded={open}
                          className="ml-auto text-foreground/50 hover:text-foreground"
                        >
                          {open ? "Hide details" : "Details"}
                        </button>
                      </div>

                      {open && (
                        <div className="mt-3 space-y-2 rounded-lg bg-white/70 p-3 text-sm text-foreground/70">
                          <p>
                            <span className="text-foreground/40">Special requests: </span>
                            {reservation.requests || "None"}
                          </p>
                          <p>
                            <span className="text-foreground/40">Booked: </span>
                            {new Date(reservation.createdAt).toLocaleString()}
                          </p>
                          <label className="flex items-center gap-2">
                            <span className="text-foreground/40">Table:</span>
                            <select
                              value={reservation.tableId ?? ""}
                              disabled={busy || !active}
                              onChange={(event) =>
                                void changeTable(reservation, event.target.value)
                              }
                              className="rounded-lg border border-foreground/10 bg-white px-2 py-1 text-sm"
                            >
                              <option value="">{reservation.tableId ? "—" : "Unassigned"}</option>
                              {tables
                                .filter(
                                  (t) =>
                                    t.status === "AVAILABLE" && t.capacity >= reservation.partySize,
                                )
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.tableNumber} ({t.capacity} seats)
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/70 bg-white/65 p-5 shadow-sm">
            <h2 className="font-display text-2xl">{editingId ? "Edit table" : "Add table"}</h2>
            <form onSubmit={saveTable} className="mt-5 space-y-3">
              <input
                required
                value={tableForm.tableNumber}
                onChange={(event) =>
                  setTableForm({ ...tableForm, tableNumber: event.target.value })
                }
                placeholder="Table number (e.g. T-02)"
                aria-label="Table number"
                className="w-full rounded-xl border border-foreground/10 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-sage"
              />
              <input
                required
                min={1}
                max={50}
                type="number"
                aria-label="Capacity (seats)"
                value={tableForm.capacity}
                onChange={(event) =>
                  setTableForm({ ...tableForm, capacity: Number(event.target.value) })
                }
                className="w-full rounded-xl border border-foreground/10 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-sage"
              />
              <select
                value={tableForm.status}
                onChange={(event) => setTableForm({ ...tableForm, status: event.target.value })}
                className="w-full rounded-xl border border-foreground/10 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-sage"
              >
                <option value="AVAILABLE">Available</option>
                <option value="OCCUPIED">Occupied (not bookable)</option>
                <option value="UNAVAILABLE">Unavailable (not bookable)</option>
              </select>
              <div className="flex gap-2">
                <button
                  disabled={savingTable}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {savingTable ? "Saving…" : editingId ? "Save changes" : "Add table"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetTableForm}
                    className="rounded-xl border px-4 py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="mt-7 space-y-2">
              {tables.length === 0 && (
                <p className="rounded-xl bg-terra/10 px-3 py-2 text-sm text-terra">
                  No tables yet. Guests cannot book online until you add at least one table.
                </p>
              )}
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="flex items-center justify-between rounded-xl border border-foreground/10 bg-white/60 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {table.tableNumber} · {table.capacity} seats
                    </p>
                    <p className="text-xs text-foreground/50">{table.status}</p>
                  </div>
                  <div className="flex gap-3 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => startEdit(table)}
                      className="text-sage-deep hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === table.id}
                      onClick={() => void removeTable(table.id)}
                      className="text-destructive/70 hover:text-destructive"
                    >
                      {busyId === table.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
