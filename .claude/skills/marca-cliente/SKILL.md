---
name: marca-cliente
description: Alta/intake de la identidad corporativa de un cliente o tenant de la casa de marcas y aplicación a su app. Úsala cuando entre un cliente nuevo (Joaquín Jaén, Rico González, Global…) o haya un rebrand y haya que dejar su UI idéntica a SU marca (colores, tipografías, logo), o cuando Alberto pida "adáptalo a la imagen corporativa de X". Convierte la marca cruda (su web, su logo, unas fotos) en un objeto `Marca` de `@central/brand` y lo enchufa. NO es un agente programado: es un flujo bajo demanda. Complementa la skill `adobe-diseno` (que genera/vectoriza los assets).
---

# Alta de marca de cliente (`marca-cliente`)

Deja la UI de un cliente/tenant idéntica a SU identidad corporativa, de forma repetible y a coste marginal para el siguiente cliente. Se apoya en el paquete **`@central/brand`** (contrato de tokens + emisor de variables CSS) y en la skill **`adobe-diseno`** (Adobe Firefly MCP) para producir assets.

## Arquitectura (contexto)

- **`packages/brand` (`@central/brand`)** — pieza compartida y portable:
  - `src/tipos.ts`: contrato `Marca { id, nombre, paleta, tipografia, logos, radio }`.
  - `src/css.ts`: `emitirVariables(marca)` / `emitirRootCss(marca)` → bloque `:root{…}` con los nombres de variable que ya usan los `globals.css` (`--bg`, `--accent`, `--text`, `--serif`, `--sans`…) **más** los de marca (`--brand`, `--brand-ink`, `--brand-soft`).
  - `src/marcas/<cliente>.ts`: el objeto `Marca` de cada cliente (p. ej. `MARCA_JOAQUIN_JAEN`).
- **La app consume la marca** inyectando `emitirRootCss(MARCA)` en un `<style>` del `<head>` (en `app/layout.tsx`), lo que **sobreescribe** los tokens base sin reescribir el CSS. Multi-tenant: se resuelve la marca por cuenta/tenant.
- Distinción de color: **`--brand`** = color dominante de la marca (identidad, títulos, acciones); **`--accent`** = acento decorativo (filetes, bordes, monograma). No los confundas.

## Flujo (pasos)

1. **Reúne el material del cliente.** Pide/usa: su web (idealmente guardada como `.mht`, que trae CSS y colores sin necesidad de red), su **logo** (mejor vectorial), y fotos en alta. Revisa capturas reales de su web.
2. **Extrae la identidad.**
   - Colores: saca los hex de su web. Ojo — muchas webs son Bootstrap y sus hex reales están en el **logo** y en capturas, no en el CSS (grep de `#hex`/`font-family` sobre el `.mht`; para el color de marca, muestréalo de las capturas).
   - Tipografías: `grep -aoiE "font-family:[^;]{0,40}"` sobre el `.mht`.
   - Logo: identifica versión monograma y lockup; sus colores reales (a veces la app tiene una versión recoloreada que NO es la de marca).
3. **Produce los assets que falten** con `adobe-diseno`: vectoriza el logo si solo hay imagen, genera variantes (monograma/lockup), hero y cabeceras. Colócalos en `apps/<app>/public/`.
4. **Crea el objeto `Marca`** en `packages/brand/src/marcas/<cliente>.ts` con la paleta (primario/acento/superficies/texto/estados), tipografía (con `googleFontsHref` si usan fuentes de Google) y logos. Expórtalo en `src/index.ts`.
5. **Enchúfalo en la app**: `transpilePackages` incluye `@central/brand`; `dependencies` con `"@central/brand": "workspace:*"`; en `app/layout.tsx` inyecta `emitirRootCss(MARCA)` + el `<link>` de Google Fonts.
6. **Repunta los pocos sitios** del `globals.css` que deban usar el color de marca (`--brand`) en vez del acento: normalmente botón primario, nav activo, wordmark, títulos (`h1`), precios y bordes/filetes. El resto se re-tematiza solo al venir de las variables.
7. **Verifica de verdad**: `tsc --noEmit`, `next build`, y **captura con Playwright** (`/opt/node22/lib/node_modules/playwright`, chromium en `/opt/pw-browsers/chromium`) del login y una página pública para comprobar que los tokens se aplican (lee `getComputedStyle(document.documentElement).getPropertyValue('--brand')`).
8. **Entrega** por PR draft con la captura, y anota en `docs/CONTEXTO-SESIONES.md`.

## Reglas del monorepo que aplican

- Responsive obligatorio (≥320 px), dinero en formato español (`2.162,49€`), rendimiento (listas paginadas). Ver `CLAUDE.md`.
- Fuentes: cárgalas por `<link>` a Google Fonts en el `<head>` (el entorno de build tiene la red capada; `next/font/google` descarga en build y puede fallar — evítalo).
- Nada de secretos en el objeto `Marca` (son colores/fuentes/rutas públicas).

## Reutilización

El primer cliente paga la infraestructura (`@central/brand` + esta skill). Cada cliente siguiente = pasos 1–8 con su material → su `src/marcas/<cliente>.ts`. Verticales de marca única: un fichero de tokens estático. Apps multi-tenant: la marca por tenant en BD, resuelta en el layout.
