import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

// ⚠️ CAMBIA esta URL cuando registres el dominio definitivo:
const SITE_URL = "https://housesevillana.vercel.app";

// Solo la home por idioma: las páginas /la-casa, /ubicacion, /precios y /contacto
// no existen, así que no se anuncian en el sitemap (evita URLs que dan 404).
const STATIC_PATHS: Record<(typeof routing.locales)[number], string[]> = {
  es: [""],
  en: [""],
  fr: [""],
  de: [""],
  it: [""],
};

// Mapa de URLs equivalentes entre idiomas (para hreflang en sitemap)
const PATH_KEYS = [""] as const;

function urlForLocale(locale: (typeof routing.locales)[number], pathKey: string): string {
  const idx = PATH_KEYS.indexOf(pathKey as (typeof PATH_KEYS)[number]);
  const localizedPath = STATIC_PATHS[locale][idx];
  return `${SITE_URL}/${locale}${localizedPath}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PATH_KEYS.flatMap((pathKey) =>
    routing.locales.map((locale) => ({
      url: urlForLocale(locale, pathKey),
      lastModified: now,
      changeFrequency: pathKey === "" ? ("weekly" as const) : ("monthly" as const),
      priority: pathKey === "" ? 1.0 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => {
            const langTag = l === "es" ? "es-ES" : l === "en" ? "en-US" : `${l}-${l.toUpperCase()}`;
            return [langTag, urlForLocale(l, pathKey)];
          }),
        ),
      },
    })),
  );
}
