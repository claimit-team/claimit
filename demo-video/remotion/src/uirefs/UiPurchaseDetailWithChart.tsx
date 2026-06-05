// Surface 9 — purchase-detail-with-chart: /purchases/[id] with the recharts
// price-history chart showing the $599.99 → $499.99 drop (amber dot on May 31).
import { AppChrome } from "./_chrome";
import { PurchaseContent } from "./_pages";

export const UiPurchaseDetailWithChart: React.FC = () => (
  <AppChrome active="Purchases" showFab>
    <PurchaseContent />
  </AppChrome>
);
