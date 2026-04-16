import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Empêche Next.js de remonter jusqu'au home directory à cause du package-lock.json racine
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
