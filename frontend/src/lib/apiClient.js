import axios from "axios";
import { API_URL } from "../config/env";
import { useAuthStore } from "../store/authStore";

// ── Axios instance ──────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  // 15 s hard timeout; prevents requests hanging forever and triggering
  // "setTimeout handler took Nms" Violation warnings for long-running tasks.
  timeout: 15_000,
});

// ── Token refresh ───────────────────────────────────────────────────────────
let refreshPromise = null;

// ── Global request indicator (top-loading bar) ──────────────────────────────
let activeRequestCount = 0;
let rafId = null;

/**
 * Dispatch the request-state event on the next animation frame so the
 * indicator never causes a synchronous layout / style recalc mid-request.
 * Using rAF ensures the browser batches any resulting DOM mutations with
 * the ongoing paint, eliminating the "setTimeout handler took Nms" Violation
 * that was fired when the event was dispatched synchronously inside an
 * interceptor (which itself runs in a microtask — a tight synchronous chain).
 */
function scheduleNotify() {
  if (typeof window === "undefined") return;
  if (rafId) return; // already scheduled
  rafId = requestAnimationFrame(() => {
    rafId = null;
    window.dispatchEvent(
      new CustomEvent("tavilo:request-state", {
        detail: { active: activeRequestCount > 0 },
      }),
    );
  });
}

// ── Request interceptor: attach Bearer token + count ───────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  activeRequestCount += 1;
  scheduleNotify();
  return config;
});

// ── Response interceptor 1: decrement counter ─────────────────────────────
// Keep the loading indicator accurate for both success and error responses.
// The 401-refresh flow retries through this same instance, so the retry
// request also increments/decrements correctly.
api.interceptors.response.use(
  (response) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    scheduleNotify();
    return response;
  },
  (error) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    scheduleNotify();
    return Promise.reject(error);
  },
);

// ── Response interceptor 2: 401 → token refresh → retry ──────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes("/auth/refresh_token")
    ) {
      return Promise.reject(error);
    }

    original._retry = true;

    // Deduplicate concurrent refresh attempts — only one network call in flight.
    refreshPromise ??= axios
      .post(`${API_URL}/auth/refresh_token`, {}, { withCredentials: true })
      .then(({ data }) => {
        useAuthStore.getState().setSession({
          access_token: data.access_token,
          user: data.user || useAuthStore.getState().user,
        });
        return data.access_token;
      })
      .catch((refreshError) => {
        useAuthStore.getState().logout();
        throw refreshError;
      })
      .finally(() => {
        refreshPromise = null;
      });

    try {
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
