// Surface 2 — dashboard-loaded: chrome + active-user hero + needs-attention + monitored.
import { AppChrome } from "./_chrome";
import { DashboardContent } from "./_pages";

export const UiDashboardLoaded: React.FC = () => (
  <AppChrome active="Dashboard" showFab>
    <DashboardContent mode="loaded" />
  </AppChrome>
);
