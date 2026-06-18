import { Resend } from 'resend';
import { config } from '../config/env.js';

const resend = new Resend(process.env.RESEND_API_KEY ?? '');

const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'SPH Attendance <noreply@sphattendance.com>';

function logEmail(to: string, subject: string, success: boolean): void {
  if (config.isDev) {
    const prefix = success ? '[email:ok]' : '[email:fail]';
    console.log(`${prefix} ${subject} → ${to}`);
  }
}

// ─── 1) Password Reset Email ────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  resetLink: string,
): Promise<void> {
  try {
    const subject = 'Reset your SPH Attendance password';
    const body = `Hi ${fullName},\n\nClick this link to reset your password: ${resetLink}\n\nThis link expires in 30 minutes.`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      text: body,
    });

    logEmail(to, subject, true);
  } catch (err) {
    logEmail(to, 'Password Reset', false);
    console.error(`[email] Failed to send password reset email to ${to}:`, (err as Error).message);
  }
}

// ─── 2) Welcome Email ───────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  fullName: string,
  loginLink: string,
): Promise<void> {
  try {
    const subject = 'Welcome to SPH Attendance';
    const body = `Hi ${fullName},\n\nYour account is active. Log in here: ${loginLink}`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      text: body,
    });

    logEmail(to, subject, true);
  } catch (err) {
    logEmail(to, 'Welcome', false);
    console.error(`[email] Failed to send welcome email to ${to}:`, (err as Error).message);
  }
}

// ─── 3) Critical Announcement Email ─────────────────────────────────────────

export async function sendCriticalAnnouncementEmail(
  to: string,
  fullName: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const subject = `[CRITICAL] ${title}`;
    const text = `Hi ${fullName},\n\nA critical announcement was posted: ${body}`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      text,
    });

    logEmail(to, subject, true);
  } catch (err) {
    logEmail(to, 'Critical Announcement', false);
    console.error(
      `[email] Failed to send critical announcement email to ${to}:`,
      (err as Error).message,
    );
  }
}

// ─── 4) Excuse Decision Email ───────────────────────────────────────────────

export async function sendExcuseDecisionEmail(
  to: string,
  fullName: string,
  decision: string,
  reason?: string,
): Promise<void> {
  try {
    const subject = `Your excuse request has been ${decision}`;
    const body = `Hi ${fullName},\n\nYour absence excuse was ${decision}.${reason ? ` ${reason}` : ''}`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      text: body,
    });

    logEmail(to, subject, true);
  } catch (err) {
    logEmail(to, 'Excuse Decision', false);
    console.error(`[email] Failed to send excuse decision email to ${to}:`, (err as Error).message);
  }
}
