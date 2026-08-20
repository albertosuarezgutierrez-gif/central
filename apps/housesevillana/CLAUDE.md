# CLAUDE.md — `apps/housesevillana` (landing pública de House Sevillana)

> Web pública de **House Sevillana** (`housesevillana.es`), el canal DIRECTO de la casa:
> motor de reservas propio, WhatsApp y teléfono. Su razón de ser es esquivar la comisión de
> Booking, así que **todo CTA lleva al motor propio**, nunca a un portal.
> La gestión interna (finanzas, pricing, mensajería) NO está aquí: vive en
> `apps/plataforma` (`/sivra/*`). Ver también la skill `sivra-maestro`.

## La propiedad (dato fijado, no lo deduzcas)

**Calle Socorro 24, 41003 Sevilla — barrio de San Julián**, distrito Casco Antiguo
(37.395904, -5.987431). La calle va de la Plaza de San Román a la Plaza de San Marcos. 290 m²,
6 dormitorios, 4 baños, patio andaluz, azotea y **plaza de garaje privada en el edificio** (el argumento nº 1: aparcar en el
casco antiguo es un dolor). Licencia **VFT/SE/01179**, obligatoria y visible en la web.

> 🚨 **NO es Bustos Tavera 22.** Esa es la dirección de OTROS DOS pisos del grupo — *Luxury
> Busto* y *Busto Reform*, bajo derecha y bajo izquierda, alquilados a Gutiérrez Alcalá. La
> skill **sincronizada** `seo-house-sevillana` se la atribuye a House Sevillana en siete
> sitios, **incluidos sus dos JSON-LD con `streetAddress`** — de raíz, porque le asigna el **ID
> de Booking `4771238`, que es el de Busto Reform** (el de House Sevillana es `2039943`): publicar ese schema le daría a
> Google una dirección falsa para el negocio, y encima la de dos competidores propios en la
> misma búsqueda local. Esa skill vive FUERA del repo (`/root/.claude/skills/synced/`, sin
> git) y **la tiene que corregir Alberto**; hasta entonces, este fichero manda sobre ella. El
> parche exacto, listo para pegar, está en `docs/PARCHE-skill-seo-house-sevillana.md`.
> (Confirmado por Alberto y por fuentes públicas el 19/08/2026.)
>
> Lo mismo con el barrio: **San Julián**, no la Macarena. La página `/barrio` posiciona la
> keyword «Macarena» a propósito —ahí está el volumen de búsqueda— pero situando la casa en
> San Julián, «la puerta de la Macarena», que es literal: la ruta del barrio que publica
> Turismo de Sevilla arranca en la plaza de San Marcos y sube por Bustos Tavera.

## Arquitectura: una sola página, servida como texto

No hay componentes React. **`app/route.ts` exporta el documento HTML ENTERO como un template
literal** (`export const HTML`) y lo sirve una ruta `edge`. El resto de páginas
(`/barrio`, `/que-ver`, `/parking`) hacen lo mismo con su propio HTML.

Consecuencias que muerden:

- **Nada de comillas invertidas dentro del HTML**, ni siquiera en un comentario CSS: cierran
  la plantilla y rompen el build. Hay avisos puestos en el propio CSS.
- El HTML de la portada **no se puede mover a otro fichero**: el agente SEO lo reescribe por
  esa ruta exacta (ver abajo).

## 🚨 i18n: las otras lenguas se DERIVAN del español, por cadenas exactas

`/en` y `/it` no son copias: `app/i18n/motor.ts` aplica un diccionario sobre el MISMO HTML
español. **Las claves son las cadenas literales del HTML, con sus entidades** (`&oacute;`,
`&mdash;`, `&middot;`…).

Por tanto, **cambiar cualquier texto español de `app/route.ts` rompe su traducción en
silencio** — la página inglesa se queda con ese párrafo en castellano. Si tocas una cadena,
actualiza `app/en/traducciones.ts` **y** `app/it/traducciones.ts` (las dos: un test exige que
cubran exactamente las mismas claves).

Ojo con las claves que llevan un emoji o un icono delante: si quitas el emoji, la clave
cambia. Pasó el 19/08/2026 al sustituir los emojis por SVG.

`<title>`, `meta description` y los `og:` **NO son claves de diccionario** a propósito: los
escribe `META` en cada `app/<lang>/route.ts` por etiqueta, porque el agente SEO los reescribe
en el español cada lunes y una clave de diccionario dejaría de casar sin avisar.

`RUTAS_LOCALIZADAS` (en `motor.ts`) solo lista `/` y `/parking`, que son las únicas
traducidas. `/barrio` y `/que-ver` están fuera a propósito: prefijarlas daría un 404.

## 🚨 Este repo NO es el único que escribe aquí

El **agente SEO de `apps/sivra`** (`/api/seo-refresh`, lunes) reescribe `app/route.ts` solo,
por la GitHub Contents API — ver `apps/sivra/lib/seo-landing.ts`. Toca **solo** `<title>`,
`meta description`, los `og:` y el primer bloque `ld+json`. No inyecta secciones ni toca el
cuerpo: si aparece contenido raro en el HTML, es residuo humano, no del agente.

## Diseño

Sistema de tokens en el `:root` del `<style>`: `--clay` (identidad), `--night`/`--night2`
(fondos oscuros), `--cream`, `--accent-warm`, `--serif` (Cormorant Garamond) + `--sans`
(Outfit), `--sh`/`--sh-hover`, `--r`. **Usa los tokens**: los grises y naranjas sueltos
(`#1a1a1a`, `#2d2d2d`, `#B04E2A`, `#fdf6f0`) que había en el HTML eran restos de bloques
pegados a mano, y se ven como lo que son.

- **Iconos: SVG de trazo con `class="ico"`**, que heredan el color del contenedor. Nada de
  emojis en la interfaz — los pinta el sistema operativo, así que ni se tiñen con la paleta
  ni se ven igual en Android, iOS y Windows (y es fácil que acaben siendo el icono
  equivocado: había una mezquita para una basílica y un torii japonés para la Giralda).
- **Movimiento:** las tarjetas entran con la clase `.rv`, que es `opacity:0` a la espera del
  IntersectionObserver. Si alguna vez apagas las animaciones, **devuelve esa opacidad** o
  media página se queda EN BLANCO en vez de quieta. Ya está resuelto para
  `prefers-reduced-motion`, en el CSS y en el JS (`REDUCIR`).
- Aplican íntegras las reglas globales del `CLAUDE.md` raíz: **responsive** (probado a 320 px,
  objetivos táctiles ≥44 px en móvil), rendimiento y formato de dinero.

## Calendario de disponibilidad (portada, encima de `#reserva`)

Vive en **`app/calendario.ts`** (`CALENDARIO_HTML/_PLANTILLAS/_CSS/_JS`) y entra en `route.ts` por cuatro
interpolaciones. Está aparte para no darle superficie al agente SEO que reescribe `route.ts` los lunes —
y por eso `traducciones.test.ts` lee `route.ts` **más** `calendario.ts`: si no, sus 16 cadenas quedarían
fuera de la red de i18n (el fallo de PR #1487).

El dato no sale de aquí: la landing no tiene BD ni secretos. Lo pide por `fetch` a
**`plataforma-ten-flame.vercel.app/api/publico/disponibilidad`** (ver `apps/plataforma/CLAUDE.md`).
Consecuencias que muerden:
- **Toda celda NACE en `sindato`** y un fallo de red va al estado `error`, con aviso visible y salida al
  motor. Nunca a una rejilla vacía: a ojo se lee como «todo libre», que es la mentira cara de esta web.
- Si ves el aviso «No hemos podido consultar el calendario», el sospechoso nº 1 es **CORS**, no el dato:
  compruébalo con `curl -H "Origin: https://housesevillana.es"` contra el endpoint y mira si vuelve
  `access-control-allow-origin`. Un 200 de curl a secas no prueba nada — y como la respuesta se cachea
  10 min en el CDN, **una sola petición tampoco**: repite varias veces y mira `x-vercel-cache`. El
  landmine completo (se rompió dos veces el 20/08/2026) está en `apps/plataforma/CLAUDE.md`.
- Los estados se traducen solos: el `aria-label` se compone con el texto de la leyenda, y meses y días
  salen de `Intl` según el `lang` del documento.

## Pruebas

`npm test` en esta carpeta (Node test runner sobre los `.ts`, sin build):

- `app/i18n/traducciones.test.ts` — la red de seguridad de arriba: toda clave del diccionario
  existe en el HTML, los dos idiomas cubren las mismas claves, no queda castellano evidente,
  y los metadatos sobreviven a la pasada del agente SEO (la simula).
- `app/enlaces.test.ts` — el enlace que da de comer: ninguna página teclea la URL del motor
  (se importa de `app/reservas.ts`) ni apunta a un dominio muerto.
- `app/anclas.test.ts` — cada `href="#x"` tiene su `id`, y `/barrio` y `/que-ver` conservan su
  camino a la reserva.

Los tres leen los ficheros **como texto** en vez de importarlos, porque `app/route.ts`
arrastra `next/server` y el runner de Node no lo resuelve.

**Regla de estas pruebas: una guarda que no encuentra nada NO está en verde, está hueca.**
Casi todas recorren listas derivadas del HTML (los «delatores» de castellano sin traducir, las
páginas que descubre `readdirSync`, las anclas que saca una expresión regular). Si el copy
cambia y una frase deja de existir, o un cambio de formato deja la expresión sin casar, el
bucle se queda vacío y el test pasa **sin haber comprobado nada**. Pasó el 19/08/2026:
«Sin comisiones de Booking» desapareció del HTML al reescribir el copy y su delator llevaba
días pasando en vacío. Por eso cada recorrido lleva ahora su propia comprobación de que
encontró algo — si añades otro, añádele la suya.

## Despliegue

Proyecto Vercel `house-sevillana-landing`, Root Directory `apps/housesevillana`, con el
`ignoreCommand` obligatorio del monorepo. Se unificó aquí el 12/08/2026 desde el repo suelto
`house-sevillana-landing`, **sin su historia git a propósito**: contenía una `service_role` de
Supabase.

## Pendiente

- **Nota de Booking: se copia a mano.** Hoy es **8,6/10 con 51 reseñas** (conector de
  Booking, 19/08/2026); la página venía diciendo 8,1 con +47, que era el dato de hacía meses.
  Nada la refresca sola: al tocar la landing, contrasta el número contra la ficha real.
- **Ninguna sesión de Claude puede VER las fotos.** Viven en Drive y se sirven por
  `lh3.googleusercontent.com`, que la política de egress bloquea; el conector de Drive lista y
  da metadatos, pero `read_file_content` devuelve vacío para JPEG y bajarlas en base64 no cabe
  en contexto. Consecuencia práctica: **no elijas ni juzgues una foto desde una sesión** — lo
  hace Alberto sobre la carpeta de Drive. Se coló así una escalera como portada, con un `alt`
  que decía «fachada» (corregido el 19/08/2026: la portada es el salón).
- **Booking anuncia «Admite mascotas» y aquí se dice que NO.** Sin resolver: es una decisión de
  Alberto, y los dos canales tienen que decir lo mismo.
- **Minutos a pie** desde Socorro 24 a la Basílica de la Macarena, la muralla, el Mercado de
  la Feria y la Alameda. `/barrio` los perdió porque los que había salían de suponer la casa
  dentro de la Macarena. Mejor sin número que con el equivocado. (No se pudieron medir desde
  la sesión: la política de egress bloquea Nominatim, OSRM y demás APIs de mapas.)
- `/barrio` y `/que-ver` tienen **su propio CSS**, ajeno al sistema de tokens de la portada
  (Georgia, gradientes naranjas). Unificarlas está sin hacer.
