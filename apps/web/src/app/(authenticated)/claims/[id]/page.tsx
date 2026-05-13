import { notFound } from "next/navigation";

import { ClaimDetailShell } from "@/components/claims/claim-detail-shell";
import { getClaimConversation, getClaimDetail } from "@/lib/claim-detail";

type ClaimDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClaimDetailPage({ params }: ClaimDetailPageProps) {
  const { id } = await params;
  const claim = getClaimDetail(id);
  const conversation = getClaimConversation(id);

  if (!(claim && conversation)) {
    notFound();
  }

  return <ClaimDetailShell initialClaim={claim} initialConversation={conversation} />;
}
