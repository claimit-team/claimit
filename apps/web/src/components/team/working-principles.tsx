const principles = [
  {
    title: "User control by default",
    description:
      "Users review and approve all actions. Agents assist but do not act without consent.",
  },
  {
    title: "Explainable agent decisions",
    description:
      "Every recommendation comes with reasoning. Users understand why an action is suggested.",
  },
  {
    title: "No invented refund numbers",
    description:
      "We only surface actual price differences from verified sources. No speculative savings.",
  },
  {
    title: "Practical automation over novelty",
    description:
      "We prioritize workflows that save real time over impressive but impractical features.",
  },
  {
    title: "Calm financial product design",
    description: "Money matters deserve a serious interface. No gamification or urgency tactics.",
  },
];

export function WorkingPrinciples() {
  return (
    <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Working principles
        </h2>
        <div className="space-y-6">
          {principles.map((principle) => (
            <div
              key={principle.title}
              className="rounded-lg border border-neutral-200 bg-neutral-0 p-5"
            >
              <h3 className="text-base font-medium text-neutral-900">{principle.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                {principle.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
