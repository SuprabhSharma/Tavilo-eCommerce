import { api } from "../lib/apiClient";
export const login = (payload) =>
  api.post("/auth/login", payload).then((r) => r.data);
export const signup = (payload) =>
  api.post("/auth/signup", payload).then((r) => r.data);
export const getMe = () => api.get("/auth/me").then((r) => r.data);
export const verifyEmail = (token) =>
  api.post("/auth/verify", { token }).then((r) => r.data);
export const resendVerification = (email) =>
  api.post("/auth/resend-verification", { email }).then((r) => r.data);
export const requestPasswordReset = (email) =>
  api.post("/auth/password-reset-request", { email }).then((r) => r.data);
export const resetPassword = (token, payload) =>
  api
    .post(`/auth/password-reset-confirm/${token}`, payload)
    .then((r) => r.data);
export const logout = () => api.post("/auth/logout").then((r) => r.data);
