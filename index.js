import { readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { initLogger, logger } from './src/logger.js';
import { initStorage } from './src/storage.js';
import { startScheduler, stopScheduler } from './src/scheduler.js';
import { handleRequest } from './src/server/router.js';

// Load config
const config = JSON.parse(readFileSync('./config.json', 'utf-8'));

// Init subsystems
initLogger(config.storage.dataDir);
initStorage(config);

// Start HTTP server
const server = http.createServer((req, res) => handleRequest(req, res, config));

const port = process.env.PORT || config.server.port;
server.listen(port, config.server.host, () => {

  logger.info(`Server started on port ${port}`);
  console.log('');
  console.log('  Dashboard running at:');
  console.log(`    Local:   http://localhost:${port}`);

  // Show LAN address for phone access
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`    Network: http://${net.address}:${port}`);
      }
    }
  }
  console.log('');

  // Start scheduler
  startScheduler(config);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  stopScheduler();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  stopScheduler();
  server.close(() => process.exit(0));
});
