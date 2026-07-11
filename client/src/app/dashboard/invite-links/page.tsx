'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Link as LinkIcon,
  Copy,
  Check,
  XCircle,
  RefreshCw,
  Plus,
  Loader2,
  AlertTriangle,
  Users,
  ChevronDown,
  Hash,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get, post, patch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

// ── Types ──

interface CohortInfo {
  id: string;
  name: string;
  startDate: string;
}

interface DeptInfo {
  id: string;
  name: string;
}

interface InviteLinkRow {
  id: string;
  token: string;
  cohortId: string;
  departmentId: string | null;
  expiresAt: string;
  revokedAt: string | null;
  isActive: boolean;
  maxUses: number;
  usedCount: number;
  createdAt: string;
  cohort: CohortInfo;
  department: DeptInfo | null;
}

interface InviteListResponse {
  invites: InviteLinkRow[];
}

interface CohortOption {
  id: string;
  name: string;
  startDate: string;
}

interface DeptOption {
  id: string;
  name: string;
}

interface CreateInviteBody {
  cohortId: string;
  departmentId?: string | null;
  maxUses?: number;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000';

function getInviteUrl(token: string): string {
  return `${BASE_URL}/register?token=${token}`;
}

// ── Helpers ──

type InviteStatus = 'active' | 'expired' | 'revoked' | 'used_up';

function getInviteStatus(invite: InviteLinkRow): {
  label: string;
  className: string;
  status: InviteStatus;
} {
  if (invite.revokedAt) {
    return {
      label: 'Revoked',
      className: 'bg-sph-red/10 text-sph-red border-sph-red/20',
      status: 'revoked',
    };
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return {
      label: 'Expired',
      className: 'bg-muted text-muted-foreground border-[var(--border)]',
      status: 'expired',
    };
  }
  if (invite.usedCount >= invite.maxUses) {
    return {
      label: 'Used Up',
      className: 'bg-sph-amber/10 text-sph-amber border-sph-amber/20',
      status: 'used_up',
    };
  }
  return {
    label: 'Active',
    className: 'bg-sph-green/10 text-sph-green border-sph-green/20',
    status: 'active',
  };
}

function formatDateTime(iso: string): string {
  return format(new Date(iso + (iso.endsWith('Z') ? '' : 'Z')), 'MMM d, yyyy HH:mm');
}

function formatDate(iso: string): string {
  return format(new Date(iso + (iso.endsWith('Z') ? '' : 'Z')), 'MMM d, yyyy');
}

// ── Skeleton ──

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg bg-[var(--surface-elevated)]" />
      ))}
    </div>
  );
}

// ── Page ──

export default function InviteLinksPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Guard redirect — must come before other effects for ordering
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, router]);

  // Data
  const [invites, setInvites] = useState<InviteLinkRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [maxUsesInput, setMaxUsesInput] = useState('1');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<InviteLinkRow | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<InviteLinkRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Fetch ──

  const fetchInvites = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await get<InviteListResponse>('/invites');
      setInvites(data.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invite links');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role === 'SUPER_ADMIN') {
      void fetchInvites();
    }
  }, [user, fetchInvites]);

  if (!user || user.role !== 'SUPER_ADMIN') return null;

  // ── Create dialog ──

  const openCreateDialog = async () => {
    setCreatedLink(null);
    setSelectedCohortId('');
    setSelectedDeptId('');
    setMaxUsesInput('1');
    setCopied(false);
    try {
      const [cohortRes, deptRes] = await Promise.all([
        get<{ cohorts: CohortOption[] }>('/invites/cohorts'),
        get<{ departments: DeptOption[] }>('/invites/departments'),
      ]);
      setCohorts(cohortRes.cohorts);
      setDepartments(deptRes.departments);
    } catch {
      // Will show empty dropdowns
    }
    setCreateOpen(true);
  };

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId);

  const handleCreate = async () => {
    if (!selectedCohortId) return;
    setCreating(true);
    try {
      const body: CreateInviteBody = {
        cohortId: selectedCohortId,
        maxUses: Math.max(1, parseInt(maxUsesInput, 10) || 1),
      };
      if (selectedDeptId) body.departmentId = selectedDeptId;

      const res = await post<{ invite: InviteLinkRow }>('/invites', body);
      setCreatedLink(res.invite);
      setInvites((prev) => [res.invite, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite link');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getInviteUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = getInviteUrl(token);
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Revoke ──

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await patch<{ invite: InviteLinkRow }>(`/invites/${revokeTarget.id}/revoke`);
      setInvites((prev) => prev.map((i) => (i.id === revokeTarget.id ? res.invite : i)));
      setRevokeTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite link');
    } finally {
      setRevoking(false);
    }
  };

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sph-green/10">
            <LinkIcon className="h-5 w-5 text-sph-green" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Invite Links</h1>
            <p className="text-sm text-muted">Generate and manage registration links for cohorts</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button onClick={openCreateDialog} className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Create Link
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Invite Link</DialogTitle>
              <DialogDescription>
                Generate a new registration link for a cohort. The link expires after the cohort
                start date passes.
              </DialogDescription>
            </DialogHeader>

            {createdLink ? (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-sph-green/20 bg-sph-green/5 p-4">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-sph-green" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Invite link created!
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Share this link with attachees to register:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]">
                      {getInviteUrl(createdLink.token)}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(createdLink.token)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)]"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-sph-green" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted">
                  <p>
                    Cohort:{' '}
                    <span className="font-medium text-[var(--text-primary)]">
                      {createdLink.cohort.name}
                    </span>
                  </p>
                  <p>
                    Expires:{' '}
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatDate(createdLink.expiresAt)}
                    </span>
                  </p>
                  {createdLink.department && (
                    <p>
                      Department:{' '}
                      <span className="font-medium text-[var(--text-primary)]">
                        {createdLink.department.name}
                      </span>
                    </p>
                  )}
                  <p>
                    Max uses:{' '}
                    <span className="font-medium text-[var(--text-primary)]">
                      {createdLink.maxUses}
                    </span>
                  </p>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline">Done</Button>} />
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* Cohort select */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">
                    Cohort <span className="text-sph-red">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCohortId}
                      onChange={(e) => setSelectedCohortId(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-3 pr-8 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
                    >
                      <option value="">Select a cohort</option>
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — starts {formatDate(c.startDate)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  </div>
                </div>

                {/* Department select (optional) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">
                    Department <span className="text-xs text-muted">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedDeptId}
                      onChange={(e) => setSelectedDeptId(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-3 pr-8 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
                    >
                      <option value="">Any department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  </div>
                </div>

                {/* Max uses */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">
                    Max uses <span className="text-xs text-muted">(default: 1)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxUsesInput}
                    onChange={(e) => setMaxUsesInput(e.target.value)}
                    placeholder="1"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-muted focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
                  />
                </div>

                {/* Auto-expiry info */}
                {selectedCohort && (
                  <p className="text-xs text-muted">
                    {'Link will expire on '}
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatDate(
                        new Date(selectedCohort.startDate) > new Date() &&
                          new Date(selectedCohort.startDate) <
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                          ? selectedCohort.startDate
                          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                      )}
                    </span>{' '}
                    (7 days from now
                    {new Date(selectedCohort.startDate) > new Date()
                      ? ', capped at cohort start date'
                      : ''}
                    )
                  </p>
                )}

                {error && <p className="text-sm text-sph-red">{error}</p>}

                <DialogFooter>
                  <DialogClose render={<Button variant="outline">Cancel</Button>} />
                  <Button onClick={handleCreate} disabled={!selectedCohortId || creating}>
                    {creating ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Generate Link'
                    )}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banner */}
      {error && !createOpen && (
        <Card className="border-sph-red/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-sph-red" />
            <p className="flex-1 text-sm text-sph-red">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-muted transition-colors hover:text-[var(--text-primary)]"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && <TableSkeleton />}

      {/* Empty state */}
      {!isLoading && !error && invites.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sph-green/10">
              <Users className="h-7 w-7 text-sph-green" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              No invite links yet
            </h2>
            <p className="max-w-sm text-center text-sm text-muted">
              Create your first invite link to start onboarding attachees to your cohorts.
            </p>
            <Button onClick={openCreateDialog} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Create your first invite link
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Invite table */}
      {!isLoading && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Invite Links</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const st = getInviteStatus(inv);
                  const isActive = st.status === 'active';
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium text-[var(--text-primary)]">
                        {inv.cohort.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.department?.name ?? (
                          <span className="text-xs italic text-muted">Any</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={st.className}>
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="tabular-nums">
                          {inv.usedCount} / {inv.maxUses}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(inv.expiresAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(inv.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(inv.token)}
                            title="Copy link"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-sph-green" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => setRevokeTarget(inv)}
                              title="Revoke link"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sph-red/10 hover:text-sph-red"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Revoke confirmation dialog */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Invite Link</DialogTitle>
            <DialogDescription>
              This will immediately invalidate the invite link. Anyone who tries to register with
              this link will see an error. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {revokeTarget && (
            <div className="space-y-3 rounded-xl border border-sph-red/20 bg-sph-red/5 p-4 text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-sph-red" />
                <span className="font-medium text-sph-red">Revoke this link?</span>
              </div>
              <div className="space-y-1 text-muted">
                <p>
                  Cohort:{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {revokeTarget.cohort.name}
                  </span>
                </p>
                <p>
                  Created:{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {formatDateTime(revokeTarget.createdAt)}
                  </span>
                </p>
                <p>
                  Used:{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {revokeTarget.usedCount} / {revokeTarget.maxUses}
                  </span>
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking}
              className="flex items-center gap-1.5"
            >
              {revoking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Revoking...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Revoke Link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry on error */}
      {!isLoading && error && invites.length === 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={fetchInvites} className="flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
