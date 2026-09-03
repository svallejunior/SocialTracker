import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.4', '192.168.0.4:3000'],
  experimental: {
    // Reduz o pico de memória do Webpack durante `next build` (o VPS de produção
    // tem só 956MB de RAM e o build vinha quase saturando + derrubando a sessão SSH).
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
