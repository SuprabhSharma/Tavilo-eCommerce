import { api } from "../lib/apiClient";
export const getCart = () => api.get("/cart").then((r) => r.data);
export const addCartItem = (product_id, quantity = 1) =>
  api.post("/cart", { product_id, quantity }).then((r) => r.data);
export const updateCartItem = (uid, quantity) =>
  api.patch(`/cart/${uid}`, { quantity }).then((r) => r.data);
export const removeCartItem = (uid) =>
  api.delete(`/cart/${uid}`).then((r) => r.data);
export const getWishlist = () => api.get("/wishlist").then((r) => r.data);
export const addWishlist = (product_id) =>
  api.post("/wishlist", { product_id }).then((r) => r.data);
export const removeWishlist = (productId) =>
  api.delete(`/wishlist/${productId}`).then((r) => r.data);
export const getAddresses = () => api.get("/addresses").then((r) => r.data);
export const addAddress = (payload) =>
  api.post("/addresses", payload).then((r) => r.data);
export const updateAddress = (uid, payload) =>
  api.patch(`/addresses/${uid}`, payload).then((r) => r.data);
export const deleteAddress = (uid) =>
  api.delete(`/addresses/${uid}`).then((r) => r.data);
export const setDefaultAddress = (uid) =>
  updateAddress(uid, { is_default: true });
export const checkout = (payload) =>
  api.post("/orders/checkout", payload).then((r) => r.data);
export const getOrders = () => api.get("/orders").then((r) => r.data);
export const getOrder = (id) => api.get(`/orders/${id}`).then((r) => r.data);
export const cancelOrder = (id) =>
  api.post(`/orders/${id}/cancel`).then((r) => r.data);
