'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';

export default function Home() {
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sph-theme');
    if (savedTheme === 'light') {
      setIsLightMode(true);
      document.documentElement.classList.add('light');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isLightMode;
    setIsLightMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('light');
      localStorage.setItem('sph-theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('sph-theme', 'dark');
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-6 right-6 h-11 w-11 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="Toggle theme"
      >
        {isLightMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo/swahilipot.png" alt="Swahilipot Hub" className="h-16 w-auto" />
        </div>

        <h1>
          <span className="block text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Attendance,
          </span>
          <span className="block text-3xl font-bold tracking-tight text-sph-green sm:text-5xl">
            reimagined.
          </span>
        </h1>

        <p className="mt-6 max-w-sm text-base text-[var(--text-secondary)]">
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

      <p className="absolute bottom-8 text-xs text-[var(--text-muted)]">
        Built for Swahilipot Hub, Mombasa
      </p>
    </main>
  );
}
