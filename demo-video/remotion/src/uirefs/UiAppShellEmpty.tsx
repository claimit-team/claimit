// Surface 1 — app-shell-empty: authenticated chrome + empty (new-user) dashboard.
import { AppChrome } from "./_chrome";
import { DashboardContent } from "./_pages";

export const UiAppShellEmpty: React.FC = () => (
  <AppChrome active="Dashboard" showFab>
    <DashboardContent mode="empty" />
  </AppChrome>
);
