"use client";

import { motion } from "motion/react";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { WelcomeCard } from "@/components/onboarding/welcome-card";

export default function OnboardingWelcomePage() {
  return (
    <>
      <StepIndicator currentStep={1} totalSteps={3} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8 lg:p-10"
      >
        <WelcomeCard />
      </motion.div>
    </>
  );
}
