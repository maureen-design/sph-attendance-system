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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Background layers */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Image
          src="/images/swahili.jpg"
          alt=""
          fill
          sizes="100vw"
          className={`object-cover ${isLightMode ? 'opacity-[0.06]' : 'opacity-10'}`}
          priority
          aria-hidden
        />
        <div
          className={`absolute inset-0 ${
            isLightMode
              ? 'bg-gradient-to-b from-[#F5F0E8]/95 via-[#FAF7F2]/90 to-[#F5F0E8]/95'
              : 'bg-gradient-to-b from-[#0F172A]/92 via-[#0F172A]/88 to-[#0F172A]/92'
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
      <div className="z-10 flex w-full flex-col items-center lg:items-start">
        {/* Logo area */}
        <Image
          src="/images/logo/swahilipot.png"
          alt="Swahilipot Hub"
          width={280}
          height={48}
          className={`mx-auto h-auto w-[160px] sm:w-[200px] lg:mx-0 lg:w-[280px] ${!isLightMode ? 'drop-shadow-lg' : ''}`}
          priority
        />
        <p className="mt-4 text-center text-lg tracking-[0.2em] text-[var(--text-primary)]/80 uppercase lg:text-left">
          Swahilipot Hub
        </p>

        {/* Separator */}
        <div className="mx-auto mt-6 h-px w-20 bg-[var(--accent)]/30 lg:mx-0" />

        {/* Heading */}
        <h1 className="mt-8 text-center text-4xl font-bold leading-[0.9] text-[var(--text-primary)] sm:text-5xl lg:text-left lg:text-6xl">
          Attendance
        </h1>

        {/* Tagline */}
        <p className="mt-6 max-w-md text-center text-lg text-[var(--text-secondary)] lg:text-left">
          One tap. Every day.
          <br />
          For everyone at SPH.
        </p>

        {/* Buttons */}
        <div className="mt-12 flex w-full flex-col gap-6 sm:w-auto sm:flex-row sm:justify-center lg:justify-start">
          <Link
            href="/login"
            className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-[var(--accent)] px-8 text-center font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] sm:w-auto"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-[var(--accent)] px-8 text-center font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] sm:w-auto"
          >
            Get Started
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 z-10 border-t border-[var(--border)] py-6">
        <p className="text-center text-xs tracking-wide text-[var(--text-muted)]">
          Swahilipot Hub · Mombasa · Kenya
        </p>
      </footer>
    </main>
  );
}
