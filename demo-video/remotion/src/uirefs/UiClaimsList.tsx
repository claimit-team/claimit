// Surface 3 — claims-list: chrome + /claims table (Costco + 3 variety rows).
import { AppChrome } from "./_chrome";
import { ClaimsContent } from "./_pages";

export const UiClaimsList: React.FC = () => (
  <AppChrome active="Claims" showFab>
    <ClaimsContent />
  </AppChrome>
);
