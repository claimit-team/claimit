// Surface 4 — claimshell-loaded: default 3-pane state. Draft v1, Preview tab,
// empty Assistant, NAVY "Approve and send". FAB hidden (matches production).
import { AppChrome } from "./_chrome";
import { ClaimShellFrame } from "./_claim";
import { DRAFT_V1 } from "./_data";

export const UiClaimshellLoaded: React.FC = () => (
  <AppChrome active="Claims">
    <ClaimShellFrame
      status="awaiting_approval"
      versions={[{ n: 1, label: "AI draft", content: DRAFT_V1 }]}
      selected={1}
      messages={[]}
    />
  </AppChrome>
);
