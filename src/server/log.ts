import pino from 'pino';

/** STRUCTURED LOGS — JSON lines with ids (job, production, shot, take, provider request) so a problem can be traced
 *  across the web server, the worker and the providers. Secrets are redacted by key name. */
const level = process.env.LOG_LEVEL ?? 'info';
const pretty = process.env.LOG_PRETTY === '1' || process.env.LOG_PRETTY === 'true';

export const log = pino({
  level,
  base: { service: process.env.SERVICE_NAME ?? 'web' },
  redact: { paths: ['*.apiKey', '*.authorization', '*.Authorization', 'req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'], censor: '[redacted]' },
  ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } } } : {}),
});

export type Logger = typeof log;
