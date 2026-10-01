import type { NextConfig } from 'next';

/** A frontend-only application: no server actions, no database, no API routes. Every page renders from local
 *  fixtures and the browser's own storage. */
const config: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  agentRules: false,
};

export default config;
