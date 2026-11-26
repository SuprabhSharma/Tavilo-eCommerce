import { api } from "../lib/apiClient";
export const getCart = () => api.get("/cart").then((r) => r.data);
export const addCartItem = (product_id, quantity = 1) =>
  api.post("/cart", { product_id, quantity }).then((r) => r.data);
/**
 * Idempotent upsert for Buy Now.
 * PUT /cart — ensures product is in cart without accumulating quantity.
 * If the product is already in cart, the existing qty is preserved server-side.
 * Safe to call multiple times (network retries, double-clicks, etc.).
 */
export const upsertCartItem = (product_id, quantity = 1) =>
  api.put("/cart", { product_id, quantity }).then((r) => r.data);
export const updateCartItem = (uid, quantity) =>
  api.patch(`/cart/${uid}`, { quantity }).then((r) => r.data);
export const removeCartItem = (uid) =>
  api.delete(`/cart/${uid}`).then((r) => r.data);

/**
 * Merge a guest (localStorage) cart and wishlist into the authenticated
 * user's server-persisted account.
 *
 * @param {object} payload
 * @param {string} payload.guest_cart_id  - stable UUID for idempotency
 * @param {Array}  payload.cart_items     - [{product_id, quantity}]
 * @param {Array}  payload.wishlist_product_ids - [uuid, ...]
 * @returns {Promise<GuestMergeResult>}
 */
export const mergeGuestData = (payload) =>
  api.post("/cart/merge", payload).then((r) => r.data);

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
export const checkout = ({ payload, idempotencyKey }) =>
  api
    .post("/orders/checkout", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
    .then((r) => r.data);
export const getOrders = (params = {}) =>
  api.get("/orders", { params }).then((r) => r.data);
export const getOrder = (id) => api.get(`/orders/${id}`).then((r) => r.data);
export const cancelOrder = (id) =>
  api.post(`/orders/${id}/cancel`).then((r) => r.data);

/**
 * Batch-resolve product details for a list of product UUIDs.
 * Used by the guest Wishlist page to display current product information
 * without N+1 requests.
 */
export const getProductsByIds = (ids) =>
  api.get("/products", { params: { ids: ids.join(","), page_size: 200 } }).then((r) => r.data);
