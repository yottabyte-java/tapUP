import { LogoutButton } from "@/components/LogoutButton";

export function CustomerAccountHeader({
  description,
}: {
  description?: string;
}) {
  return (
    <header className="mb-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">Your Buying Power</h1>
        {description && <p className="mt-1 text-xs text-foreground/65">{description}</p>}
      </div>
      <LogoutButton className="shrink-0" />
    </header>
  );
}
