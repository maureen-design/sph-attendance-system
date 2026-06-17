import app from './app.js';
import { config } from './config/env.js';

const start = () => {
  app.listen(config.PORT, () => {
    console.log(`[server] SPH Attendance API running on http://localhost:${config.PORT}`);
    console.log(`[server] Environment: ${config.NODE_ENV}`);
    console.log(`[server] Health check: http://localhost:${config.PORT}/api/health`);
  });
};

start();
