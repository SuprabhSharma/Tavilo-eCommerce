/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCart, getWishlist } from "../api/shop";
import { useAuthStore } from "../store/authStore";

const ProductActionStateContext = createContext(null);

export function ProductActionStateProvider({ children }) {
  const isLoggedIn = Boolean(useAuthStore((state) => state.accessToken));
  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: isLoggedIn,
  });
  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: getWishlist,
    enabled: isLoggedIn,
  });
  const cartItemIds = (cart.data?.items ?? [])
    .map((item) => item.product_id)
    .sort()
    .join(",");
  const wishlistItemIds = (wishlist.data?.items ?? [])
    .map((item) => item.product_id)
    .sort()
    .join(",");

  const value = useMemo(
    () => ({
      cartIds: new Set((cart.data?.items ?? []).map((item) => item.product_id)),
      wishlistIds: new Set(
        (wishlist.data?.items ?? []).map((item) => item.product_id),
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartItemIds, wishlistItemIds],
  );

  return (
    <ProductActionStateContext.Provider value={value}>
      {children}
    </ProductActionStateContext.Provider>
  );
}

export function useProductActionState() {
  const state = useContext(ProductActionStateContext);
  if (!state) {
    throw new Error("ProductActionStateProvider is required around product cards.");
  }
  return state;
}
