# Calendario de disponibilidad en la landing de House Sevillana

**Fecha:** 19/08/2026 · **Estado:** diseño aprobado por Alberto, pendiente de plan de implementación

## Qué se pide y por qué

Hoy la sección `#reserva` de `housesevillana.es` dice «Comprueba disponibilidad» y manda al motor
de Smoobu. El visitante tiene que salir de la web para saber si su fin de semana está libre. Se
añade un **calendario que se ve de un vistazo**, sin salir de la página, encima de esa sección.

Es una palanca del canal directo, no un adorno: la landing existe para esquivar la comisión de
Booking (19,72% medido sobre 1.322 reservas), y el salto a un motor externo es el punto donde se
pierde gente.

## Decisiones ya tomadas (Alberto, 19/08/2026)

1. **Calendario propio** alimentado por un endpoint público nuestro — no el widget iframe de
   Smoobu, ni HTML generado dentro del fichero de la landing.
2. **Solo libre / ocupado.** Ni precio (no le regalamos a la competencia los movimientos diarios
   del motor de precios; Busto Reform y Luxury Busto pelean las mismas búsquedas) ni estancia
   mínima.

## Restricciones del terreno (no negociables, vienen del repo)

| Restricción | Consecuencia para este diseño |
| --- | --- |
| `apps/housesevillana` es HTML plano servido por rutas `edge`. **Sin BD, sin Prisma, sin secretos.** | Los datos tienen que venir de un endpoint externo. La landing no puede hablar con Smoobu. |
| `app/route.ts` exporta el documento entero como **un template literal**. | **Ni una comilla invertida** en el HTML/CSS/JS que se inserte, ni dentro de un comentario: cierra la plantilla y rompe el build. |
| El **agente SEO de sivra reescribe `app/route.ts`** cada lunes por la GitHub Contents API. | El calendario vive en su **propio fichero** y entra en `route.ts` como **una sola línea interpolada**. Mínima superficie de choque. |
| `/en` y `/it` se **derivan** del HTML español por cadenas exactas (`app/i18n/motor.ts`). | Toda cadena visible nueva necesita clave en los dos diccionarios. Ver el agujero del guardián más abajo. |
| `docs/../CLAUDE.md`: «Dato que NO hay ≠ dato que NO se ha mirado». | Tres estados, nunca dos. Un fallo de red **jamás** puede pintarse como «libre». |
| Regla responsive del monorepo. | Usable a 320 px, área táctil ≥44 px. |

## Arquitectura

```
navegador (housesevillana.es/es|en|it)
   │  fetch, 1 sola petición, 12 meses
   ▼
apps/plataforma  GET /api/publico/disponibilidad?piso=house-sevillana
   │  s-maxage=600  (≈6 llamadas/hora a Smoobu como mucho)
   ├─ fuente 1: Smoobu /api/rates  (smoobuFetch, key desde pms_connections)
   └─ fuente 2: tabla rate_snapshots  (respaldo, con sello de fecha)
```

### Pieza 1 — `apps/plataforma/app/api/publico/disponibilidad/route.ts`

**Contrato**

`GET /api/publico/disponibilidad?piso=<slug>&meses=<1..12>`

```jsonc
{
  "piso": "house-sevillana",
  "desde": "2026-08-19",
  "hasta": "2027-08-19",
  "fuente": "smoobu",              // "smoobu" | "snapshot"
  "actualizado": "2026-08-19T19:50:00.000Z",
  "ocupadas": ["2026-08-21", "2026-08-22"],
  "sinDato":  ["2027-08-18", "2027-08-19"]
}
```

**Tres estados explícitos.** Una noche está en `ocupadas`, o en `sinDato`, o está libre por
descarte. `sinDato` no es un detalle de implementación: es la respuesta honesta para las fechas
que Smoobu no devuelve, y el cliente la pinta distinta de «libre».

**Por noche, no por día.** `/api/rates` de Smoobu ya devuelve disponibilidad **por noche**, así
que el día de salida de una reserva sale disponible sin que tengamos que restar nada. Es la
trampa clásica de estos calendarios (marcar ocupado el día del checkout enseña menos
disponibilidad de la que hay) y aquí no aplica **siempre que no se toque ese dato**.

**Autorización.** El endpoint es público: entra en la lista `PUBLIC` de
`apps/plataforma/middleware.ts` con un comentario en el estilo de los que ya hay, diciendo qué
expone y por qué es seguro. Lo que publica —qué noches están cogidas— ya se lo enseña el motor de
Smoobu a cualquiera que entre. No expone huéspedes, importes, ni identificadores de reserva.

**Lista blanca de pisos.** `slug → { propId, smoobuId }`, reutilizando el mapa de
`app/api/sivra/rates/snapshot/route.ts`. Hoy solo se sirve `house-sevillana`
(`prop_house_sevillana` / `352007`). Un slug desconocido devuelve **400**, nunca un listado de las
propiedades del grupo.

**Degradación (lo más importante del endpoint):**

1. Smoobu responde → `fuente: "smoobu"`, `actualizado` = ahora.
2. Smoobu falla → última fila de `rate_snapshots` cuyo `snapshot_date` sea de **hoy o ayer** →
   `fuente: "snapshot"`, `actualizado` = ese `snapshot_date`.
3. Smoobu falla **y** el snapshot no existe o es de hace más de 2 días → **HTTP 503** con
   `{ "error": "disponibilidad no disponible" }`.

El paso 3 es la regla, no una cortesía: devolver `ocupadas: []` porque una consulta falló es
exactamente el «catch que devuelve `[]` y aguas abajo dice que no hay nada» que prohíbe
`CLAUDE.md`. Y el umbral de 2 días es conservador a propósito — el cron de `rate_snapshots` corre
a diario a las 07:00 UTC, así que un snapshot de anteayer significa que el cron está muerto.

**Cabeceras.** `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600`.
CORS: se compara el `Origin` entrante contra un permitidor y, si pasa, se devuelve **ese origen
literal** en `Access-Control-Allow-Origin` (la cabecera no admite comodines parciales, así que
devolver la lista no vale). El permitidor acepta:

- `https://housesevillana.es` y `https://www.housesevillana.es` — exactos.
- Los previews de Vercel del proyecto, que llevan un hash por despliegue y por tanto **no se
  pueden listar**: `/^https:\/\/house-sevillana-landing-[a-z0-9-]+\.vercel\.app$/`, anclado por
  los dos extremos para que `house-sevillana-landing-x.vercel.app.malo.com` no cuele.

Origen ausente (una petición server-to-server, o `curl`) → se sirve igual sin la cabecera: CORS
protege al navegador de otros, no al endpoint, y este es público a propósito.

### Pieza 2 — `apps/plataforma/lib/sivra/disponibilidad-publica.ts` (+ test)

La lógica del titular va en un helper puro y testeado, no incrustada en el handler (patrón de
referencia del repo: `lib/subastas/resumen-docs.ts`).

```ts
/** Noches [desde, hasta) en orden, como 'AAAA-MM-DD'. */
export function noches(desde: string, hasta: string): string[]

/** Reparte las noches en los tres cubos a partir de la respuesta de Smoobu. */
export function clasificar(
  rates: Record<string, { available?: number | null } | undefined>,
  fechas: string[],
): { ocupadas: string[]; sinDato: string[] }
```

Tests obligatorios:

- `available: 0` → ocupada; `available: 1` → libre (no aparece en ningún cubo).
- **`available` ausente, `undefined` o `null` → `sinDato`, JAMÁS libre.** Es el test que da
  sentido a la pieza.
- Fecha fuera del horizonte de Smoobu → `sinDato`.
- `noches()` no se salta ni duplica días en un cambio de mes ni en un año bisiesto.

### Pieza 3 — `apps/housesevillana/app/calendario.ts`

Exporta dos constantes que `route.ts` interpola una sola vez, encima de la sección `#reserva`:

- `CALENDARIO_HTML` — el contenedor, la leyenda y los mensajes de estado.
- `CALENDARIO_JS` — el script en línea que lo pinta.

**Comportamiento**

- El HTML **servido** está en estado «Cargando disponibilidad…». No se sirve una rejilla vacía,
  que a ojo se lee como «todo libre».
- Una sola petición de 12 meses al cargar. La paginación ‹ › es en cliente: no hay más red.
- Pinta 1 mes en móvil y 2–3 en escritorio.
- **Cuatro estados por noche:** libre · ocupada · sin dato · pasada. Distinguibles sin depender
  solo del color.
- **Si el `fetch` falla o devuelve 503:** mensaje visible («No hemos podido cargar la
  disponibilidad ahora mismo») + botón al motor de reservas. **Nunca una rejilla toda verde.**
- Cuando `fuente === "snapshot"`, un sello discreto: «Disponibilidad actualizada el …».
- Meses y días de la semana con `Intl.DateTimeFormat(document.documentElement.lang)`. Sale gratis
  en es/en/it porque `localizar()` ya fija el `lang` de cada variante. Solo la leyenda y los
  mensajes van al diccionario.
- Pulsar una noche libre abre el motor de reservas **con la fecha ya puesta**. Ver abajo.

#### El enlace profundo al motor (investigado el 19/08/2026)

Smoobu **no documenta** públicamente el pre-relleno de fechas del motor de reservas. Pero dos
repos públicos, sin relación entre sí y con **dos cuentas Smoobu distintas**, construyen la misma
URL con los mismos seis parámetros y el mismo formato de fecha (`MehdiTrari/Roaming`, slug
`RoamingLille`, PHP; `irina-miron/Alojamentos-Ninho`, slug `Ninho`, TS, en cuatro ficheros). Que
coincidan por casualidad no es plausible:

```
https://booking.smoobu.com/yourothercity?apartmentId=352007
  &arrivalDate=24/09/2026&departureDate=27/09/2026
  &adults=6&children=0&loadForCurrentDate=true
```

🚨 **`dd/mm/yyyy`, NO ISO.** La API de Smoobu (`login.smoobu.com/api/*`, la que ya usan
`apps/plataforma` y `apps/sivra`) tiene campos con el **mismo nombre** `arrivalDate`/
`departureDate` pero en `yyyy-mm-dd`. Mismo nombre, formato distinto. Esto va anotado en
`app/reservas.ts` junto a la URL, porque el resto del monorepo habla ISO con Smoobu y el
siguiente que toque esto se equivocará.

**Estado: no verificado end-to-end.** El proxy de red de este entorno bloquea `*.smoobu.com`, así
que no se ha podido abrir la URL. Se implementa igualmente porque **el modo de fallo es benigno**:
si el motor ignorase los parámetros, abriría en la casa correcta sin fechas — exactamente lo que
hace hoy el botón. Lo que no se puede es *afirmar* que las fechas aparecen sin haberlo visto.

**Cierre pendiente (30 segundos de Alberto, no de código):** pegar esa URL en un navegador y mirar
si el calendario abre con las fechas marcadas y 6 adultos. Es binario. Si no funciona, se quitan
los parámetros y el clic sigue llevando al motor.

**Accesibilidad:** tabla semántica con `<caption>` por mes, `aria-label` por celda («21 de
agosto, ocupado»), foco de teclado visible, `prefers-reduced-motion` respetado.

### Pieza 4 — i18n, y un agujero del guardián que hay que tapar

`app/i18n/traducciones.test.ts` comprueba que toda clave de diccionario exista en el HTML español
— pero lee **`route.ts` como texto crudo**. Las cadenas que vivan en `calendario.ts` quedarían
fuera de esa red, y volveríamos a servir castellano en `/en` sin enterarnos: el fallo exacto de
PR #1487, detectado en #1495.

Por tanto, parte de este trabajo es **añadir `calendario.ts` a las fuentes que lee ese test**, de
modo que las claves nuevas se validen igual que las de la portada. Las cadenas se añaden a
`app/en/traducciones.ts` y `app/it/traducciones.ts`.

## Fuera de alcance (YAGNI)

- Precio por noche y estancia mínima — decisión de Alberto.
- Los otros tres pisos del grupo: esta landing es solo House Sevillana.
- Selector de fechas, contador de huéspedes o cualquier paso del flujo de reserva: eso es el
  motor, y duplicarlo es duplicar una fuente de verdad.
- Renderizar el calendario en servidor para SEO: Google no posiciona por un calendario, y el HTML
  está cacheado una hora.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una reserva entrada hace 5 minutos aparece libre. | Smoobu en vivo con caché de 10 min. La ventana real es de minutos, y el motor —que es la fuente autoritativa en el momento de pagar— corta el doble booking. |
| El endpoint público se convierte en un canal de scraping de ocupación. | Solo publica lo que el motor ya enseña. La caché de 10 min y la lista blanca de slugs acotan el abuso; si molesta, se le pone rate limit después. |
| El agente SEO de los lunes pisa el calendario. | Solo toca `<title>`, `meta description`, los `og:` y el primer `ld+json`. El calendario entra por una línea interpolada desde otro fichero. |
| Una comilla invertida en el CSS del calendario rompe el build de la landing. | Prohibición explícita en la spec y en el propio fichero; el build de Vercel lo caza antes de producción. |

## Verificación

- Tests del helper puro (arriba), en el gate `Tests (packages + guardián)`.
- El guardián i18n, ampliado a `calendario.ts`, con las claves nuevas en los dos idiomas.
- Test de que el HTML **servido** del calendario no contiene una rejilla de días libres — el
  estado por defecto tiene que ser «cargando».
- Comprobación manual a 320 px y del camino de error (endpoint caído → mensaje, no rejilla verde).
