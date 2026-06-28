import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        'surface-elevated': 'var(--surface-elevated)',
        border: 'var(--border)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        error: 'var(--error)',
        warning: 'var(--warning)',
        info: 'var(--info)',
        'sph-green': 'var(--accent)',
        'sph-blue': 'var(--info)',
        'sph-red': 'var(--error)',
        'sph-amber': 'var(--warning)',
        'sph-dark': 'var(--background)',
        'sph-light': 'var(--surface)',
        'sph-neutral': 'var(--text-muted)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.4)',
          },
          '50%': {
            boxShadow: '0 0 20px 10px rgba(16, 185, 129, 0.15)',
          },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
