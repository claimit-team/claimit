import type { Metadata } from "next";
import { CareersListView } from "@/components/careers/careers-list-view";

export const metadata: Metadata = {
  title: "Careers — ClaimIt",
  description: "Future role areas for ClaimIt plus an MVP interest flow for early inbound.",
};

export default function CareersPage() {
  return <CareersListView />;
}
