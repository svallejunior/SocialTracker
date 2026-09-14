import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.4', '192.168.0.4:3000'],
  experimental: {
    // Permite uploads de mídias de alta resolução e vídeos no Next.js
    proxyClientMaxBodySize: '150mb',
    middlewareClientMaxBodySize: '150mb',
    serverActions: {
      bodySizeLimit: '150mb',
    },
    // Reduz o pico de memória do Webpack durante `next build` (o VPS de produção
    // tem só 956MB de RAM e o build vinha quase saturando + derrubando a sessão SSH).
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
