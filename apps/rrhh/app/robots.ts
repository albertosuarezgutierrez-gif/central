import type { MetadataRoute } from "next"

// Portal del Empleado: datos personales. Nunca indexar (empleados.grupoasegura.es).
// Defensa en capas: este robots.txt + X-Robots-Tag (next.config.ts) + metadata.robots (layout raíz).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  }
}
