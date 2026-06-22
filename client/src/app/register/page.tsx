'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { post, ApiError } from '@/lib/api';

function RegisterForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) return;

    setIsLoading(true);
    try {
      await post('/auth/register', {
        fullName,
        email,
        phone: phone || undefined,
        password,
        inviteToken: token,
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

  // ── Success state ──
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sph-dark px-6">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <CheckCircle className="mb-4 h-16 w-16 text-sph-green" />
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            Account created successfully!
          </h2>
          <p className="mt-2 text-sm text-secondary">Please log in to continue.</p>
          <Link
            href="/login"
            className="mt-8 w-full rounded-xl bg-sph-green py-3 text-center font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sph-dark px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo badge */}
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-sph-green/30 bg-sph-green/10">
            <span className="text-lg font-bold text-sph-green">SPH</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-secondary">
            You&apos;ve been invited to join SPH Attendance
          </p>
        </div>

        {/* Token status banner */}
        {token ? (
          <div className="mb-6 rounded-xl border border-sph-green/30 bg-sph-green/10 px-4 py-3 text-sm text-sph-green">
            Invite link verified
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
            No invite token found. Please use your invite link.
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          {...(!token && { 'aria-disabled': true })}
        >
          <fieldset className="flex flex-col gap-5" disabled={!token || isLoading}>
            {/* Full Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              />
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 700 000 000"
                className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              />
              <span className="text-xs text-muted">
                Optional but recommended for account recovery
              </span>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={passwordsMismatch}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {passwordsMismatch && (
                <span className="text-sm text-sph-red">Passwords do not match</span>
              )}
            </div>
          </fieldset>

          {/* Submit */}
          <button
            type="submit"
            disabled={!token || isLoading || passwordsMismatch}
            className="flex items-center justify-center rounded-xl bg-sph-green py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25 disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
              {error}
            </div>
          )}
        </form>

        {/* Bottom link */}
        <p className="mt-6 text-center text-sm text-secondary">
          Already have an account?{' '}
          <Link href="/login" className="text-sph-blue hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sph-dark">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sph-green border-t-transparent" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
