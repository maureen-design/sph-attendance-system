'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { post, ApiError } from '@/lib/api';

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const userId = searchParams.get('userId');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState<'generic' | 'invalid' | 'expired'>('generic');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isFormValid =
    !!token &&
    !!userId &&
    newPassword.length >= 8 &&
    confirmPassword.length >= 8 &&
    !passwordsMismatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorType('generic');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token || !userId) return;

    setIsLoading(true);
    try {
      await post('/auth/reset-password', {
        userId,
        token,
        newPassword,
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.message;
        setError(msg);
        if (msg === 'Reset link has expired') {
          setErrorType('expired');
        } else if (msg.toLowerCase().includes('invalid')) {
          setErrorType('invalid');
        } else {
          setErrorType('generic');
        }
      } else {
        setError('Something went wrong. Please try again.');
        setErrorType('generic');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Missing or invalid token
  if (!token || !userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sph-red/10">
            <AlertCircle className="h-8 w-8 text-sph-red" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">Invalid reset link</h2>
          <p className="mt-2 text-sm text-secondary">
            This link is missing or invalid. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="mt-8 rounded-xl bg-sph-green px-6 py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sph-green/10">
            <CheckCircle className="h-8 w-8 text-sph-green" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">Password updated</h2>
          <p className="mt-2 text-sm text-secondary">
            Your password has been reset. Please log in with your new password.
          </p>
          <Link
            href="/login"
            className="mt-8 flex items-center gap-2 rounded-xl bg-sph-green px-6 py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25"
          >
            Go to Login
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
            &ldquo;Choose a strong password you haven&apos;t used before.&rdquo;
          </p>
        </div>
        <p className="text-xs text-muted">SPH Attendance System</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-sph-green/30 bg-sph-green/10">
              <Lock className="h-6 w-6 text-sph-green" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">Set new password</h1>
            <p className="mt-1 text-sm text-secondary">Must be at least 8 characters</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* New Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium text-secondary">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-3 pl-10 pr-12 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-sph-blue focus:ring-1 focus:ring-sph-blue"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-secondary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-secondary">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-3 pl-10 pr-12 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-sph-blue focus:ring-1 focus:ring-sph-blue"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-secondary"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordsMismatch && (
                <span className="text-sm text-sph-red">Passwords do not match</span>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="mt-2 flex items-center justify-center rounded-xl bg-sph-green py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25 disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </button>

            {/* Error — invalid or expired link */}
            {error && errorType !== 'generic' && (
              <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
                <p className="font-medium">
                  {errorType === 'expired' ? 'This link has expired.' : "This link isn't valid."}
                </p>
                <p className="mt-1 text-sph-red/80">
                  {errorType === 'expired'
                    ? 'Password reset links expire after 30 minutes for security. Please request a new one.'
                    : 'It may have already been used or is incorrect. Please request a new one.'}
                </p>
                <Link
                  href="/forgot-password"
                  className="mt-3 inline-block text-sm font-medium text-sph-blue hover:underline"
                >
                  Request new link →
                </Link>
              </div>
            )}

            {/* Error — generic */}
            {error && errorType === 'generic' && (
              <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
                {error}
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-secondary">
            <Link href="/login" className="text-sph-blue hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sph-green border-t-transparent" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetForm />
    </Suspense>
  );
}
