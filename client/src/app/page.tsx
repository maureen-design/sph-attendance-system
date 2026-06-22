import Link from 'next/link';

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-sph-dark px-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sph-green/30 bg-sph-green/10">
            <span className="text-xl font-bold text-sph-green">SPH</span>
          </div>
          <span className="mt-2 text-sm text-slate-400">Swahilipot Hub</span>
        </div>

        <h1>
          <span className="block text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Attendance,
          </span>
          <span className="block text-3xl font-bold tracking-tight text-sph-green sm:text-5xl">
            reimagined.
          </span>
        </h1>

        <p className="mt-6 max-w-sm text-base text-slate-400">
          One tap. Every day. For everyone at SPH.
        </p>

        <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/login"
            className="rounded-2xl bg-sph-green px-8 py-3 text-center font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-emerald-400"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="rounded-2xl border border-sph-green/40 px-8 py-3 text-center font-semibold text-sph-green transition-all duration-150 hover:bg-sph-green/10"
          >
            Register via Invite
          </Link>
        </div>
      </div>

      <p className="absolute bottom-8 text-xs text-slate-500">Built for Swahilipot Hub, Mombasa</p>
    </main>
  );
}
