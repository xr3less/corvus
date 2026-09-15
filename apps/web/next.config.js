/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker deploys (apps/web/Dockerfile) run the traced server at
  // .next/standalone/apps/web/server.js — see .github/workflows/deploy.yml.
  output: 'standalone',
};

module.exports = nextConfig;
