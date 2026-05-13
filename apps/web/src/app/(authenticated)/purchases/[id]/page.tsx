import { notFound } from "next/navigation";

import { PurchaseDetailContent } from "@/components/purchase/purchase-detail-content";
import { getPurchaseDetailViewModel } from "@/lib/mock-purchases";

type PurchaseDetailRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function PurchaseDetailPage({ params }: PurchaseDetailRouteProps) {
  const { id } = await params;

  const purchase = getPurchaseDetailViewModel(id);
  if (!purchase) notFound();

  return <PurchaseDetailContent purchase={purchase} />;
}
