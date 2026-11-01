const KEY = "tavilo_last_address_uid";

export function getLastAddressUid() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setLastAddressUid(uid) {
  try {
    localStorage.setItem(KEY, uid);
  } catch {}
}
