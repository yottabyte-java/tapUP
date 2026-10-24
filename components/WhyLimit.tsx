type WhyLimitProps = {
  reasons: string[];
};

export function WhyLimit({ reasons }: WhyLimitProps) {
  // WHY: Show the scoring engine's explanations verbatim rather than inventing customer claims.
  return (
    <section aria-label="Why this limit?" className="mt-5">
      <h3 className="text-sm font-semibold">Why this limit?</h3>
      <ul className="mt-2 space-y-2">
        {reasons.map((reason, index) => (
          <li className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground/85" key={`${index}-${reason}`}>
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
