/**
 * Demo state for settings routes that don't yet have a real backend.
 *
 * As of Ticket 5.17 the account / Gmail / preferences / notifications
 * pages all read from useAuthStore + the live API. Billing remains
 * mock-only here until subscription work lands.
 */
export const mockPlan: "free" | "pro" | "family" = "pro";
