import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'sph-green': '#10B981',
        'sph-blue': '#2563EB',
        'sph-red': '#EF4444',
        'sph-dark': '#0F172A',
        'sph-light': '#F8F9FA',
      },
    },
  },
  plugins: [],
};

export default config;
