import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SPH Attendance — Swahilipot Hub',
  description: 'One tap check-in. For everyone at SPH.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo/swahilipot.png',
    apple: '/logo/swahilipot.png',
  },
  openGraph: {
    title: 'SPH Attendance — Swahilipot Hub',
    description: 'One tap check-in. For everyone at SPH.',
    images: [{ url: '/images/logo/swahilipot.png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0F172A" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const savedTheme = localStorage.getItem('sph-theme');
                if (savedTheme === 'light') {
                  document.documentElement.classList.add('light');
                  document.querySelector('meta[name="theme-color"]').setAttribute('content', '#F5F0E8');
                } else {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
