// Surface 8 — ocr-fields-populated: /confirm/[purchaseId] extraction review.
// (Verified: OCR fields live on the confirm route, NOT the upload dialog — the
// dialog routes here on success.) Fields populated from the Costco fixture.
import { AppChrome } from "./_chrome";
import { ConfirmContent } from "./_pages";

export const UiOcrFieldsPopulated: React.FC = () => (
  <AppChrome active="Confirm" showFab>
    <ConfirmContent />
  </AppChrome>
);
