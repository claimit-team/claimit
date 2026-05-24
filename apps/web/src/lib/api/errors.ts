export function friendlyMessage(status: number, code?: string): string {
  // Code overrides for cases status alone doesn't capture.
  switch (code) {
    case "unauthenticated":
      return "Your session expired. Please sign in again.";
    case "not_found":
      return "We couldn't find that.";
    case "request_timeout":
      return "That took too long. Please try again.";
    case "network_error":
      return "Can't reach the server. Check your connection and try again.";
  }
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "We couldn't find that.";
  if (status === 408) return "That took too long. Please try again.";
  if (status === 409) return "That conflicts with the current state. Refresh and try again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 400 || status === 422)
    return "Some details look off. Please review and try again.";
  if (status >= 500) return "Something went wrong on our end. Please try again shortly.";
  return "Something went wrong. Please try again.";
}

// Firebase sign-in errors are not HTTP errors. Returns null when no toast should show
// (user intentionally closed/cancelled the popup).
export function friendlyAuthError(code?: string): string | null {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return null;
    case "auth/network-request-failed":
      return "Can't reach the server. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Please allow popups and try again.";
    default:
      return "Couldn't sign in. Please try again.";
  }
}
