# Auditoría SEO técnica — Next.js 15 App Router

## Stack del proyecto

- Next.js 15.5.15, App Router
- Vercel (Washington DC iad1)
- Build cmd: `prisma generate && next build`
- Node 24.x

## Checklist de auditoría (en orden de prioridad)

Marca cada punto como ✅ OK / 🟡 Mejorable / 🔴 Crítico.

### 🔴 Bloque 1 — Indexabilidad básica

| # | Check | Cómo verificar | Fix |
|---|---|---|---|
| 1.1 | `robots.txt` existe y permite indexación | `https://dominio/robots.txt` | Crear `app/robots.ts` (ver template abajo) |
| 1.2 | `sitemap.xml` existe y está actualizado | `https://dominio/sitemap.xml` | Crear `app/sitemap.ts` (template abajo) |
| 1.3 | Sitemap declarado en robots.txt | Línea `Sitemap: https://...` | Añadir en `robots.ts` |
| 1.4 | Search Console verificado y sitemap enviado | https://search.google.com/search-console | Subir sitemap manualmente |
| 1.5 | No hay `noindex` accidental en producción | `view-source:` → buscar `noindex` | Quitar de metadata |
| 1.6 | Canonical apunta a la URL definitiva (sin trailing slash inconsistente) | Inspeccionar `<link rel="canonical">` | Configurar en `metadata.alternates.canonical` |

### 🔴 Bloque 2 — Renderizado y crawl budget

| # | Check | Cómo verificar | Fix |
|---|---|---|---|
| 2.1 | Las páginas críticas son SSR/SSG, no client-only | DevTools → Disable JS → ¿se ve contenido? | Mover a Server Components / `generateStaticParams` |
| 2.2 | URLs limpias sin `?utm` ni IDs internos | Audit de URLs en sitemap | Limpiar querystrings, usar canonical |
| 2.3 | No hay 404 internos | Crawl con Screaming Frog (free hasta 500 URLs) | Reparar enlaces rotos |
| 2.4 | No hay redirects en cadena | Crawl con Screaming Frog | Cambiar a redirects directos en `next.config.ts` |
| 2.5 | Imágenes con `next/image` y `priority` en LCP | Code review | Reemplazar `<img>` por `<Image>` |

### 🟡 Bloque 3 — Core Web Vitals

Vercel Analytics ya da estos datos de producción.

| # | Métrica | Objetivo | Cómo medir |
|---|---|---|---|
| 3.1 | LCP (Largest Contentful Paint) | < 2.5s | Vercel Analytics + PageSpeed Insights |
| 3.2 | INP (Interaction to Next Paint) | < 200ms | Vercel Analytics |
| 3.3 | CLS (Cumulative Layout Shift) | < 0.1 | Vercel Analytics |

**Optimizaciones típicas Next.js**:
- Hero image con `priority` y `sizes` correctos
- Fuentes con `next/font` (no `<link>` a Google Fonts)
- `dynamic()` para componentes pesados below-the-fold
- Skeleton loading para evitar CLS en imágenes

### 🟡 Bloque 4 — Estructura de cabeceras

| # | Check | Fix |
|---|---|---|
| 4.1 | Un único H1 por página | Auditar con DevTools `$$('h1')` |
| 4.2 | Jerarquía H1 → H2 → H3 sin saltos | Refactor de markup |
| 4.3 | H1 incluye keyword principal de la página | Reescribir según `keywords.md` |
| 4.4 | No hay headings vacíos o solo decorativos | Quitar o cambiar a `<p>` |

### 🟡 Bloque 5 — Imágenes y multimedia

| # | Check | Fix |
|---|---|---|
| 5.1 | Todas las imágenes con `alt` descriptivo | Añadir `alt="patio interior de House Sevillana en Calle Socorro"` |
| 5.2 | Lazy loading en imágenes below-the-fold | `next/image` lo hace por defecto |
| 5.3 | Formatos modernos (WebP/AVIF) | `next/image` lo gestiona |
| 5.4 | Tamaños correctos `sizes` para responsive | Especificar en cada `<Image>` |
| 5.5 | OG image 1200x630 generada y referenciada | Crear y subir a `/public/og/` |

### 🟡 Bloque 6 — Schema.org

Ver `metadata-and-schema.md` para detalle. Auditoría:

| # | Check | Cómo |
|---|---|---|
| 6.1 | LodgingBusiness en home | View source + Rich Results Test |
| 6.2 | BreadcrumbList en subpáginas | Idem |
| 6.3 | FAQPage en sección FAQ | Idem |
| 6.4 | Organization en layout | Idem |
| 6.5 | No hay errores en Rich Results Test | https://search.google.com/test/rich-results |

### 🟢 Bloque 7 — i18n y hreflang

Ver `multilingual.md`.

| # | Check |
|---|---|
| 7.1 | Cada idioma tiene URL propia (`/es/`, `/en/`...) |
| 7.2 | `<html lang="...">` correcto en cada idioma |
| 7.3 | `alternates.languages` en `metadata` apunta a las URLs correctas |
| 7.4 | `x-default` definido (apunta a versión ES) |
| 7.5 | Sitemap declara las alternativas con `xhtml:link` |

### 🟢 Bloque 8 — Performance avanzado

| # | Check | Fix |
|---|---|---|
| 8.1 | Bundle size < 200KB para JS inicial | `@next/bundle-analyzer` |
| 8.2 | No hay scripts third-party bloqueantes | Usar `<Script strategy="lazyOnload">` |
| 8.3 | Cabeceras de cache correctas en Vercel | `next.config.ts` headers |
| 8.4 | Edge runtime donde tenga sentido | `export const runtime = 'edge'` en API si aplica |

### 🟢 Bloque 9 — Legales y E-E-A-T

| # | Check | Por qué importa |
|---|---|---|
| 9.1 | Aviso legal con datos del titular y NIF | Obligatorio LSSI; Google valora |
| 9.2 | Política de privacidad y cookies | RGPD + valoración E-E-A-T |
| 9.3 | Número de licencia VFT visible | Obligatorio en Andalucía + confianza |
| 9.4 | Datos de contacto reales (email, teléfono) | Mejora E-E-A-T |
| 9.5 | Fotos reales (no stock) | Indicador de autenticidad |

## Templates listos para pegar

### `app/robots.ts`

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/login", "/dashboard"],
      },
    ],
    sitemap: "https://www.housesevillana.es/sitemap.xml", // CAMBIAR al dominio real
    host: "https://www.housesevillana.es",
  };
}
```

### `app/sitemap.ts`

```typescript
import type { MetadataRoute } from "next";

const BASE_URL = "https://www.housesevillana.es"; // CAMBIAR
const LOCALES = ["es", "en", "fr", "de", "it"] as const;

const STATIC_PATHS = ["", "/casa", "/ubicacion", "/precios", "/contacto", "/blog"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return STATIC_PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}${path}`,
      lastModified: now,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1.0 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [l === "es" ? "es-ES" : `${l}-${l.toUpperCase()}`, `${BASE_URL}/${l}${path}`]),
        ),
      },
    })),
  );
}
```

### `next.config.ts` — headers y redirects básicos

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/og/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Si registras dominio nuevo, redirigir el viejo:
      // { source: "/(.*)", has: [{ type: "host", value: "housesevillana.vercel.app" }], destination: "https://www.housesevillana.es/$1", permanent: true },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // añadir si Alberto sirve imágenes desde Supabase Storage o similar
    ],
  },
};

export default config;
```

## Herramientas para usar

| Herramienta | Para qué | Coste |
|---|---|---|
| Google Search Console | Indexación, búsquedas reales, errores | Gratis |
| Google PageSpeed Insights | Core Web Vitals + Lighthouse | Gratis |
| Rich Results Test | Validar Schema.org | Gratis |
| Schema Markup Validator | Validar JSON-LD genérico | Gratis |
| Vercel Analytics | CWV en producción | Incluido en plan Vercel |
| Screaming Frog SEO Spider | Crawl interno | Gratis hasta 500 URLs |
| Bing Webmaster Tools | Indexar también en Bing | Gratis |
