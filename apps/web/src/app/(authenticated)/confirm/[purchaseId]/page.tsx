import { redirect } from "next/navigation";
import { ConfirmPurchaseContent } from "@/components/confirm/confirm-purchase-content";
import {
  getConfirmExtractionForPurchase,
  getPurchaseById,
  purchaseShouldSkipConfirmRedirect,
} from "@/lib/mock-purchases";

type ConfirmPageProps = {
  params: Promise<{ purchaseId: string }>;
};

export default async function ConfirmPurchasePage({ params }: ConfirmPageProps) {
  const { purchaseId } = await params;
  const purchase = getPurchaseById(purchaseId);

  if (purchaseShouldSkipConfirmRedirect(purchase)) {
    redirect(`/purchases/${purchaseId}`);
  }

  const extraction = getConfirmExtractionForPurchase(purchaseId);

  return <ConfirmPurchaseContent purchaseId={purchaseId} extraction={extraction} />;
}
