/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the dev server's build artifacts out of the production `.next` dir.
  // The `en-manager` prod svc (`next start`) and `npm run build` share `.next`;
  // running `next dev` against the same folder corrupts each other's chunks
  // (the dev login page loads but its JS can't hydrate → "login doesn't work").
  // The `dev` script sets NEXT_DIST_DIR=.next-dev so the two never collide.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // better-sqlite3 is a native module — exclude from webpack bundling
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3']
    }
    return config
  },
}

module.exports = nextConfig
