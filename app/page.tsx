export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-8 text-center shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          tap<span className="text-teal">UP</span>
        </h1>
        <p className="mt-4 text-lg font-semibold">
          The spaza tab, but with a record.
        </p>
        <p className="mt-2 text-sm text-white/60">Project scaffold ready.</p>
      </section>
    </main>
  );
}
