"use client";

/**
 * AnimatedCurrency — count-up animation for currency totals.
 *
 * Mounts at 0 and springs to `value`. Uses motion/react's useSpring for
 * spring physics that decelerates naturally rather than a linear ramp;
 * the (stiffness, damping, mass) tuple targets ~800ms settle for the
 * dollar ranges we render in the dashboard hero (single dollars to mid-
 * thousands).
 *
 * Display uses Intl.NumberFormat USD with 2 fraction digits so cents
 * from backend amounts (e.g. claim outcomes resolved at $342.50) are
 * preserved — the spring interpolates smoothly through cents during
 * the count-up, which is the correct visual.
 *
 * `tabular-nums` is applied at the call site (matches existing hero
 * components) so sibling labels stay locked.
 */

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

export type AnimatedCurrencyProps = {
  value: number;
  className?: string;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AnimatedCurrency({ value, className }: AnimatedCurrencyProps) {
  const motionValue = useMotionValue(0);
  // ~800ms settle for typical dashboard amounts; quick visual confirmation
  // without stealing focus from page content. Tuned empirically.
  const spring = useSpring(motionValue, { stiffness: 120, damping: 22, mass: 1 });
  const formatted = useTransform(spring, (latest) => CURRENCY_FORMATTER.format(latest));

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  return <motion.span className={className}>{formatted}</motion.span>;
}
