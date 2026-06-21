import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0F172A',
};

export const metadata: Metadata = {
  title: 'SPH Attendance',
  description: 'Swahilipot Hub — Attendance & People Management Platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SPH Attendance',
  },
  openGraph: {
    type: 'website',
    title: 'SPH Attendance',
    description: 'Swahilipot Hub — Attendance & People Management Platform',
    siteName: 'SPH Attendance',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${plusJakartaSans.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
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
