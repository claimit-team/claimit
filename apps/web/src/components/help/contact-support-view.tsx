"use client";

import { ArrowLeft, BookOpen, CreditCard, HelpCircle, Info, Send, Shield } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const mockContactData = {
  topics: [
    "Getting started",
    "Gmail connection",
    "Claim workflow",
    "Claim outcome",
    "Billing",
    "Privacy or security",
    "Other",
  ],
  supportLinks: [
    { label: "How ClaimIt works", href: "/how-it-works", icon: BookOpen },
    { label: "Security and Gmail access", href: "/security", icon: Shield },
    { label: "Pricing", href: "/pricing", icon: CreditCard },
    { label: "FAQ", href: "/help", icon: HelpCircle },
  ],
  mockSubmitResult: {
    successMessage: "Message submitted in this mock flow.",
  },
};

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  topic?: string;
  message?: string;
}

export function ContactSupportView() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    topic: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.subject.trim()) {
      newErrors.subject = "Subject is required";
    }

    if (!formData.topic) {
      newErrors.topic = "Please select a topic";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message is required";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      setIsSubmitted(true);
      toast.success(mockContactData.mockSubmitResult.successMessage);
      setFormData({
        name: "",
        email: "",
        subject: "",
        topic: "",
        message: "",
      });
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  if (isSubmitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-foreground">Thank you for reaching out</CardTitle>
            <CardDescription className="text-muted-foreground">
              We will reply when available. You can send another message if needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setIsSubmitted(false)}>Send another message</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-12">
        <Link
          href="/help"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to help
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl text-balance">
          Contact support
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Send a question about ClaimIt, Gmail connection, claim workflows, or your account.
        </p>
      </div>

      {/* Main Content: Form + Guidance */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Contact Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Send a message</CardTitle>
              <CardDescription className="text-muted-foreground">
                We will reply when available.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      className={errors.name ? "border-destructive" : ""}
                    />
                    {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-foreground">
                    Subject <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="subject"
                    placeholder="Brief summary of your question"
                    value={formData.subject}
                    onChange={(e) => handleInputChange("subject", e.target.value)}
                    className={errors.subject ? "border-destructive" : ""}
                  />
                  {errors.subject && <p className="text-sm text-destructive">{errors.subject}</p>}
                </div>

                {/* Topic */}
                <div className="space-y-2">
                  <Label htmlFor="topic" className="text-foreground">
                    Topic <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.topic}
                    onValueChange={(value) => value && handleInputChange("topic", value)}
                  >
                    <SelectTrigger
                      id="topic"
                      className={`w-full ${errors.topic ? "border-destructive" : ""}`}
                    >
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockContactData.topics.map((topic) => (
                        <SelectItem key={topic} value={topic}>
                          {topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.topic && <p className="text-sm text-destructive">{errors.topic}</p>}
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message" className="text-foreground">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Describe your question or issue..."
                    rows={5}
                    value={formData.message}
                    onChange={(e) => handleInputChange("message", e.target.value)}
                    className={errors.message ? "border-destructive" : ""}
                  />
                  {errors.message && <p className="text-sm text-destructive">{errors.message}</p>}
                </div>

                <Button type="submit" className="w-full sm:w-auto">
                  <Send className="mr-2 h-4 w-4" />
                  Send message
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Account-specific Note */}
          <Alert className="mt-6">
            <Info className="h-4 w-4" />
            <AlertTitle className="text-foreground">A note about your privacy</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              If your question is about a specific claim or purchase, include the platform name and
              order context if you are comfortable sharing it. Do not include full payment card
              numbers.
            </AlertDescription>
          </Alert>
        </div>

        {/* Support Guidance Card */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Before you send</CardTitle>
              <CardDescription className="text-muted-foreground">
                You may find answers in these resources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3 text-sm">
                <li className="text-muted-foreground">
                  For Gmail questions, review{" "}
                  <Link href="/security" className="text-primary hover:underline">
                    Security
                  </Link>
                  .
                </li>
                <li className="text-muted-foreground">
                  For billing questions, review{" "}
                  <Link href="/pricing" className="text-primary hover:underline">
                    Pricing
                  </Link>
                  .
                </li>
                <li className="text-muted-foreground">
                  For workflow questions, review{" "}
                  <Link href="/how-it-works" className="text-primary hover:underline">
                    How it works
                  </Link>
                  .
                </li>
                <li className="text-muted-foreground">
                  For common issues, review{" "}
                  <Link href="/help" className="text-primary hover:underline">
                    Help Center
                  </Link>
                  .
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Common Links Section */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold text-foreground mb-6">Quick links</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mockContactData.supportLinks.map((link) => {
            const IconComponent = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="h-full transition-colors hover:bg-accent/50 cursor-pointer">
                  <CardContent className="flex items-center gap-3 py-4">
                    <IconComponent className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium text-foreground">{link.label}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Final Reassurance Section */}
      <section className="mt-16 border-t border-border pt-12">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold text-foreground mb-4 text-balance">
            ClaimIt is designed around user approval and transparent workflows.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            ClaimIt prepares claim materials based on price protection windows detected in your
            order confirmations. You remain in control of whether and when to submit any claim.
            Outcomes are often user-reported because external platforms (retailers, credit card
            issuers) resolve claims outside ClaimIt. We provide the preparation — you decide the
            action.
          </p>
        </div>
      </section>
    </div>
  );
}
