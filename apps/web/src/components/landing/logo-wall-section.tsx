"use client";

import { motion } from "motion/react";

type Logo = { name: string; src: string };

// Row 1 scrolls right-to-left, row 2 scrolls left-to-right.
// Categories intentionally mixed (no airline/hotel/retail grouping).
const row1: Logo[] = [
  { name: "Amazon", src: "/partnerlogo/amazon.svg" },
  { name: "Hilton", src: "/partnerlogo/hilton.svg" },
  { name: "Target", src: "/partnerlogo/target.svg" },
  { name: "JetBlue", src: "/partnerlogo/jetblue.svg" },
  { name: "Best Buy", src: "/partnerlogo/bestbuy.svg" },
  { name: "Marriott", src: "/partnerlogo/marriott.svg" },
  { name: "Walmart", src: "/partnerlogo/walmart.svg" },
  { name: "Dell", src: "/partnerlogo/dell.svg" },
  { name: "Southwest", src: "/partnerlogo/southwestairlines.svg" },
  { name: "Costco", src: "/partnerlogo/costco.svg" },
  { name: "Home Depot", src: "/partnerlogo/homedepot.svg" },
  { name: "Hyatt", src: "/partnerlogo/hyatt.svg" },
  { name: "Nordstrom", src: "/partnerlogo/nordstrom.svg" },
];

const row2: Logo[] = [
  { name: "Delta", src: "/partnerlogo/delta.svg" },
  { name: "Lowe's", src: "/partnerlogo/lowes.svg" },
  { name: "IHG", src: "/partnerlogo/ihg.svg" },
  { name: "Macy's", src: "/partnerlogo/macys.svg" },
  { name: "American", src: "/partnerlogo/americanairlines.svg" },
  { name: "Staples", src: "/partnerlogo/staples.svg" },
  { name: "Wyndham", src: "/partnerlogo/wyndham.svg" },
  { name: "Dick's", src: "/partnerlogo/dicks.svg" },
  { name: "United", src: "/partnerlogo/unitedairlines.svg" },
  { name: "Crutchfield", src: "/partnerlogo/crutchfield.svg" },
  { name: "Newegg", src: "/partnerlogo/newegg.svg" },
  { name: "Alaska", src: "/partnerlogo/alaskaair.svg" },
  { name: "JCPenney", src: "/partnerlogo/jcpenney.svg" },
];

const EDGE_MASK =
  "linear-gradient(to right, transparent, black 80px, black calc(100% - 80px), transparent)";

const LOGO_CLASSES =
  "h-10 w-auto shrink-0 opacity-60 grayscale transition-opacity duration-300 " +
  "hover:opacity-80 " +
  "dark:opacity-50 dark:invert dark:hover:opacity-70";

function MarqueeRow({
  logos,
  direction,
  prefix,
}: {
  logos: Logo[];
  direction: "left" | "right";
  prefix: string;
}) {
  return (
    <div
      className="group relative overflow-hidden"
      style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
    >
      <div
        className={`marquee-track marquee-track-${direction} flex w-max items-center gap-12 group-hover:[animation-play-state:paused]`}
      >
        {logos.map((logo) => (
          // biome-ignore lint/performance/noImgElement: static SVGs with mixed intrinsic sizes; CSS height drives output, next/image cannot
          <img
            key={`${prefix}-a-${logo.name}`}
            src={logo.src}
            alt={logo.name}
            className={LOGO_CLASSES}
            loading="lazy"
            decoding="async"
          />
        ))}
        {logos.map((logo) => (
          // biome-ignore lint/performance/noImgElement: static SVGs with mixed intrinsic sizes; CSS height drives output, next/image cannot
          <img
            key={`${prefix}-b-${logo.name}`}
            src={logo.src}
            alt=""
            aria-hidden="true"
            className={LOGO_CLASSES}
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}

export function LogoWallSection() {
  return (
    <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <p className="text-center text-sm font-medium text-neutral-500">
          Trusted across 26 platforms
        </p>
        <div className="mt-8 space-y-4 sm:space-y-8">
          <MarqueeRow logos={row1} direction="left" prefix="r1" />
          <MarqueeRow logos={row2} direction="right" prefix="r2" />
        </div>
      </motion.div>
    </section>
  );
}
