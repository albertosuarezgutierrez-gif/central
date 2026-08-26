# Multi-idioma y hreflang — Next.js 15 App Router

## Decisión inicial: estructura de URLs

Para SEO multi-idioma hay tres patrones. Para House Sevillana **el recomendado es subdirectorios por idioma**:

| Patrón | Ejemplo | Recomendado para HS |
|---|---|---|
| Subdominios | `en.housesevillana.es` | ❌ (más complejo, peor SEO unificado) |
| Subdirectorios | `housesevillana.es/en/` | ✅ **SÍ** |
| ccTLDs | `housesevillana.fr` | ❌ (caro, fragmenta autoridad) |

## Estructura de carpetas en App Router

```
app/
├── [locale]/
│   ├── layout.tsx            ← layout específico por idioma (lang attribute, fonts)
│   ├── page.tsx              ← home
│   ├── la-casa/
│   │   └── page.tsx
│   ├── ubicacion/
│   │   └── page.tsx
│   ├── precios/
│   │   └── page.tsx
│   └── blog/
│       ├── page.tsx
│       └── [slug]/page.tsx
├── layout.tsx                ← root layout mínimo
├── sitemap.ts
├── robots.ts
└── not-found.tsx
```

## Setup de i18n

Recomendado: **`next-intl`** (mejor soporte App Router que `next-i18next` en 2026).

### Instalación

```bash
npm install next-intl
```

### `i18n/routing.ts`

```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en", "fr", "de", "it"],
  defaultLocale: "es",
  localePrefix: "always", // siempre /es/, /en/, etc. (mejor para SEO)
  pathnames: {
    "/": "/",
    "/la-casa": {
      es: "/la-casa",
      en: "/the-house",
      fr: "/la-maison",
      de: "/das-haus",
      it: "/la-casa",
    },
    "/ubicacion": {
      es: "/ubicacion",
      en: "/location",
      fr: "/emplacement",
      de: "/lage",
      it: "/posizione",
    },
    "/precios": {
      es: "/precios",
      en: "/rates",
      fr: "/tarifs",
      de: "/preise",
      it: "/prezzi",
    },
    "/contacto": {
      es: "/contacto",
      en: "/contact",
      fr: "/contact",
      de: "/kontakt",
      it: "/contatti",
    },
    "/blog": "/blog",
  },
});

export type Locale = (typeof routing.locales)[number];
```

> **Nota SEO importante**: usar slugs traducidos (`/the-house`, `/la-maison`) **mejora el ranking** en cada mercado vs usar el slug español para todos. Recomendado.

### `app/[locale]/layout.tsx`

```tsx
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

## hreflang correcto

Hay **dos lugares** donde declarar hreflang:

### 1. En `metadata.alternates.languages` (genera `<link rel="alternate">`)

```tsx
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const path = ""; // o el path de la página actual

  return {
    alternates: {
      canonical: `/${locale}${path}`,
      languages: {
        "es-ES": `/es${path}`,
        "en-US": `/en${path}`,
        "en-GB": `/en${path}`, // mismo contenido EN sirve a UK y US
        "fr-FR": `/fr${path}`,
        "fr-BE": `/fr${path}`,
        "de-DE": `/de${path}`,
        "de-AT": `/de${path}`,
        "de-CH": `/de${path}`,
        "it-IT": `/it${path}`,
        "x-default": `/es${path}`,
      },
    },
  };
}
```

### 2. En el sitemap.xml (más fiable para Google)

Ver `technical-audit.md` → `app/sitemap.ts`. La propiedad `alternates.languages` en el sitemap genera los `<xhtml:link>` que Google prefiere.

## Errores típicos de hreflang

❌ Códigos mal formados: `es_ES` en vez de `es-ES`. Tiene que ser **guion**, no underscore.
❌ Falta `x-default`: Google no sabe qué versión usar para idiomas no listados.
❌ Hreflang asimétrico: si `/es/` apunta a `/en/`, `/en/` también tiene que apuntar a `/es/`. Google lo desestima si no es bidireccional.
❌ Hreflang apuntando a páginas con `noindex`: contradicción, Google ignora.
❌ Hreflang de página A apuntando a página B con contenido distinto (no es traducción real).

## Calidad de las traducciones

🚨 **CRÍTICO**: Google detecta traducciones automáticas malas y las penaliza como "thin content".

Reglas:
1. **No usar Google Translate / DeepL en bruto** y publicar. Usar como base, revisar a mano.
2. **Adaptar referencias culturales**: en EN no decir "feria de abril" sin explicar. En DE el horario de cenas distinto, etc.
3. **Re-escribir CTAs y hero**: una traducción literal del CTA español casi siempre es peor que escribir uno nuevo en el idioma destino.
4. **Verificar terminología**: "alquiler turístico" se dice diferente en cada idioma:
   - EN: "vacation rental" (US) / "holiday rental" (UK)
   - FR: "location de vacances"
   - DE: "Ferienwohnung" (apartamento) / "Ferienhaus" (casa)
   - IT: "casa vacanze" / "appartamento per vacanze"

## Estrategia de contenido por idioma

No traducir todo a la vez. Priorizar:

**Fase 1 (MVP)**: ES + EN. Cubre 90% del tráfico potencial.
**Fase 2 (3-6 meses)**: FR + DE. Cuando ES y EN ya tengan tracción.
**Fase 3 (6-12 meses)**: IT. Mercado más pequeño, último.

Cada idioma debe tener:
1. Home traducido (no automático)
2. Páginas de la casa, ubicación, precios, contacto
3. FAQ traducido y adaptado al mercado (los franceses preguntan otras cosas que los alemanes)
4. **Mínimo 3 posts de blog originales por idioma** antes de dar el idioma por "lanzado"

## Targeting geográfico en Search Console

Por cada idioma, configurar el targeting:
- ES → España (no necesita, es el dominio principal)
- EN → "no específico" (atrae UK, US, IE, etc.)
- FR → Francia
- DE → Alemania
- IT → Italia

Search Console > Settings > International Targeting (puede que se llame distinto en 2026).

## Reglas de detección de idioma

❌ **NO redirigir automáticamente** según el idioma del navegador. Google lo penaliza ("link rot" / contenido no accesible).
✅ **SÍ mostrar un selector visible** con todas las opciones.
✅ **SÍ poner cookie** para recordar la elección (pero respetar siempre la URL solicitada).

```tsx
// middleware.ts — ejemplo correcto: NO redirige automáticamente
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

next-intl por defecto usa la cabecera `Accept-Language` solo en la URL raíz `/` para sugerir, y respeta la URL solicitada. Esto es lo correcto.
