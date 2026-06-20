import { Resend } from 'resend';
import { config } from '../config/env.js';

function getResendClient(): Resend | null {
  if (!config.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set - email sending disabled');
    return null;
  }
  return new Resend(config.RESEND_API_KEY);
}

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  resetLink: string,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: config.EMAIL_FROM,
      to,
      subject: 'Reset your SPH Attendance password',
      text: `Hi ${fullName},\n\nClick this link to reset your password: ${resetLink}\n\nThis link expires in 30 minutes.`,
    });
  } catch (err) {
    console.error('[email] Failed to send password reset email:', err);
  }
}

export async function sendWelcomeEmail(
  to: string,
  fullName: string,
  loginLink: string,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: config.EMAIL_FROM,
      to,
      subject: 'Welcome to SPH Attendance',
      text: `Hi ${fullName},\n\nYour account is active. Log in here: ${loginLink}`,
    });
  } catch (err) {
    console.error('[email] Failed to send welcome email:', err);
  }
}

export async function sendCriticalAnnouncementEmail(
  to: string,
  fullName: string,
  title: string,
  body: string,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: config.EMAIL_FROM,
      to,
      subject: `[CRITICAL] ${title}`,
      text: `Hi ${fullName},\n\nA critical announcement was posted:\n\n${body}`,
    });
  } catch (err) {
    console.error('[email] Failed to send critical announcement email:', err);
  }
}

export async function sendExcuseDecisionEmail(
  to: string,
  fullName: string,
  decision: string,
  reason?: string,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: config.EMAIL_FROM,
      to,
      subject: `Your excuse request has been ${decision}`,
      text: `Hi ${fullName},\n\nYour absence excuse was ${decision}.${reason ? `\n\nReason: ${reason}` : ''}`,
    });
  } catch (err) {
    console.error('[email] Failed to send excuse decision email:', err);
  }
}
