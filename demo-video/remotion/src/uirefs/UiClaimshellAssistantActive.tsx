// Surface 5 — claimshell-assistant-active: after "Make it friendlier" → v2 redraft.
// Draft auto-switched to v2 (Assistant rewrite); Assistant shows the 2-turn exchange.
import { AppChrome } from "./_chrome";
import { ClaimShellFrame, md, type Msg } from "./_claim";
import { ASSISTANT_TURN, DRAFT_V1, DRAFT_V2 } from "./_data";

const MESSAGES: Msg[] = [
  { role: "user", text: ASSISTANT_TURN.userText },
  { role: "assistant", text: md(ASSISTANT_TURN.assistantText), tool: ASSISTANT_TURN.toolName, trace: true },
];

export const UiClaimshellAssistantActive: React.FC = () => (
  <AppChrome active="Claims">
    <ClaimShellFrame
      status="awaiting_approval"
      versions={[
        { n: 1, label: "AI draft", content: DRAFT_V1 },
        { n: 2, label: "Assistant rewrite", content: DRAFT_V2 },
      ]}
      selected={2}
      messages={MESSAGES}
    />
  </AppChrome>
);
