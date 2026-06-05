import type { NextConfig } from "next";
import path from "path";


const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // ExcelJS utilise des modules Node non dispo dans le navigateur
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, stream: false, path: false, zlib: false,
        crypto: false, buffer: require.resolve('buffer/'),
      };
    }
    return config;
  },
  // Empêche Next.js de remonter jusqu'au home directory à cause du package-lock.json racine
  outputFileTracingRoot: path.resolve(__dirname),

  // Tree-shake lucide-react (réduit le bundle JS significativement)
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // Optimisation des images (WebP/AVIF auto, lazy load)
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
