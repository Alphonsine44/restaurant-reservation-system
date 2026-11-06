import { API_URL, ApiError, type Reservation } from "./reservations";

export interface RestaurantTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: string;
}

export interface RestaurantTableInput {
  tableNumber: string;
  capacity: number;
  status: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window === "undefined" ? null : window.localStorage.getItem("maison-verre-admin-token");
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("We couldn't reach the server. Is the backend running?", 0);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError("Your admin session has expired. Please sign in again.", response.status);
    }
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string; message?: string };
      message = body.message || body.detail || message;
    } catch {
      // Preserve the HTTP error when the server has no JSON response.
    }
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const loadAdminReservations = () => request<Reservation[]>("/api/reservations");
export const setReservationStatus = (id: string, status: string) =>
  request<Reservation>(`/api/reservations/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
export const assignReservationTable = (id: string, tableId: string) =>
  request<Reservation>(`/api/reservations/${encodeURIComponent(id)}/table`, {
    method: "PATCH",
    body: JSON.stringify({ tableId }),
  });
export const cancelAdminReservation = (id: string) =>
  request<void>(`/api/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });
export const loadTables = () => request<RestaurantTable[]>("/api/tables");
export const createTable = (input: RestaurantTableInput) =>
  request<RestaurantTable>("/api/tables", { method: "POST", body: JSON.stringify(input) });
export const updateTable = (id: string, input: RestaurantTableInput) =>
  request<RestaurantTable>(`/api/tables/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const deleteTable = (id: string) =>
  request<void>(`/api/tables/${encodeURIComponent(id)}`, { method: "DELETE" });
