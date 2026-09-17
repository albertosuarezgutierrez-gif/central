# Gestión de consentimiento unificada (asegura-web, ia-rest, housesevillana)

## Por qué

Tres webs públicas del grupo, tres estados distintos, todos malos:

- **asegura-web**: PostHog detrás de Cookiebot, correcto y fail-closed (`lib/analitica.ts`,
  `puedeMedir()`) — pero el trial de Cookiebot caduca ~19/09/2026. Sin plan de pago, la web
  se queda sin gestor de consentimiento y deja de medir en silencio.
- **ia-rest**: GA4 (`G-EN2YQLRLEX`) cargado sin condición en `src/app/layout.tsx:195-200`.
  Cero consentimiento.
- **housesevillana**: GA4 (`G-N5CMQL9C4M`) Y Meta Pixel de retargeting
  (`app/route.ts:372-375`, `fbq('init','12124662686780882173')`) cargados sin condición.
  Cero consentimiento en las dos.

Decisión de Alberto (14/09/2026): sustituir Cookiebot por un CMP gratuito y autoalojado
(`vanilla-cookieconsent`, MIT, orestbida), montado como paquete compartido — no tres copias.

## Arquitectura

**`packages/core-consent`** (`@central/core-consent`), siguiendo el patrón de `core-push`/
`core-telegram`: primer consumidor de una dependencia npm propia (`vanilla-cookieconsent`),
resuelta por los symlinks de pnpm igual que las demás.

### Núcleo puro (`src/consentimiento.ts`)

```ts
export type Categoria = 'statistics' | 'marketing'

export type Consentimiento = Partial<Record<Categoria, boolean>>

export type ConfigProveedor = {
  categoria: Categoria
  // credencial pública del proveedor (id de GA4, key de PostHog, id de Meta Pixel...);
  // sin ella no hay nada que arrancar, igual que hoy en asegura-web.
  credencial: string
}

/**
 * ¿Se puede cargar ESTE proveedor ahora mismo? Generaliza puedeMedir() de
 * asegura-web a categorías: antes solo existía `statistics`, ahora también
 * `marketing` (Meta Pixel). Misma regla de fondo: sin credencial no arranca,
 * `undefined` en el consentimiento NO es un sí.
 */
export function puedeCargar(consentimiento: Consentimiento | null | undefined, config: ConfigProveedor): boolean {
  if (!config.credencial) return false
  return consentimiento?.[config.categoria] === true
}
```

Un test por rama (`consentimiento.test.ts`) — sin credencial, sin consentimiento,
`undefined` explícito, consentimiento denegado, consentimiento concedido.

### Banner — DOS formas de consumo, mismo núcleo

`vanilla-cookieconsent` es JS puro (no depende de React), así que el paquete expone dos
capas sobre el mismo `src/textos/{es,en,it}.ts` y la misma configuración:

- **`src/ConsentBanner.tsx`** (`'use client'`) — envoltorio React para asegura-web e
  ia-rest, que SÍ son apps Next.js normales con árbol de componentes. Props: `idioma`
  (`'es' | 'en' | 'it'`, default `'es'`) y `onCambio(consentimiento: Consentimiento)`.
- **`src/snippetVanilla.ts`** — `montarBannerHtml(idioma)`, que devuelve el `<script>` +
  configuración como STRING, para housesevillana: esa app no tiene árbol de componentes,
  `app/route.ts` construye el HTML entero como una plantilla de texto (ver
  `apps/housesevillana/CLAUDE.md`), así que ahí el banner se inyecta como cualquier otro
  `<script>` de los que ya lleva esa plantilla (GA4, Meta Pixel), no como JSX.

Los textos legales se escriben en los tres idiomas desde el principio porque housesevillana
los necesita los tres (sus `/en` y `/it` se derivan de la misma página por diccionario de
cadenas exactas; un banner solo en español ahí rompería la coherencia de idioma de la
página, el mismo tipo de fallo que ya avisa `apps/housesevillana/CLAUDE.md` sobre tocar
texto español). asegura-web e ia-rest solo usan `es`.

En ambas formas, el cambio de consentimiento es el único punto de salida: cada app decide
ahí qué adaptadores arrancar/parar, igual que hoy hace `Analitica.tsx` con
`revisar()`/`arrancar()`/`apagar()`.

### Adaptadores (`src/adaptadores/`)

Cada uno es "no cargues nada hasta que te llamen, y para si te lo piden":

- `ga4.ts` → `cargarGa4(id)` / sin función de parada explícita (GA4 no tiene un
  `opt_out` limpio vía script tag suelto; el gate está en no cargar el script,
  igual que hace hoy asegura-web con PostHog).
- `postHog.ts` → mismo contrato que el `Analitica.tsx` actual de asegura-web
  (`arrancar`/`apagar` con `opt_out_capturing()` + `reset(true)`), movido tal cual
  al paquete.
- `metaPixel.ts` → `cargarMetaPixel(id)`, mismo patrón que GA4 (Meta tampoco ofrece
  parada limpia por script suelto — por eso el gate es no cargar, no cargar-y-apagar).

Categoría por proveedor: GA4 y PostHog → `statistics`. Meta Pixel → `marketing` (es
retargeting, no medición interna). No hace falta Google Consent Mode v2: comprobado que
ni ia-rest ni housesevillana tienen conversiones de Google Ads (`AW-...`) — el gate simple
de "no cargar hasta aceptar" cubre el caso real.

### Registro de auditoría (nuevo — sustituye lo que perdemos al dejar Cookiebot)

Cookiebot guarda en su servidor una prueba de qué aceptó cada visitante y cuándo.
`vanilla-cookieconsent` solo lo guarda en el navegador del visitante — sin rastro propio
si se le borra el almacenamiento. Para no perder esa prueba:

- Tabla nueva en la Supabase compartida (`wswbehlcuxqxyinousql`), schema `public`:
  `consentimiento_registro(id uuid pk, app text, categorias jsonb, creado_en timestamptz)`.
  **Sin PII**: ni IP, ni user-agent, ni ningún identificador de persona — solo qué app,
  qué categorías se marcaron y cuándo. El objetivo es probar "este banner se mostró y se
  actuó", no rastrear individuos.
- `onCambio` de `ConsentBanner` hace un `POST` fire-and-forget a un endpoint por app
  (`/api/consentimiento` en cada una) que inserta la fila. Un fallo de red en ese POST
  NUNCA bloquea ni retrasa que el visitante siga navegando — es un registro, no una
  puerta.
- Cada app declara su propio rol Prisma mínimo (`INSERT` únicamente) o reutiliza el que
  ya tenga si es una de las que comparte BD (asegura-web con `prisma_seguros` no aplica
  aquí — esta tabla es de infraestructura común, no de la cartera; revisar en el plan
  qué rol le corresponde a cada app según cómo hable hoy con Supabase).

## Por app

- **asegura-web**: sustituye `lib/analitica.ts` + `components/Analitica.tsx` por el
  paquete. Sigue siendo PostHog (`statistics`), sin Meta Pixel. Prioridad 1 — hay que
  tenerlo desplegado antes de que caduque el trial de Cookiebot (~19/09/2026), o la web
  se queda un solo día sin gestor de consentimiento.
- **ia-rest**: añade el banner + `cargarGa4` (`statistics`) donde hoy el script va suelto
  en `src/app/layout.tsx`. Prioridad 2.
- **housesevillana**: añade el banner (ES/EN/IT) + `cargarGa4` (`statistics`) +
  `cargarMetaPixel` (`marketing`) donde hoy van sueltos en `app/route.ts`. Es la más
  laboriosa (multi-idioma + dos proveedores + el mecanismo peculiar de esa app, HTML
  servido entero por una ruta `edge`, no componentes React sueltos). Prioridad 3.

## Testing

Cada app se lleva un guardián que compruebe, leyendo el HTML/bundle servido (no solo el
código fuente), que ningún proveedor de analítica/marketing aparece SIN condición —
mismo espíritu que `lib/analitica.test.ts` de asegura-web hoy, y con la regla de este repo
de que un cepo no cuenta si no se le ha visto fallar: se rompe la guarda a propósito, se
comprueba el rojo, se restaura.

## Fuera de alcance (a propósito)

- Cambiar el motor de analítica de ninguna app (GA4 sigue siendo GA4, PostHog sigue siendo
  PostHog). Esta spec es solo la capa de consentimiento.
- `app.grupoasegura.com` (el CRM de Manuel, repo `asegura`, fuera de este repo) — no se
  puede tocar desde aquí.
- Migrar el registro de auditoría existente de Cookiebot (histórico de asegura-web hasta
  hoy). Se pierde al cambiar de proveedor; no hay nada que migrar, solo que asumir.
