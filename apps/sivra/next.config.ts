import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Casa de marcas: sivra (apps/sivra) consume @iarest/core-ai desde ../../packages.
// Declaramos la raíz del monorepo para que el tracing incluya packages/ fuera del app root.
const monorepoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "pdf-parse"],
  transpilePackages: ["@iarest/core-ai", "@iarest/core-storage", "@iarest/core-email"],
  outputFileTracingRoot: monorepoRoot,
  // ESLint está configurado (.eslintrc.json) y disponible vía `npm run lint`,
  // pero no debe tumbar el build de producción por hallazgos preexistentes.
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
  experimental: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/og/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
