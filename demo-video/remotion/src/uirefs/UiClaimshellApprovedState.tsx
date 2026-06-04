// Surface 6 — claimshell-approved-state: after Approve, status → submitted.
// Production shows the PostApproveBanner + record-outcome actions (NOT a
// disabled Approve button). Approve primary is the real near-black bg-primary.
import { AppChrome } from "./_chrome";
import { ClaimShellFrame, md, type Msg } from "./_claim";
import { ASSISTANT_TURN, DRAFT_V1, DRAFT_V2 } from "./_data";

const MESSAGES: Msg[] = [
  { role: "user", text: ASSISTANT_TURN.userText },
  { role: "assistant", text: md(ASSISTANT_TURN.assistantText), tool: ASSISTANT_TURN.toolName, trace: true },
];

export const UiClaimshellApprovedState: React.FC = () => (
  <AppChrome active="Claims">
    <ClaimShellFrame
      status="submitted"
      versions={[
        { n: 1, label: "AI draft", content: DRAFT_V1 },
        { n: 2, label: "Assistant rewrite", content: DRAFT_V2 },
      ]}
      selected={2}
      messages={MESSAGES}
    />
  </AppChrome>
);
