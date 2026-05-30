import type { Metadata } from "next";
import { ContactSupportView } from "@/components/help/contact-support-view";

export const metadata: Metadata = {
  title: "Contact support | ClaimIt",
  description: "Reach our team and we'll respond soon.",
};

export default function HelpContactPage() {
  return <ContactSupportView />;
}
