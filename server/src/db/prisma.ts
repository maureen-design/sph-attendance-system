import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

const prisma = new PrismaClient({
  log: config.isDev ? ['query', 'info', 'warn', 'error'] : ['error'],
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[prisma] Received ${signal} — disconnecting...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export default prisma;
