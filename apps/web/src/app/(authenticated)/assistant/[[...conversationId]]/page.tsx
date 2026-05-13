import { AssistantContent } from "@/components/assistant/assistant-content";

type AssistantPageProps = {
  params: Promise<{ conversationId?: string[] }>;
};

export default async function AssistantCatchAllPage({ params }: AssistantPageProps) {
  const { conversationId: segments } = await params;
  const firstSegment = segments?.[0]?.trim();

  const conversationId =
    typeof firstSegment === "string" && firstSegment.length > 0 ? firstSegment : null;

  return <AssistantContent conversationId={conversationId} />;
}
