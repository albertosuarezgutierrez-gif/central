import type { MetadataRoute } from "next";

// ⚠️ CAMBIA esta URL cuando registres el dominio definitivo:
const SITE_URL = "https://housesevillana.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/income",
          "/expenses",
          "/properties",
          "/updates",
          "/agente",
          "/login",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
