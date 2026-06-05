// Surface 7 — upload-modal-on-dashboard: UploadDialog (empty dropzone) open
// over the loaded dashboard, with the real light bg-black/10 backdrop.
import { AppChrome } from "./_chrome";
import { DashboardContent, UploadModal } from "./_pages";

export const UiUploadModalOnDashboard: React.FC = () => (
  <AppChrome active="Dashboard" showFab overlay={<UploadModal />}>
    <DashboardContent mode="loaded" />
  </AppChrome>
);
