import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SPH Attendance System',
  description: 'Swahilipot Hub — Attendance & People Management Platform',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
