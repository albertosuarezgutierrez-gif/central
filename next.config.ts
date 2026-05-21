import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forzar renderizado dinámico en todos los API routes
  // Evita "supabaseUrl is required" durante el build estático
  // (las env vars de Supabase solo están disponibles en runtime)
};

export default nextConfig;
