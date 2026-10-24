import { formatRand } from "@/lib/money";

type LimitMeterProps = {
  limitCents: number;
  level: number;
  nextLimitCents: number;
};

export function LimitMeter({ limitCents, level, nextLimitCents }: LimitMeterProps) {
  // WHY: The ring and progress bar use the backend's current and next limits, never mockup amounts.
  const progress = nextLimitCents > 0
    ? Math.min(100, Math.round(limitCents / nextLimitCents * 100))
    : 100;
  const circumference = 2 * Math.PI * 45;
  const isTopLevel = limitCents === nextLimitCents;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-36">
        <svg
          aria-hidden="true"
          className="h-full w-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle cx="50" cy="50" fill="none" r="45" stroke="rgb(243 247 245 / 16%)" strokeWidth="7" />
          <circle
            cx="50"
            cy="50"
            fill="none"
            r="45"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress / 100)}
            strokeLinecap="round"
            strokeWidth="7"
            className="text-teal"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-center text-lg font-bold leading-tight">{formatRand(limitCents)}</span>
          <span className="mt-1 text-[10px] text-foreground/70">Current limit</span>
          <span className="mt-2 rounded-full bg-[#123B3A] px-3 py-1 text-[10px] font-semibold text-teal">
            Level {level}
          </span>
        </div>
      </div>

      <section aria-label="Progress to next level" className="rounded-xl bg-[#142329] p-3">
        <h3 className="text-[11px] text-foreground/75">
          {isTopLevel ? "Highest level" : "Next level"}
        </h3>
        <p className="mt-1 text-lg font-bold leading-tight">{formatRand(nextLimitCents)}</p>
        <div
          aria-label={`${progress}% of the next limit`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-teal transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-right text-[10px] text-foreground/70">
          {isTopLevel ? "Complete" : `${progress}%`}
        </p>
      </section>
    </div>
  );
}
