/** A fetch that failed because there is no network (offline, or the file was never cached), not because the server said no. */
export function isOfflineError(message: string | undefined): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return !!message && /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}
