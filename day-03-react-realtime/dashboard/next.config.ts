import type { NextConfig } from 'next';

const apiProxyTarget =
  process.env.SUPTECH_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    if (process.env.VERCEL) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
