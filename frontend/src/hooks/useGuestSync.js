import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";
import { mergeGuestData } from "../api/shop";

let activeSyncPromise = null;

/**
 * Deduplicated, thread-safe sync of guest (localStorage) cart & wishlist
 * to the authenticated PostgreSQL database.
 *
 * If multiple callers invoke syncGuestData simultaneously (e.g. login submit
 * and the useGuestSync hook), they share the exact same in-flight promise.
 */
export async function syncGuestData(queryClient) {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  const { cart, wishlist } = useGuestStore.getState();
  const hasCartItems = cart?.items?.length > 0;
  const hasWishlistItems = wishlist?.items?.length > 0;

  if (!hasCartItems && !hasWishlistItems) {
    return null;
  }

  const payload = {
    guest_cart_id: cart.guestCartId,
    cart_items: (cart.items || []).map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
    })),
    wishlist_product_ids: (wishlist.items || []).map((i) => i.productId),
  };

  activeSyncPromise = mergeGuestData(payload)
    .then((result) => {
      // Backend confirmed 200 OK merge
      useGuestStore.getState().clearGuestCart();
      useGuestStore.getState().clearGuestWishlist();

      // Invalidate queries so fresh DB state is rendered immediately
      if (queryClient) {
        queryClient.invalidateQueries({ queryKey: ["cart"] });
        queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      }

      // If there were conflicts (e.g. out of stock), dispatch notification event
      if (result?.conflicts?.length > 0) {
        window.dispatchEvent(
          new CustomEvent("tavilo:merge-conflicts", {
            detail: { conflicts: result.conflicts },
          }),
        );
      }

      return result;
    })
    .catch((err) => {
      // Keep guest data in localStorage so no shopping items are lost
      console.warn("Guest data merge failed; will retry on next session check:", err);
      return null;
    })
    .finally(() => {
      activeSyncPromise = null;
    });

  return activeSyncPromise;
}

/**
 * useGuestSync
 *
 * React hook mounted in the root App shell. Automatically triggers sync
 * whenever a session is established or restored.
 */
export function useGuestSync() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = Boolean(accessToken && user);

  useEffect(() => {
    if (!isAuthenticated) return;
    syncGuestData(queryClient);
  }, [isAuthenticated, queryClient]);
}
