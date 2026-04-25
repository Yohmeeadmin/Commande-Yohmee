import type { NextConfig } from "next";
import path from "path";

// Hostname Supabase pour l'optimisation d'images
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : '';

const nextConfig: NextConfig = {
  // Empêche Next.js de remonter jusqu'au home directory à cause du package-lock.json racine
  outputFileTracingRoot: path.resolve(__dirname),

  // Tree-shake lucide-react (réduit le bundle JS significativement)
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // Optimisation des images (WebP/AVIF auto, lazy load)
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname }]
      : [],
  },
};

export default nextConfig;
