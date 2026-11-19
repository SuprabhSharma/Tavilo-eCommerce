/**
 * Guest shopping state — localStorage-backed Zustand store.
 *
 * Rules:
 *  - No sensitive data stored (no prices, no vendor IDs).
 *  - UUID format validation on all product IDs.
 *  - Max 50 items per cart, max quantity 99.
 *  - Immediate persistence on every mutation.
 *  - Hydrated from localStorage on first import.
 *  - Cross-tab sync via the native `storage` event.
 *  - Malformed JSON / unavailable storage handled safely.
 */

import { create } from "zustand";

const CART_KEY = "tavilo:guest-cart:v1";
const WISHLIST_KEY = "tavilo:guest-wishlist:v1";
const MAX_CART_ITEMS = 50;
const MAX_QUANTITY = 99;

// ── UUID v4 format validation ────────────────────────────────────────────────
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
  return typeof id === "string" && UUID_RE.test(id);
}

// ── Stable guest-cart ID ─────────────────────────────────────────────────────
function newGuestCartId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── localStorage helpers ─────────────────────────────────────────────────────
function readStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // QuotaExceededError or private-mode restriction — fail silently
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── Schema parsers / validators ──────────────────────────────────────────────
function parseCart(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== 1) {
    return { guestCartId: newGuestCartId(), items: [] };
  }
  const guestCartId =
    isValidUUID(raw.guestCartId) ? raw.guestCartId : newGuestCartId();
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter(
          (i) =>
            isValidUUID(i?.productId) &&
            Number.isInteger(i.quantity) &&
            i.quantity >= 1 &&
            i.quantity <= MAX_QUANTITY,
        )
        .slice(0, MAX_CART_ITEMS)
    : [];
  return { guestCartId, items };
}

function parseWishlist(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== 1) {
    return { items: [] };
  }
  const items = Array.isArray(raw.items)
    ? raw.items.filter(
        (i) => isValidUUID(i?.productId) && typeof i.addedAt === "string",
      )
    : [];
  return { items };
}

// ── Hydrate initial state ────────────────────────────────────────────────────
function loadInitialState() {
  const cart = parseCart(readStorage(CART_KEY));
  const wishlist = parseWishlist(readStorage(WISHLIST_KEY));
  return { cart, wishlist };
}

const initial = loadInitialState();

// ── Zustand store ────────────────────────────────────────────────────────────
export const useGuestStore = create((set, get) => ({
  cart: initial.cart,       // { guestCartId: string, items: GuestCartItem[] }
  wishlist: initial.wishlist, // { items: GuestWishlistItem[] }

  // ── Cart actions ────────────────────────────────────────────────────────────
  addToGuestCart(productId, quantity = 1) {
    if (!isValidUUID(productId)) return;
    const qty = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity)));
    set((state) => {
      const existing = state.cart.items.find(
        (i) => i.productId === productId,
      );
      let items;
      if (existing) {
        const newQty = Math.min(MAX_QUANTITY, existing.quantity + qty);
        // Bring re-added item to the top with current timestamp
        items = [
          { productId, quantity: newQty, addedAt: new Date().toISOString() },
          ...state.cart.items.filter((i) => i.productId !== productId),
        ];
      } else {
        if (state.cart.items.length >= MAX_CART_ITEMS) return state;
        // Prepend new item to the top so most recently added appears first
        items = [
          { productId, quantity: qty, addedAt: new Date().toISOString() },
          ...state.cart.items,
        ];
      }
      const cart = { ...state.cart, items };
      writeStorage(CART_KEY, { version: 1, ...cart });
      return { cart };
    });
  },

  removeFromGuestCart(productId) {
    if (!isValidUUID(productId)) return;
    set((state) => {
      const items = state.cart.items.filter(
        (i) => i.productId !== productId,
      );
      const cart = { ...state.cart, items };
      writeStorage(CART_KEY, { version: 1, ...cart });
      return { cart };
    });
  },

  updateGuestCartQty(productId, quantity) {
    if (!isValidUUID(productId)) return;
    const qty = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity)));
    set((state) => {
      const items = state.cart.items.map((i) =>
        i.productId === productId ? { ...i, quantity: qty } : i,
      );
      const cart = { ...state.cart, items };
      writeStorage(CART_KEY, { version: 1, ...cart });
      return { cart };
    });
  },

  isInGuestCart(productId) {
    return get().cart.items.some((i) => i.productId === productId);
  },

  getGuestCartItemQty(productId) {
    return get().cart.items.find((i) => i.productId === productId)?.quantity ?? 0;
  },

  guestCartCount() {
    return get().cart.items.reduce((s, i) => s + i.quantity, 0);
  },

  clearGuestCart() {
    set((state) => {
      // Keep the guestCartId stable so the merge idempotency key remains valid
      const cart = { ...state.cart, items: [] };
      removeStorage(CART_KEY);
      return { cart };
    });
  },

  // ── Wishlist actions ────────────────────────────────────────────────────────
  addToGuestWishlist(productId) {
    if (!isValidUUID(productId)) return;
    set((state) => {
      if (state.wishlist.items.some((i) => i.productId === productId))
        return state;
      const items = [
        ...state.wishlist.items,
        { productId, addedAt: new Date().toISOString() },
      ];
      const wishlist = { items };
      writeStorage(WISHLIST_KEY, { version: 1, ...wishlist });
      return { wishlist };
    });
  },

  removeFromGuestWishlist(productId) {
    if (!isValidUUID(productId)) return;
    set((state) => {
      const items = state.wishlist.items.filter(
        (i) => i.productId !== productId,
      );
      const wishlist = { items };
      writeStorage(WISHLIST_KEY, { version: 1, ...wishlist });
      return { wishlist };
    });
  },

  isInGuestWishlist(productId) {
    return get().wishlist.items.some((i) => i.productId === productId);
  },

  clearGuestWishlist() {
    set({ wishlist: { items: [] } });
    removeStorage(WISHLIST_KEY);
  },

  // ── Cross-tab sync ──────────────────────────────────────────────────────────
  syncFromStorage() {
    const { cart, wishlist } = loadInitialState();
    set({ cart, wishlist });
  },
}));

// Listen for localStorage changes in other tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY || event.key === WISHLIST_KEY) {
      useGuestStore.getState().syncFromStorage();
    }
  });
}

// ── Selectors (memoised externally via zustand/shallow where needed) ─────────
export const selectGuestCartCount = (state) =>
  state.cart.items.reduce((s, i) => s + i.quantity, 0);
export const selectGuestCartId = (state) => state.cart.guestCartId;
export const selectGuestCartItems = (state) => state.cart.items;
export const selectGuestWishlistItems = (state) => state.wishlist.items;
