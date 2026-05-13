import { Mail, MapPin, MessageSquare, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const materialTypes = [
  {
    title: "Email draft",
    icon: Mail,
    whenUsed: "When the retailer accepts claim requests via email.",
    whatUserSees: "A pre-filled email with order details, price drop evidence, and refund request.",
    canAutoSend: true,
    autoSendNote: "Can be sent via Gmail if authorized and approved, or if auto-send is enabled.",
  },
  {
    title: "Chat script",
    icon: MessageSquare,
    whenUsed: "When the retailer uses live chat or messaging for support.",
    whatUserSees: "A conversation script with key points to copy and paste during the chat.",
    canAutoSend: false,
    autoSendNote: "Must be copied by the user into the retailer's chat interface.",
  },
  {
    title: "In-store guide",
    icon: MapPin,
    whenUsed: "When the retailer requires in-person visits for price adjustments.",
    whatUserSees: "A step-by-step guide with what to say and what documents to bring.",
    canAutoSend: false,
    autoSendNote: "Requires the user to visit the store in person.",
  },
  {
    title: "Self-service walkthrough",
    icon: Monitor,
    whenUsed: "When the retailer has an online self-service refund portal.",
    whatUserSees: "Instructions for navigating the retailer's portal with pre-filled values.",
    canAutoSend: false,
    autoSendNote: "Requires the user to complete the platform flow themselves.",
  },
] as const;

export function ClaimMaterialTypes() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
            The output matches the platform.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-neutral-700">
            ClaimIt generates the right type of claim material based on how each retailer handles
            requests.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {materialTypes.map((material) => (
            <Card key={material.title} className="border-neutral-200 bg-neutral-0">
              <CardHeader>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                    <material.icon className="h-5 w-5 text-neutral-700" aria-hidden />
                  </div>
                  <CardTitle className="text-lg text-neutral-900">{material.title}</CardTitle>
                </div>
                <CardDescription className="text-neutral-700">
                  <span className="font-medium">When used:</span> {material.whenUsed}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-neutral-700">
                  <span className="font-medium">What you see:</span> {material.whatUserSees}
                </p>
                <div className="flex items-start gap-2">
                  <Badge
                    variant={material.canAutoSend ? "secondary" : "outline"}
                    className={
                      material.canAutoSend
                        ? "bg-neutral-100 text-neutral-700"
                        : "border-neutral-200 text-neutral-600"
                    }
                  >
                    {material.canAutoSend ? "Auto-send eligible" : "Manual action required"}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-500">{material.autoSendNote}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
