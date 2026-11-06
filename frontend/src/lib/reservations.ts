export type ReservationStatus = "CONFIRMED" | "PENDING" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export interface Reservation {
  id: string;
  reference: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  partySize: number;
  seating: string;
  requests?: string | null | undefined;
  createdAt: string;
  status: ReservationStatus | string;
  tableId?: string | null;
  tableNumber?: string | null;
}

export interface CreateReservationInput {
  name: string;
  phone: string;
  date: string;
  time: string;
  partySize: number;
  seating: string;
  requests?: string;
}

export interface ManagedReservation {
  reservation: Reservation;
  canChange: boolean;
  changeBlockedReason: string | null;
}

export interface RescheduleInput {
  reference: string;
  phone: string;
  date: string;
  time: string;
  partySize: number;
  seating: string;
}

export interface SlotAvailability {
  time: string;
  available: boolean;
  tablesLeft: number;
}

export interface DayAvailability {
  date: string;
  open: boolean;
  message: string | null;
  slots: SlotAvailability[];
}

export interface CalendarDay {
  date: string;
  open: boolean;
  full: boolean;
  bookings: number;
  guests: number;
}

export interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
}

export interface MenuCategoryView {
  id: string;
  name: string;
  description: string | null;
  items: MenuItemView[];
}

export const API_URL = (import.meta.env["VITE_API_URL"] || "http://localhost:8080").replace(
  /\/+$/,
  "",
);

export const SEATINGS = ["Window", "Chef's counter", "Glass cellar", "Main dining"];

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "We couldn't reach the reservation service. Please check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    let message = `Something went wrong (${response.status}). Please try again.`;
    try {
      const body = (await response.json()) as { message?: string; error?: string; detail?: string };
      message = body.message || body.detail || body.error || message;
    } catch {
      // Keep the generic message when the server does not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

/** The API returns times as 19:30 or 19:30:00; the UI always works with HH:mm. */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function createReservation(input: CreateReservationInput): Promise<Reservation> {
  return request<Reservation>("/api/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function lookupReservation(reference: string, phone: string): Promise<ManagedReservation> {
  return request<ManagedReservation>("/api/reservations/lookup", {
    method: "POST",
    body: JSON.stringify({ reference, phone }),
  });
}

export function rescheduleReservation(input: RescheduleInput): Promise<ManagedReservation> {
  return request<ManagedReservation>("/api/reservations/reschedule", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelMyReservation(reference: string, phone: string): Promise<ManagedReservation> {
  return request<ManagedReservation>("/api/reservations/cancel", {
    method: "POST",
    body: JSON.stringify({ reference, phone }),
  });
}

export function loadAvailability(date: string, partySize: number): Promise<DayAvailability> {
  return request<DayAvailability>(
    `/api/availability?date=${encodeURIComponent(date)}&partySize=${partySize}`,
  );
}

export function loadCalendar(month: string, partySize = 2): Promise<CalendarDay[]> {
  return request<CalendarDay[]>(
    `/api/availability/calendar?month=${encodeURIComponent(month)}&partySize=${partySize}`,
  );
}

export function loadMenu(): Promise<MenuCategoryView[]> {
  return request<MenuCategoryView[]>("/api/menu");
}

// ---- Remembered bookings: only the reference + phone are kept in this browser so the
// bookings can be re-fetched from the database after a refresh. The database stays the source of truth.

export interface SavedBooking {
  reference: string;
  phone: string;
}

const SAVED_KEY = "maison-verre-my-bookings";

export function readSavedBookings(): SavedBooking[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedBooking[]) : [];
    return Array.isArray(parsed) ? parsed.filter((b) => b?.reference && b?.phone) : [];
  } catch {
    return [];
  }
}

function writeSavedBookings(list: SavedBooking[]): void {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable (private mode); bookings just won't be remembered.
  }
}

export function rememberBooking(booking: SavedBooking): void {
  const list = readSavedBookings().filter(
    (b) => b.reference.toUpperCase() !== booking.reference.toUpperCase(),
  );
  list.unshift({ reference: booking.reference.toUpperCase(), phone: booking.phone });
  writeSavedBookings(list.slice(0, 10));
}

export function forgetBooking(reference: string): void {
  writeSavedBookings(
    readSavedBookings().filter((b) => b.reference.toUpperCase() !== reference.toUpperCase()),
  );
}

// ---- date helpers (local time; the restaurant's own clock is enforced by the server)

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toISODate(d);
}

export function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmed";
    case "PENDING":
      return "Pending";
    case "CANCELLED":
      return "Cancelled";
    case "COMPLETED":
      return "Completed";
    case "NO_SHOW":
      return "No-show";
    default:
      return status;
  }
}

export function statusClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-sage/20 text-sage-deep";
    case "PENDING":
      return "bg-terra/20 text-terra";
    case "CANCELLED":
    case "NO_SHOW":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-foreground/10 text-foreground/60";
  }
}

export function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 7;
}
