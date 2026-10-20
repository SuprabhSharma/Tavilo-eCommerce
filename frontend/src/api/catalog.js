import { api } from "../lib/apiClient";
export const listProducts = (params) =>
  api.get("/products", { params }).then((r) => r.data);
export const listServices = (params) =>
  api.get("/services", { params }).then((r) => r.data);
export const getProduct = (slug) =>
  api.get(`/products/slug/${slug}`).then((r) => r.data);
export const listCategories = () => api.get("/categories").then((r) => r.data);
export const getVendor = (slug) =>
  api.get(`/vendors/${slug}`).then((r) => r.data);
export const listReviews = (slug) =>
  api.get(`/products/${slug}/reviews`).then((r) => r.data);
export const createReview = (productId, payload) =>
  api.post(`/products/${productId}/reviews`, payload).then((r) => r.data);
export const getReviewStatus = (slug) =>
  api.get(`/products/${slug}/review-status`).then((r) => r.data);
export const updateReview = (productId, reviewId, payload) =>
  api.put(`/products/${productId}/reviews/${reviewId}`, payload).then((r) => r.data);
export const deleteReview = (productId, reviewId) =>
  api.delete(`/products/${productId}/reviews/${reviewId}`).then((r) => r.data);
