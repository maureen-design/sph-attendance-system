import app from './app.js';
import { config } from './config/env.js';
import { startJobs } from './jobs/index.js';

const start = () => {
  app
    .listen(config.PORT, () => {
      console.log(`[server] SPH Attendance API running on http://localhost:${config.PORT}`);
      console.log(`[server] Environment: ${config.NODE_ENV}`);
      console.log(`[server] Health check: http://localhost:${config.PORT}/api/health`);

      // Start background jobs
      startJobs();
    })
    .on('error', (err) => {
      console.error('[server] Failed to start:', err);
      process.exit(1);
    });
};

start();
