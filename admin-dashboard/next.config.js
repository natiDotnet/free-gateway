//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js type-checking enforces `rootDir = <app>/src`, which blocks the
  // shared libs under packages/. Transpilation succeeds; type-checking is run
  // separately via `npm run typecheck` (root tsconfig.typecheck.json).
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
