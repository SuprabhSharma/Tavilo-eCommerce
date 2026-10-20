import axios from "axios";
import { API_URL } from "../config/env";
import { useAuthStore } from "../store/authStore";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});
let refreshPromise = null;

let activeRequestCount = 0;
const notifyRequestState = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("tavilo:request-state", {
      detail: { active: activeRequestCount > 0 },
    }),
  );
};

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  activeRequestCount += 1;
  notifyRequestState();
  return config;
});

// Keep the indicator accurate for both successful and failed requests. The
// refresh flow below retries through this client, so the retry is tracked too.
api.interceptors.response.use(
  (response) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyRequestState();
    return response;
  },
  (error) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyRequestState();
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes("/auth/refresh_token")
    )
      return Promise.reject(error);
    original._retry = true;
    refreshPromise ||= axios
      .post(`${API_URL}/auth/refresh_token`, {}, { withCredentials: true })
      .then(({ data }) => {
        useAuthStore
          .getState()
          .setSession({
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
