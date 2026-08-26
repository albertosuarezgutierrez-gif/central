---
name: seo-house-sevillana
description: SEO especializado para la landing page del apartamento turístico House Sevillana (Sevilla, centro histórico, Calle Socorro 24 — barrio de San Julián, 290 m², 6 dormitorios, 4 baños, parking privado). Cubre generación de metadatos (title, meta description, Open Graph, Twitter Cards), schema.org JSON-LD (LodgingBusiness, FAQPage, BreadcrumbList), keyword research multi-idioma (ES/EN/FR/DE/IT), reescritura de copy con foco en conversión y reservas directas para esquivar la comisión de Booking del 19,72%, auditoría SEO técnica para Next.js 15 App Router, y configuración multi-idioma con hreflang. Usa esta skill SIEMPRE que Alberto pida cualquier cosa relacionada con SEO, posicionamiento, metadatos, schema, keywords, copy de la landing, auditoría web, hreflang o multi-idioma de House Sevillana, aunque no diga la palabra SEO explícitamente.
---

# SEO House Sevillana

Skill especializada en SEO para la landing pública de **House Sevillana**, el apartamento turístico de Alberto en el centro histórico de Sevilla.

> ⚠️ **Versión canónica, versionada en el monorepo `central` (`.claude/skills/seo-house-sevillana/`).**
> Sustituye a la copia sincronizada de la cuenta de Claude, que daba a House Sevillana la dirección
> de otros dos pisos del grupo (Bustos Tavera 22) en siete sitios, incluidos sus dos JSON-LD.
> Al vivir en el repo, la reconcilia `/auditoria-diaria` y la protege
> `test/regression-house-sevillana-direccion.test.ts`. Si encuentras una copia con «Bustos Tavera»,
> es la vieja: bórrala de la cuenta.

## Contexto fijo del proyecto

- **Propiedad**: House Sevillana — **Calle Socorro 24, 41003 Sevilla, barrio de San Julián**
  (37.395904, -5.987431), licencia **VFT/SE/01179**, ID de Booking **2039943**. NO confundir con
  las otras del portfolio, en particular con *Luxury Busto* y *Busto Reform*, que SÍ están en
  **Bustos Tavera 22** — el dato bueno manda desde `apps/housesevillana/CLAUDE.md`.
- **Dominio público**: `housesevillana.es` (con `www`). NO es `.com`.
- **Stack landing**: `apps/housesevillana` del monorepo `central` — Next.js servido por rutas `edge`
  que devuelven el HTML entero (`app/route.ts`), desplegado en Vercel. `/en` y `/it` se DERIVAN del
  HTML español por diccionario de cadenas exactas: tocar un texto español rompe su traducción.
- **Intranet privada**: `housesevillana.vercel.app` (NO es la landing pública, es la herramienta interna de gestión)
- **Modo de trabajo de Alberto**: sin terminal local, edita por GitHub web + Edge Functions de Supabase. Los outputs deben ser **archivos completos copy-paste-ready**, no diffs.
- **Datos completos del apartamento y entorno**: en `references/property-data.md` (cárgalo siempre antes de generar cualquier contenido)

## Prioridades del SEO (en este orden)

1. **Visibilidad orgánica general en Google** (núcleo)
2. **Reservas directas** para esquivar la comisión de Booking del 19,72% — todo CTA debe empujar al motor de reservas propio, no a portales
3. **Mercados internacionales europeos** (EN/FR/DE/IT, además de ES)
4. **Branding de marca** "House Sevillana"

## Decision tree: cómo abordar cada petición

Cuando Alberto pida algo, identifica en qué bloque cae y carga **solo** los archivos de referencia necesarios. No cargues todo de golpe.

| Petición de Alberto | Carga estos archivos |
|---|---|
| "genera el title / meta description / OG", "metadatos para Next.js" | `references/property-data.md` + `references/metadata-and-schema.md` |
| "genera schema.org / JSON-LD / structured data" | `references/property-data.md` + `references/metadata-and-schema.md` + `assets/jsonld/*.json` |
| "qué keywords usar", "ideas de blog", "FAQ para SEO" | `references/property-data.md` + `references/keywords.md` |
| "reescribe esta sección", "mejora el copy", "hero / about / amenities" | `references/property-data.md` + `references/copy-and-content.md` |
| "auditoría SEO técnica", "Core Web Vitals", "robots.txt", "sitemap" | `references/technical-audit.md` |
| "tradúcelo a EN/FR/DE/IT", "hreflang", "estructura multi-idioma" | `references/property-data.md` + `references/multilingual.md` |
| Petición ambigua o que toca varias áreas | Pregunta a Alberto qué bloque atacar primero, o haz un plan corto y empieza por la pieza más alta de la prioridad |

## Reglas de oro al generar SEO para House Sevillana

1. **El parking privado en pleno centro es el USP número uno**. Aparcar en el casco antiguo de Sevilla es un dolor enorme. Mencionarlo siempre que tenga sentido (title, hero, FAQ, schema amenityFeature).
2. **Tipo de huésped objetivo: grupos grandes y familias** (6 dormitorios + 4 baños). Nunca posicionar como "apartamento para parejas" o "escapada romántica" — pierde y compite con miles.
3. **Hablar de Sevilla con detalle local**, no genérico. Mencionar Plaza de San Román, Plaza de San Marcos, Las Dueñas, San Luis de los Franceses, Calle Socorro, no solo "centro de Sevilla". **Nunca Bustos Tavera**: es la calle de otros dos pisos del grupo, no la de House Sevillana.
4. **CTA siempre hacia reserva directa**, nunca hacia portales (Booking/Airbnb/Expedia). Si la skill ve copy con enlaces a portales en un contexto de optimización SEO, sugiere reemplazarlos por el motor propio.
5. **Tono**: cercano, profesional, sin grandilocuencia ni superlativos vacíos ("el mejor", "increíble"). Concreto y útil.
6. **Sevilla AEAT / fiscalidad turística**: si Alberto pregunta sobre legalidad VFT, número de licencia, etc., recordarle que la licencia VFT debe figurar visible en la landing (es obligatorio en Andalucía) y preguntarle el número si no lo tiene.

## Flujo recomendado al iniciar trabajo en la landing desde cero

Si Alberto te pide "ayúdame a montar la landing" o similar (sin un punto concreto), propón este orden:

1. Estructura de URLs y idiomas (`multilingual.md`)
2. Keyword cluster por idioma (`keywords.md`)
3. Wireframe de secciones y copy del home (`copy-and-content.md`)
4. Metadatos + JSON-LD (`metadata-and-schema.md`)
5. Auditoría técnica al hacer el primer deploy (`technical-audit.md`)

## Output: formato esperado

- **Código Next.js**: bloques completos pegables en `app/page.tsx`, `app/layout.tsx`, `app/[locale]/page.tsx`, etc. Con imports.
- **JSON-LD**: dentro de `<Script type="application/ld+json" id="..." dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />`
- **Copy**: en bloques de markdown listos para copiar, con jerarquía de headings clara (H1 único, H2 por sección, H3 dentro)
- **Auditorías**: tabla con check / fix / prioridad (alta/media/baja)
- **Traducciones**: cada idioma en su bloque, no mezclados

## Qué NO hacer

- No inventar datos que no estén en `property-data.md` (precios concretos, número de licencia, teléfono…). Si falta, preguntar a Alberto.
- No usar keyword stuffing. Las búsquedas modernas penalizan repetición forzada.
- No copiar literal el copy de Booking/Airbnb. Riesgo de contenido duplicado y penalización.
- No prometer "primer puesto en Google" ni plazos. SEO es trabajo a medio plazo (3–9 meses para palabras competidas).
