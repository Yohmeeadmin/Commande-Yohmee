import { Resend } from 'resend';

// Resend client — returns null if RESEND_API_KEY is not configured
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? null;
export const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@bdk.ma';
