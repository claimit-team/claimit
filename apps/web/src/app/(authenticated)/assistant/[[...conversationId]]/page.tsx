"use client";

import { useParams } from "next/navigation";
import { AssistantContent } from "@/components/assistant/assistant-content";

export default function AssistantCatchAllPage() {
  const params = useParams<{ conversationId?: string[] }>();
  const segments = params?.conversationId;
  const firstSegment = segments?.[0]?.trim();

  const conversationId =
    typeof firstSegment === "string" && firstSegment.length > 0 ? firstSegment : null;

  return <AssistantContent conversationId={conversationId} />;
}
