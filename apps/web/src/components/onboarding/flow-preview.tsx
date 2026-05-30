import { ChevronRight, Eye, RotateCcw, UploadCloud } from "lucide-react";

const flowSteps = [
  { label: "Upload", icon: UploadCloud },
  { label: "Monitor", icon: Eye },
  { label: "Reclaim", icon: RotateCcw },
] as const;

export function FlowPreview() {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      {flowSteps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-neutral-100">
              <step.icon className="size-5 text-neutral-600" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <span className="text-xs text-neutral-600">{step.label}</span>
          </div>
          {index < flowSteps.length - 1 ? (
            <ChevronRight
              className="-mt-4 size-4 text-neutral-300"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
