import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`[config] Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  NODE_ENV: requireEnv('NODE_ENV', 'development'),
  PORT: parseInt(requireEnv('PORT', '4000'), 10),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_ACCESS_SECRET: requireEnv('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  CLIENT_URL: requireEnv('CLIENT_URL', 'http://localhost:3000'),
  CORS_ORIGIN: requireEnv('CORS_ORIGIN', 'http://localhost:3000'),
  isDev: requireEnv('NODE_ENV', 'development') === 'development',
} as const;
