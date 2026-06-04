// Typewriter-fillable OCR confirm panel for Beat06 — same field layout / fonts /
// spacing as src/uirefs (ConfirmContent right card), but values type in
// char-by-char. NOT a modification of the locked uiref — a beat-local variant.
import { CalendarIcon, ChevronDown } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const STAGGER = 14; // frames between field starts
const SPEED = 1.5; // chars per frame

// Field values — Costco iPad fixture (see uirefs/_data.ts).
const PLATFORM = "Costco";
const PRODUCT = "Apple iPad Air 11-inch (M2, 128GB, Wi-Fi)";
const PRICE = "599.99";
const DATE = "May 22, 2026";

function useTyped(text: string, start: number) {
  const frame = useCurrentFrame();
  const end = start + Math.ceil(text.length / SPEED);
  const n = Math.max(0, Math.min(text.length, Math.floor(interpolate(frame, [start, end], [0, text.length], CLAMP))));
  return { str: text.slice(0, n), typing: frame >= start && frame < end + 16, started: frame >= start };
}

const Caret: React.FC<{ on: boolean }> = ({ on }) => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 12) % 2 === 0;
  return <span style={{ opacity: on && blink ? 0.85 : 0, color: "#27466E", fontWeight: 400 }}>▏</span>;
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-sm font-medium text-neutral-700">{children}</span>
);

export const OcrConfirmPanel: React.FC<{ t0: number }> = ({ t0 }) => {
  const plat = useTyped(PLATFORM, t0);
  const prod = useTyped(PRODUCT, t0 + STAGGER);
  const price = useTyped(PRICE, t0 + STAGGER * 2);
  const date = useTyped(DATE, t0 + STAGGER * 3);

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-6">
      <div className="space-y-6">
        {/* Platform */}
        <div className="space-y-2">
          <Label>Platform</Label>
          <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm text-neutral-900">
            <span>
              {plat.str}
              <Caret on={plat.typing} />
            </span>
            <ChevronDown className="h-4 w-4 text-neutral-500" />
          </div>
        </div>

        {/* Product */}
        <div className="space-y-2">
          <Label>Product / item name</Label>
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm text-neutral-900">
            <span>
              {prod.str}
              <Caret on={prod.typing} />
            </span>
          </div>
        </div>

        {/* Purchase price */}
        <div className="space-y-2">
          <Label>Purchase price</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pl-7 pr-3 text-sm text-neutral-900">
              <span>
                {price.str}
                <Caret on={price.typing} />
              </span>
            </div>
          </div>
        </div>

        {/* Purchase date */}
        <div className="space-y-2">
          <Label>Purchase date</Label>
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm font-normal text-neutral-900">
            <CalendarIcon className="mr-2 h-4 w-4 text-neutral-500" />
            <span>
              {date.str}
              <Caret on={date.typing} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
