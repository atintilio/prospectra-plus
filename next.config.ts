import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  experimental:{serverActions:{bodySizeLimit:'4mb'}},
};

export default nextConfig;
