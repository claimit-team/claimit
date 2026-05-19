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
 * `tabular-nums` is applied at the call site (matches existing hero
 * components) so sibling labels stay locked.
 */

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

export type AnimatedCurrencyProps = {
  value: number;
  className?: string;
  /** Currency symbol prefix; defaults to "$". Pass "" for unprefixed numbers. */
  prefix?: string;
};

export function AnimatedCurrency({ value, className, prefix = "$" }: AnimatedCurrencyProps) {
  const motionValue = useMotionValue(0);
  // ~800ms settle for typical dashboard amounts; quick visual confirmation
  // without stealing focus from page content. Tuned empirically.
  const spring = useSpring(motionValue, { stiffness: 120, damping: 22, mass: 1 });
  const formatted = useTransform(
    spring,
    (latest) => `${prefix}${Math.round(latest).toLocaleString()}`,
  );

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  return <motion.span className={className}>{formatted}</motion.span>;
}
