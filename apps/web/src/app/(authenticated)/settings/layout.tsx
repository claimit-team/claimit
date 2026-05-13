import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata: Metadata = {
  title: "Settings — ClaimIt",
  description:
    "Manage your account, Gmail connection, send preferences, notifications, and billing.",
};

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Manage your account, Gmail connection, send preferences, notifications, and billing.
        </p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <SettingsNav />
        <div className="min-w-0 max-w-3xl flex-1">{children}</div>
      </div>
    </div>
  );
}
