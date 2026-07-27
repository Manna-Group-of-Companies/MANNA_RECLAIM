import { env } from './env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[env.logLevel] ?? LEVELS.info;

const stamp = () => new Date().toISOString();

const emit = (level, args) => {
  if (env.logLevel in LEVELS && LEVELS[level] > threshold) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(stamp() + ' [' + level.toUpperCase() + ']', ...args);
};

export const logger = {
  error: (...a) => emit('error', a),
  warn: (...a) => emit('warn', a),
  info: (...a) => emit('info', a),
  debug: (...a) => emit('debug', a),
};

export default logger;
