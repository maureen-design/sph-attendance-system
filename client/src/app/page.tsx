'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    <main className="relative flex min-h-screen flex-col overflow-hidden px-6">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Image
          src="/images/swahili.jpg"
          alt=""
          fill
          sizes="100vw"
          className={`object-cover ${isLightMode ? 'opacity-[0.04]' : 'opacity-[0.05]'}`}
          priority
          aria-hidden
        />
        <div
          className={`absolute inset-0 ${
            isLightMode
              ? 'bg-gradient-to-b from-[#F5F0E8]/95 via-[#FAF7F2]/90 to-[#F5F0E8]/95'
              : 'bg-gradient-to-b from-[#0F172A]/95 via-[#0F172A]/90 to-[#0F172A]/95'
          }`}
        />
      </div>

      {/* Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-all duration-150 hover:text-[var(--text-primary)]"
        aria-label="Toggle theme"
      >
        {isLightMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Content */}
      <div className="z-10 flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full flex-col items-center">
          {/* Logo */}
          <Image
            src="/images/logo/swahilipot.png"
            alt=""
            role="presentation"
            width={280}
            height={48}
            className={`h-auto w-[160px] sm:w-[200px] lg:w-[280px] ${!isLightMode ? 'drop-shadow-lg' : ''}`}
            priority
          />
          <p className="mt-6 text-center text-lg tracking-[0.2em] text-[var(--text-primary)]/80 uppercase">
            Swahilipot Hub
          </p>

          {/* Separator */}
          <div className="mt-8 h-px w-20 bg-[var(--accent)]/30" />

          {/* Heading */}
          <h1 className="mt-10 text-center text-4xl font-bold leading-[0.9] text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
            <span>Attendance,</span>
            <br />
            <span>reimagined.</span>
          </h1>

          {/* Tagline */}
          <p className="mt-8 max-w-sm text-center text-lg text-[var(--text-secondary)]">
            One tap. Every day.
            <br />
            For everyone at SPH.
          </p>

          {/* Buttons */}
          <div className="mt-14 flex w-full flex-col items-center gap-5 sm:w-auto sm:flex-row">
            <Link
              href="/login"
              className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-[var(--accent)] px-10 text-center font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-[var(--accent)] px-10 text-center font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="z-10 border-t border-[var(--border)] py-8">
        <p className="text-center text-xs tracking-wide text-[var(--text-muted)]">
          Swahilipot Hub &middot; Mombasa &middot; Kenya
        </p>
      </footer>
    </main>
  );
}
