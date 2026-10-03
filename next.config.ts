import type { NextConfig } from 'next';

/** The studio's web server: pages, the JSON API under /api, media streaming, the event stream. Database and
 *  library paths come from the environment; the worker is a separate process on the same code. */
const config: NextConfig = {
  reactStrictMode: true,
  // the dev badge sits over the sidebar's footer during visual review; build errors still show in the overlay
  devIndicators: false,
  typescript: { ignoreBuildErrors: false },
  output: 'standalone',
  serverExternalPackages: ['postgres', 'pino', 'pino-pretty', 'file-type', 'drizzle-orm'],
  experimental: { serverActions: { bodySizeLimit: '2gb' } },
  agentRules: false,
};

export default config;
