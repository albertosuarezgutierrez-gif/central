import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en", "fr", "de", "it"],
  defaultLocale: "es",
  localePrefix: "always", // siempre /es/, /en/, etc. — mejor para SEO
  // Solo la home tiene página; las rutas localizadas previas (/la-casa, /ubicacion,
  // /precios, /contacto) se eliminaron porque no tenían página (daban 404).
  pathnames: {
    "/": "/",
  },
});

export type Locale = (typeof routing.locales)[number];
