# Metadatos y Schema.org para Next.js 15 App Router

## 1. Metadata API de Next.js 15

En App Router, los metadatos van en `metadata` (estático) o `generateMetadata` (dinámico) exportado desde `layout.tsx` o `page.tsx`. Los metadatos del hijo se mergean con los del padre.

### Patrón base para `app/[locale]/layout.tsx`

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.housesevillana.es"), // CAMBIAR cuando Alberto registre el dominio definitivo
  title: {
    default: "House Sevillana — Apartamento turístico con parking en el centro de Sevilla",
    template: "%s | House Sevillana",
  },
  description:
    "Casa palacio reformada de 290 m² con 6 dormitorios, 4 baños y parking privado en pleno casco antiguo de Sevilla. Ideal para familias y grupos grandes. Reserva directa sin comisiones.",
  applicationName: "House Sevillana",
  authors: [{ name: "Alberto Suárez Gutiérrez" }],
  creator: "Alberto Suárez Gutiérrez",
  publisher: "House Sevillana",
  alternates: {
    canonical: "/",
    languages: {
      "es-ES": "/es",
      "en-US": "/en",
      "fr-FR": "/fr",
      "de-DE": "/de",
      "it-IT": "/it",
      "x-default": "/es",
    },
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: "https://www.housesevillana.es",
    siteName: "House Sevillana",
    title: "House Sevillana — Casa con parking en el centro de Sevilla",
    description:
      "290 m², 6 dormitorios, 4 baños, parking privado y terraza en el casco antiguo. Para familias y grupos grandes.",
    images: [
      {
        url: "/og/house-sevillana-og-1200x630.jpg", // generar imagen OG con tamaño 1200x630
        width: 1200,
        height: 630,
        alt: "Patio interior de House Sevillana en el casco antiguo de Sevilla",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "House Sevillana — Casa con parking en el centro de Sevilla",
    description:
      "Casa palacio reformada para grupos grandes y familias en pleno casco antiguo. Parking privado, terraza, patio.",
    images: ["/og/house-sevillana-og-1200x630.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Verificación de Search Console — Alberto debe pegar el código aquí cuando lo registre
  verification: {
    google: "PEGAR_CODIGO_GOOGLE_SEARCH_CONSOLE",
  },
};
```

### `generateMetadata` para páginas dinámicas (ej. blog)

```tsx
import type { Metadata } from "next";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(slug, locale); // función que recupera el post

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: `/${locale}/blog/${slug}`,
      languages: {
        "es-ES": `/es/blog/${slug}`,
        "en-US": `/en/blog/${slug}`,
        "fr-FR": `/fr/blog/${slug}`,
        "de-DE": `/de/blog/${slug}`,
        "it-IT": `/it/blog/${slug}`,
      },
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
      type: "article",
      publishedTime: post.publishedAt,
      authors: [post.author],
    },
  };
}
```

## 2. Reglas para titles y descriptions

### Title (50–60 caracteres, ideal 55)

**Estructura recomendada**:
`[Foco SEO con USP] | [Marca]`

Ejemplos por idioma para el home:

| Idioma | Title |
|---|---|
| ES | `Apartamento con parking en el centro de Sevilla \| House Sevillana` |
| EN | `Apartment with Parking in Seville Old Town \| House Sevillana` |
| FR | `Appartement avec parking au centre de Séville \| House Sevillana` |
| DE | `Ferienwohnung mit Parkplatz in Sevilla Altstadt \| House Sevillana` |
| IT | `Appartamento con parcheggio nel centro di Siviglia \| House Sevillana` |

### Meta description (150–160 caracteres)

**Reglas**:
- Incluir 1 USP (parking, capacidad, ubicación)
- Incluir CTA implícito (reserva directa)
- No keyword stuffing — leer en voz alta tiene que sonar natural

Ejemplos:

| Idioma | Description (~155 c) |
|---|---|
| ES | `Casa palacio de 290 m² con 6 dormitorios, parking privado y terraza en el casco antiguo de Sevilla. Ideal para familias y grupos. Reserva directa sin comisiones.` |
| EN | `Restored townhouse of 290 sqm with 6 bedrooms, private parking and terrace in Seville's historic center. Perfect for families and groups. Book direct, no fees.` |
| FR | `Maison restaurée de 290 m² avec 6 chambres, parking privé et terrasse dans la vieille ville de Séville. Idéale pour familles et groupes. Réservation directe.` |
| DE | `Restauriertes Stadthaus mit 290 m², 6 Schlafzimmern, privatem Parkplatz und Terrasse in Sevillas Altstadt. Ideal für Familien und Gruppen. Direktbuchung.` |
| IT | `Casa storica di 290 m² con 6 camere, parcheggio privato e terrazza nel centro storico di Siviglia. Ideale per famiglie e gruppi. Prenotazione diretta.` |

## 3. Schema.org JSON-LD

### Cómo inyectarlo en Next.js 15

Usar el componente `<Script>` de `next/script` o un tag inline en el RSC (preferible en App Router):

```tsx
// app/[locale]/page.tsx
import lodgingBusiness from "@/lib/jsonld/lodging-business";

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(lodgingBusiness) }}
      />
      {/* resto del page */}
    </>
  );
}
```

### Schemas a implementar (orden de prioridad)

1. **`LodgingBusiness`** (o `Apartment` / `VacationRental`) — en home y página de la propiedad. Es el más importante.
2. **`Organization`** — en `layout.tsx`, datos del negocio.
3. **`BreadcrumbList`** — en cada subpágina.
4. **`FAQPage`** — en sección FAQ del home y/o página dedicada.
5. **`Review` / `AggregateRating`** — solo si hay reseñas propias verificables. **NO** copiar reseñas de Booking (penalización por contenido duplicado y posible problema legal).
6. **`Article` / `BlogPosting`** — para el blog.
7. **`TouristAttraction`** — para páginas tipo "qué ver cerca".

### Plantilla LodgingBusiness (la más crítica)

Ver `assets/jsonld/lodging-business.json` para la plantilla completa rellena con datos reales de House Sevillana. Lista de campos clave:

- `@type`: usar `"LodgingBusiness"` o más específico `"VacationRental"` si Google ya lo soporta en el mercado objetivo
- `name`, `description`, `url`, `image`, `telephone`, `email`
- `address` (PostalAddress completo)
- `geo` (GeoCoordinates con lat/lng)
- `numberOfRooms`, `petsAllowed`, `smokingAllowed`
- `amenityFeature` (array de `LocationFeatureSpecification`)
- `priceRange`
- `checkinTime`, `checkoutTime`
- `containedInPlace` → Sevilla
- `aggregateRating` (solo si hay reviews propias)

### Validación

Después de implementar, validar siempre con:
- https://search.google.com/test/rich-results
- https://validator.schema.org/

## 4. Errores frecuentes a evitar

1. **`metadataBase` mal configurado**: si falta, los OG images salen rotos. Siempre absoluta.
2. **`openGraph.locale`** distinto al `lang` del HTML: confunde a Facebook.
3. **JSON-LD con datos inventados** (precios, ratings): puede provocar manual action de Google.
4. **Múltiples H1**: Google los tolera pero confunden al crawler. Uno por página.
5. **Canonical apuntando a sí mismo con query strings**: limpiar canonical.
6. **`alternates.languages` incompleto** o con códigos mal formados (usar `es-ES` no `es_ES` ni solo `es`).
7. **OG image < 1200x630**: Facebook/LinkedIn la rechazan o la recortan mal.
