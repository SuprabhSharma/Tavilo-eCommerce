import { api } from "../lib/apiClient";
export const getVendorProfile = () =>
  api.get("/vendors/me/profile").then((r) => r.data);
export const applyVendor = (payload) =>
  api.post("/vendors/apply", payload).then((r) => r.data);
export const updateVendorProfile = (payload) =>
  api.patch("/vendors/me/profile", payload).then((r) => r.data);
export const getVendorProducts = (params) =>
  api.get("/products/vendor/me", { params }).then((r) => r.data);
export const getAllVendorProducts = async () => {
  const firstPage = await getVendorProducts({ page: 1, page_size: 100 });
  const pages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.pages - 1) }, (_, index) =>
      getVendorProducts({ page: index + 2, page_size: 100 }),
    ),
  );
  return {
    ...firstPage,
    items: [firstPage, ...pages].flatMap((page) => page.items),
  };
};
export const uploadVendorProductImages = (files) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return api
    .post("/products/vendor/me/images", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};
export const createVendorProduct = (payload) =>
  api.post("/products/vendor/me", payload).then((r) => r.data);
export const updateVendorProduct = (uid, payload) =>
  api.patch(`/products/vendor/me/${uid}`, payload).then((r) => r.data);
export const deleteVendorProduct = (uid) =>
  api.delete(`/products/vendor/me/${uid}`).then((r) => r.data);
export const getVendorServices = (params) =>
  api.get("/services/vendor/me", { params }).then((r) => r.data);
export const getAllVendorServices = async () => {
  const firstPage = await getVendorServices({ page: 1, page_size: 100 });
  const pages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.pages - 1) }, (_, index) =>
      getVendorServices({ page: index + 2, page_size: 100 }),
    ),
  );
  return {
    ...firstPage,
    items: [firstPage, ...pages].flatMap((page) => page.items),
  };
};
export const createVendorService = (payload) =>
  api.post("/services/vendor/me", payload).then((r) => r.data);
export const updateVendorService = (uid, payload) =>
  api.patch(`/services/vendor/me/${uid}`, payload).then((r) => r.data);
export const deleteVendorService = (uid) =>
  api.delete(`/services/vendor/me/${uid}`).then((r) => r.data);
export const getVendorOrders = () =>
  api.get("/orders/vendor").then((r) => r.data);
export const updateVendorSubOrderStatus = (subUid, status) =>
  api
    .patch(`/orders/vendor/sub-orders/${subUid}/status`, { status })
    .then((r) => r.data);
export const getAdminStats = () => api.get("/admin/stats").then((r) => r.data);
export const getPendingVendors = () =>
  api.get("/vendors/admin/pending").then((r) => r.data);
export const approveVendor = (uid) =>
  api.patch(`/vendors/admin/${uid}/approve`).then((r) => r.data);
export const suspendVendor = (uid) =>
  api.patch(`/vendors/admin/${uid}/suspend`).then((r) => r.data);
