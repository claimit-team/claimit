import type { Metadata } from "next";
import { ContactSupportView } from "@/components/help/contact-support-view";

export const metadata: Metadata = {
  title: "Contact support — ClaimIt",
  description: "Reach ClaimIt support about Gmail, claims, billing, privacy, or other questions.",
};

export default function HelpContactPage() {
  return <ContactSupportView />;
}
