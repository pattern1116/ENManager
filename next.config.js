/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — exclude from webpack bundling
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3']
    }
    return config
  },
}

module.exports = nextConfig
