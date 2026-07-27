import morgan from 'morgan';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const format = env.isProd
  ? ':remote-addr :method :url :status :res[content-length] - :response-time ms'
  : 'dev';

export const requestLogger = morgan(format, {
  stream: { write: (line) => logger.info(line.trim()) },
  skip: (req) => req.originalUrl === '/health',
});

export default requestLogger;
