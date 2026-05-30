"use client";

/**
 * AnimatedCurrency — count-up animation for currency totals.
 *
 * Mounts at 0 and springs to `value` on the first dashboard visit each
 * browser session; subsequent mounts initialize at the final amount.
 * Uses motion/react's useSpring for spring physics that decelerates
 * naturally rather than a linear ramp; the (stiffness, damping, mass)
 * tuple targets ~800ms settle for the dollar ranges we render in the
 * dashboard hero (single dollars to mid-thousands).
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
import { useEffect, useRef } from "react";

const ANIMATION_FLAG_KEY = "claimit:dashboard-currency-animated";
let cachedHasAnimated: boolean | null = null;

function readHasAnimated(): boolean {
  if (cachedHasAnimated !== null) return cachedHasAnimated;
  if (typeof window === "undefined") return false;
  try {
    cachedHasAnimated = sessionStorage.getItem(ANIMATION_FLAG_KEY) === "1";
  } catch {
    cachedHasAnimated = false;
  }
  return cachedHasAnimated;
}

function markAnimated(): void {
  cachedHasAnimated = true;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ANIMATION_FLAG_KEY, "1");
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

/** Clears the per-session animation flag. Call on sign-out. */
export function resetAnimatedCurrencySession(): void {
  cachedHasAnimated = false;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ANIMATION_FLAG_KEY);
  } catch {
    // ignore
  }
}

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
  const shouldAnimateRef = useRef<boolean>(!readHasAnimated());
  const initialValue = shouldAnimateRef.current ? 0 : value;

  const motionValue = useMotionValue(initialValue);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 22, mass: 1 });
  const formatted = useTransform(spring, (latest) => CURRENCY_FORMATTER.format(latest));

  useEffect(() => {
    motionValue.set(value);
    if (shouldAnimateRef.current) {
      markAnimated();
      shouldAnimateRef.current = false;
    }
  }, [motionValue, value]);

  return <motion.span className={className}>{formatted}</motion.span>;
}
