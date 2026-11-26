/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCart, getWishlist } from "../api/shop";
import { useAuthStore } from "../store/authStore";

const ProductActionStateContext = createContext(null);
const EMPTY_SET = new Set();

function createActionFlagStore() {
  let state = { cartIds: EMPTY_SET, wishlistIds: EMPTY_SET };
  const listeners = new Set();
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSets: (cartIds, wishlistIds) => {
      state = { cartIds, wishlistIds };
      listeners.forEach((listener) => listener());
    },
  };
}

export function ProductActionStateProvider({ children }) {
  const isLoggedIn = Boolean(useAuthStore((state) => state.accessToken));
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = createActionFlagStore();
  }

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
      store: storeRef.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartItemIds, wishlistItemIds],
  );

  useEffect(() => {
    storeRef.current.setSets(value.cartIds, value.wishlistIds);
  }, [value]);

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

/**
 * Subscribe only to this specific product's membership bitmask (0..3).
 * Returns a primitive integer so Object.is prevents unrelated ProductCards
 * from re-rendering when a single item is added or removed.
 */
export function useProductCardActionFlags(productId) {
  const ctx = useContext(ProductActionStateContext);
  if (!ctx) {
    throw new Error("ProductActionStateProvider is required around product cards.");
  }
  const mask = useSyncExternalStore(
    ctx.store.subscribe,
    () => {
      const snap = ctx.store.getSnapshot();
      return (snap.cartIds.has(productId) ? 1 : 0) | (snap.wishlistIds.has(productId) ? 2 : 0);
    },
    () => 0,
  );
  return {
    inCart: (mask & 1) !== 0,
    saved: (mask & 2) !== 0,
  };
}
