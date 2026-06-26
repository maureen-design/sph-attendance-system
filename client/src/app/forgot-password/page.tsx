'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { post, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await post('/auth/forgot-password', {
        email,
        orgShortName: organization,
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sph-green/10">
            <CheckCircle className="h-8 w-8 text-sph-green" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">Check your email</h2>
          <p className="mt-2 text-sm text-secondary">
            If an account exists for {email}, we&apos;ve sent password reset instructions.
          </p>
          <Link
            href="/login"
            className="mt-8 flex items-center gap-2 rounded-xl bg-sph-green px-6 py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel (desktop only) */}
      <div className="hidden w-1/2 flex-col items-center justify-between surface px-12 py-16 lg:flex">
        <div />
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sph-green/30 bg-sph-green/10">
            <span className="text-xl font-bold text-sph-green">SPH</span>
          </div>
          <p className="mt-8 text-lg italic text-secondary">
            &ldquo;We&apos;ll help you get back in.&rdquo;
          </p>
        </div>
        <p className="text-xs text-muted">SPH Attendance System</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link
            href="/login"
            className="mb-8 flex items-center gap-1.5 text-sm text-secondary transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Reset password</h1>
          <p className="mt-1 text-sm text-secondary">
            Enter your email and organization to receive reset instructions.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-secondary">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-sph-blue focus:ring-1 focus:ring-sph-blue"
                />
              </div>
            </div>

            {/* Organization */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="organization" className="text-sm font-medium text-secondary">
                Organization
              </label>
              <input
                id="organization"
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. SPH"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-sph-blue focus:ring-1 focus:ring-sph-blue"
              />
              <span className="text-xs text-muted">Enter your organization short name</span>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !email.trim() || !organization.trim()}
              className="mt-2 flex items-center justify-center rounded-xl bg-sph-green py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25 disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </>
              ) : (
                'Send Reset Instructions'
              )}
            </button>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
