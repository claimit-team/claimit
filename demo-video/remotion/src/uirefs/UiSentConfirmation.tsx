// Surface 10 — sent-confirmation: post-submit state. Sonner toast ("Claim
// approved", real toast.success text) at sonner's default bottom-right + the
// PostApproveBanner on the ClaimShell behind.
import { AppChrome } from "./_chrome";
import { ClaimShellFrame, md, type Msg } from "./_claim";
import { ASSISTANT_TURN, DRAFT_V1, DRAFT_V2 } from "./_data";
import { SentToast } from "./_pages";

const MESSAGES: Msg[] = [
  { role: "user", text: ASSISTANT_TURN.userText },
  { role: "assistant", text: md(ASSISTANT_TURN.assistantText), tool: ASSISTANT_TURN.toolName, trace: true },
];

export const UiSentConfirmation: React.FC = () => (
  <AppChrome active="Claims" overlay={<SentToast />}>
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
