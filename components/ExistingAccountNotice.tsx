import Link from "next/link";

export function ExistingAccountNotice() {
  return (
    <div className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber" role="alert">
      <p>An account with this email already exists.</p>
      <p className="mt-1">
        <Link className="font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href="/login">
          Log in
        </Link>
        <span> to continue. Password reset is not available in this app yet.</span>
      </p>
    </div>
  );
}
