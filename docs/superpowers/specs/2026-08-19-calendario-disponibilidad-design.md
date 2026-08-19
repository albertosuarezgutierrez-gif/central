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

#### Concepto visual: «la rejilla de azulejo»

Una **sola banda oscura**: calendario arriba, motor de Smoobu abajo, sin costura. La sección se
come el `padding-top` de `.book-sec` y deja una única hairline entre ambos, para que se lea como
una pieza y no como un widget pegado encima. Cada noche es un azulejo de 44 px con radio 10 px —
la misma familia de forma que `.hcs` y `.mas-card`— sobre `rgba(255,255,255,.03)`, que es el
vocabulario que ya usan el hero y la barra de confianza. Mes en `--serif`, números en `--sans`
con `tabular-nums`.

**Los cuatro estados se leen por materia antes que por color** (funcionan en escala de grises):

| Estado | Relleno | Marca extra |
| --- | --- | --- |
| **Libre** | macizo `--cream` | ninguna — es el único sólido |
| **Ocupada** | trama diagonal 45° | número tachado |
| **Sin dato** | hueco, borde discontinuo | `?` en la esquina |
| **Pasada** | sin caja: ni fondo ni borde | ninguna |

«Sin dato» es **el contrario visual de «libre»** (contorno frente a macizo), y eso no es estética:
es la regla de `CLAUDE.md` hecha píxel. Un hueco con interrogación no se puede confundir con una
noche disponible.

#### Las tres invariantes del JS (aquí es donde esto se rompe)

1. **Toda celda nace en `data-estado="sindato"`.** Solo se pisa a `libre`/`ocupada` con dato
   explícito de la API. Si la respuesta cubre 12 de 90 noches, las otras 78 salen huecas con `?`,
   no libres.
2. **Un `catch` va a `error`, nunca a `ok` con todo `sindato`.** Un fallo de red es un error
   visible con salida al motor; `sindato` significa «la API respondió y no cubre esa noche». Son
   cosas distintas y no pueden pintarse igual.
3. **`pasada` gana a todo**, y los huecos de relleno del mes van **sin** `data-estado`.

#### Detalles que ahorran un bug cada uno

- El `aria-label` de cada celda se compone con el `textContent` de la etiqueta de leyenda de su
  estado → **los estados se traducen solos** con el diccionario, sin duplicar textos en el JS.
- La semana empieza donde toque por idioma: `Intl.Locale(lang).weekInfo?.firstDay ?? 1`.
- El calendario **no** entra en la lista de `.rv` del IntersectionObserver: un dato de
  disponibilidad no debe esperar a que hagas scroll.
- Las cadenas nuevas se escriben **largas y distintivas** a propósito: `traducir()` hace
  `split/join` sobre todo el HTML y un «Libre» suelto pisaría subcadenas por toda la página.
- A 320 px, siete celdas de 44 px son 308 px y no cabe padding lateral: la rejilla se sale del
  `wrap` con `margin-inline:-1.25rem` y la tarjeta del mes pierde bordes y radio.
- La regla `.cal-sec + .book-sec` exige que el calendario sea **hermano inmediato anterior** de
  `#reserva`. Si acaba dentro de `.book-sec`, esa regla sobra.

El markup y el CSS completos, listos para pegar, están en el apéndice al final.

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

---

## Apéndice — markup y CSS listos para pegar

> Producidos leyendo el `<style>` real de `app/route.ts` (910 líneas), así que usan los tokens que
> ya existen: `--night`, `--cream`, `--clay`, `--accent-warm`, `--serif`, `--sans`, `--r`, `--sh`.
> **Ni una comilla invertida**, tampoco en los comentarios CSS: esto vive dentro de un template
> literal y una backtick rompe el build.

### Markup — va inmediatamente ANTES de `<div class="book-sec" id="reserva">`

```html
<!-- CALENDARIO DE DISPONIBILIDAD -->
<section class="cal-sec" id="disponibilidad" data-estado="cargando" aria-busy="true">
  <div class="wrap">

    <div class="cal-head">
      <div class="cal-head-txt">
        <div class="tag">Calendario</div>
        <h2 class="cal-h">Noches libres de un vistazo</h2>
      </div>
      <div class="cal-nav">
        <button type="button" class="cal-btn" id="cal-prev" aria-label="Meses anteriores" aria-controls="cal-meses" disabled>
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>
        </button>
        <button type="button" class="cal-btn" id="cal-next" aria-label="Meses siguientes" aria-controls="cal-meses">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <p class="s-sub cal-intro">Orientativo: el precio y las condiciones exactas de tus fechas se confirman en el motor de reservas.</p>

    <!-- CARGANDO -->
    <div class="cal-cargando" role="status">
      <p class="cal-esperando">Consultando disponibilidad&hellip;</p>
      <div class="cal-esq" aria-hidden="true"></div>
      <div class="cal-esq" aria-hidden="true"></div>
      <div class="cal-esq" aria-hidden="true"></div>
    </div>

    <!-- ERROR -->
    <div class="cal-error" role="alert">
      <svg class="ico cal-error-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 1.8 20.8h20.4L12 3.2Z"/><path d="M12 9.6v4.8"/><path d="M12 17.8h.01"/></svg>
      <div class="cal-error-txt">
        <strong>No hemos podido consultar el calendario</strong>
        <p>No sabemos qu&eacute; noches est&aacute;n libres ahora mismo, as&iacute; que preferimos no ense&ntilde;arte un calendario que podr&iacute;a estar equivocado. El motor de reservas s&iacute; tiene la disponibilidad real.</p>
      </div>
      <a class="btn-p cal-error-cta" href="${MOTOR_RESERVAS}" target="_blank" rel="noopener">Ver disponibilidad real</a>
    </div>

    <!-- OK -->
    <div class="cal-cuerpo">
      <div class="cal-meses" id="cal-meses"></div>

      <ul class="cal-leyenda">
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="libre" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="libre">Noche libre</span>
        </li>
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="ocupada" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="ocupada">Noche ocupada</span>
        </li>
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="sindato" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="sindato">Sin confirmar</span>
        </li>
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="pasada" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="pasada">Fecha pasada</span>
        </li>
      </ul>

      <p class="cal-pie">
        <span class="cal-frescura" id="cal-frescura"></span>
        <a href="${MOTOR_RESERVAS}" class="cal-link" target="_blank" rel="noopener">Elegir fechas y ver precio &#8594;</a>
      </p>
    </div>

    <noscript><p class="cal-noscript">Activa JavaScript para ver el calendario de disponibilidad, o consulta las fechas directamente en el motor de reservas.</p></noscript>
  </div>
</section>
```

### Plantillas de mes y de día — al final del `<body>`

```html
<template id="cal-tpl-mes">
  <div class="cal-mes-card">
    <table class="cal-mes">
      <caption class="cal-cap"></caption>
      <thead>
        <tr class="cal-dow">
          <th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th>
          <th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th>
          <th scope="col"><abbr></abbr></th>
        </tr>
      </thead>
      <tbody class="cal-body"></tbody>
    </table>
  </div>
</template>

<template id="cal-tpl-dia">
  <td class="cal-d" data-estado="sindato"><span class="cal-t"><span class="cal-num"></span></span></td>
</template>
```

### Contrato del JS con este markup

1. `<caption>` ← `Intl.DateTimeFormat(lang,{month:'long',year:'numeric'})`. Los `<abbr>`: texto =
   `weekday:'short'`, `title` = `weekday:'long'`. Primer día de semana por
   `Intl.Locale(lang).weekInfo?.firstDay ?? 1`. **Ni un nombre de mes o día en HTML/CSS.**
2. Cada `<td>` nace `data-estado="sindato"`; los rellenos del mes son `<td class="cal-d cal-fuera">`
   **sin** `data-estado`.
3. `aria-label` (y `title`) = fecha larga por `Intl` + `': '` + `textContent` de
   `.cal-lg-t[data-estado="…"]`.
4. Hoy: `data-hoy` + `aria-current="date"`.
5. `sec.dataset.estado = 'cargando' | 'error' | 'ok'` y `aria-busy` en consecuencia.
6. `#cal-frescura` ← «Disponibilidad consultada a las HH:MM» con `Intl.DateTimeFormat(lang,{timeStyle:'short'})`.
7. `#cal-prev`/`#cal-next` mueven la ventana **1 mes si `matchMedia('(max-width:720px)')`, 3 si no**;
   `#cal-prev` deshabilitado en el mes actual.

### CSS — dentro del `<style>`, entre `/* POR QUE DIRECTO */` y `/* BOOKING */`

```css
/* CALENDARIO DE DISPONIBILIDAD
   Vive en la MISMA banda oscura que #reserva: esta seccion se come el padding
   superior del .book-sec siguiente y deja una sola hairline entre ambos, para que
   se lea como una pieza y no como un widget pegado encima.
   Cuatro estados por noche, distinguibles sin color: macizo (libre), rayado y
   tachado (ocupada), contorno discontinuo con interrogacion (sin dato) y plano sin
   caja (pasada). SIN DATO no se parece a LIBRE a proposito: significa que no lo
   sabemos, no que este disponible.
   OJO: este CSS vive dentro de un template literal de JS. Nada de comillas
   invertidas, ni siquiera aqui: cierran la plantilla y rompen el build. */
.cal-sec{background:var(--night);background-image:radial-gradient(ellipse 70% 50% at 50% -5%,rgba(196,87,31,.11) 0%,transparent 60%);padding:6rem 2.5rem 3rem}
.cal-sec + .book-sec{background-image:none;padding-top:0}
.cal-sec + .book-sec > .wrap{border-top:1px solid rgba(255,255,255,.07);padding-top:3.5rem}
.cal-sec .tag{color:rgba(244,164,122,.75)}
.cal-h{font-family:var(--serif);font-size:clamp(1.7rem,3vw,2.4rem);font-weight:400;color:var(--white);line-height:1.15;letter-spacing:-.01em}
.cal-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1.5rem;flex-wrap:wrap}
.cal-intro{color:rgba(255,255,255,.5);margin:1rem 0 2rem;max-width:560px}

/* Navegacion de meses */
.cal-nav{display:flex;gap:.5rem;flex-shrink:0}
.cal-btn{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);color:rgba(255,255,255,.72);display:flex;align-items:center;justify-content:center;font-size:1.15rem;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.cal-btn:hover:not(:disabled){background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.22);color:var(--white)}
.cal-btn:disabled{opacity:.3;cursor:default}

/* Conmutador de estado de la seccion entera */
.cal-cargando,.cal-error,.cal-cuerpo{display:none}
.cal-sec[data-estado="cargando"] .cal-cargando{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.cal-sec[data-estado="error"] .cal-error{display:flex}
.cal-sec[data-estado="ok"] .cal-cuerpo{display:block}

/* CARGANDO */
.cal-esperando{grid-column:1/-1;font-size:.8rem;color:rgba(255,255,255,.4);letter-spacing:.05em;text-transform:uppercase;margin-bottom:.25rem}
.cal-esq{height:296px;border-radius:var(--r);border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.035);background-image:linear-gradient(100deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.05) 50%,rgba(255,255,255,0) 80%);background-size:220% 100%;animation:cal-brillo 1.5s linear infinite}
@keyframes cal-brillo{from{background-position:120% 0}to{background-position:-120% 0}}

/* ERROR: visible, honesto y con salida al motor de reservas. */
.cal-error{align-items:center;gap:1.25rem;flex-wrap:wrap;text-align:left;background:rgba(196,87,31,.09);border:1px solid rgba(196,87,31,.30);border-radius:var(--r);padding:1.5rem}
.cal-error-ico{font-size:1.75rem;color:var(--accent-warm);align-self:flex-start}
.cal-error-txt{flex:1 1 260px;min-width:0}
.cal-error-txt strong{display:block;color:var(--white);font-size:.975rem;font-weight:600;letter-spacing:-.015em;margin-bottom:.35rem}
.cal-error-txt p{font-size:.875rem;color:rgba(255,255,255,.55);line-height:1.65;font-weight:300}
.cal-error-cta{flex-shrink:0;min-height:44px;display:inline-flex;align-items:center}

/* MESES */
.cal-meses{display:grid;grid-template-columns:1fr;gap:1rem}
.cal-mes-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:var(--r);padding:1.25rem 1rem 1.4rem}
.cal-mes{width:100%;border-collapse:collapse;table-layout:fixed}
.cal-cap{font-family:var(--serif);font-size:1.3rem;font-weight:400;color:var(--white);text-align:left;text-transform:capitalize;letter-spacing:.01em;padding-bottom:.9rem}
.cal-dow th{font-size:.63rem;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.34);padding-bottom:.5rem}
.cal-dow abbr{text-decoration:none;border:none;cursor:default}

/* La CELDA es el objetivo tactil (44px minimo, regla del CLAUDE.md raiz); el
   azulejo visible va dentro, con 2px de aire por lado. */
.cal-d{position:relative;height:44px;padding:0;text-align:center}
.cal-t{position:absolute;inset:2px;display:flex;align-items:center;justify-content:center;border-radius:10px}
.cal-num{font-size:.82rem;font-weight:400;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:0}

/* LIBRE: el unico macizo. Sin color ya se distingue de los otros tres. */
.cal-sec [data-estado="libre"]>.cal-t{background:var(--cream)}
.cal-sec [data-estado="libre"] .cal-num{color:var(--text);font-weight:500}

/* OCUPADA: trama diagonal + numero tachado. */
.cal-sec [data-estado="ocupada"]>.cal-t{background-color:rgba(255,255,255,.05);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0) 0 3px,rgba(255,255,255,.10) 3px 5px)}
.cal-sec [data-estado="ocupada"] .cal-num{color:rgba(255,255,255,.62);text-decoration:line-through;text-decoration-thickness:1px;text-decoration-color:rgba(255,255,255,.5)}

/* SIN DATO: hueco, borde discontinuo e interrogacion. Es lo CONTRARIO de libre
   (contorno frente a macizo) porque significa que no lo sabemos. */
.cal-sec [data-estado="sindato"]>.cal-t{background:none;border:1px dashed rgba(255,255,255,.42)}
.cal-sec [data-estado="sindato"] .cal-num{color:rgba(255,255,255,.62)}
.cal-sec [data-estado="sindato"]>.cal-t::after{content:'?';position:absolute;top:2px;right:4px;font-size:.6rem;line-height:1;font-weight:600;color:rgba(255,255,255,.62)}

/* PASADA: sin caja de ningun tipo, se retira del plano. */
.cal-sec [data-estado="pasada"]>.cal-t{background:none;border:none}
.cal-sec [data-estado="pasada"] .cal-num{color:rgba(255,255,255,.45)}

.cal-d[data-hoy]>.cal-t{box-shadow:0 0 0 1.5px var(--clay)}
.cal-fuera{visibility:hidden}

/* LEYENDA: usa los MISMOS azulejos, no cuadritos de color aparte. */
.cal-leyenda{list-style:none;display:flex;flex-wrap:wrap;gap:.6rem 1.5rem;margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.06)}
.cal-lg{display:flex;align-items:center;gap:.55rem}
.cal-lg-sw{position:relative;display:inline-block;width:28px;height:28px;flex-shrink:0}
.cal-lg-t{font-size:.78rem;color:rgba(255,255,255,.55);font-weight:300;letter-spacing:-.01em}

/* PIE: la frescura del dato y la salida al motor, que es la fuente de verdad. */
.cal-pie{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:1.25rem}
.cal-frescura{font-size:.762rem;color:rgba(255,255,255,.34);font-weight:300}
.cal-link{font-size:.875rem;color:var(--accent-warm);font-weight:500;letter-spacing:-.01em;display:inline-flex;align-items:center;min-height:44px;transition:color .2s}
.cal-link:hover{color:var(--white)}
.cal-noscript{font-size:.875rem;color:rgba(255,255,255,.55);line-height:1.65;font-weight:300}
.cal-sec:not([data-estado="error"]) .cal-noscript{border-left:2px solid rgba(244,164,122,.4);padding-left:1rem}

/* FOCO VISIBLE por teclado, sobre fondo oscuro. */
.cal-sec :focus-visible{outline:2px solid var(--accent-warm);outline-offset:2px;border-radius:4px}

@media(min-width:721px){
  .cal-meses{grid-template-columns:repeat(2,1fr)}
}
@media(min-width:1025px){
  .cal-meses{grid-template-columns:repeat(3,1fr)}
  .cal-d{height:48px}
}
@media(max-width:768px){
  .cal-sec{padding:3.5rem 1.25rem 2rem}
  .cal-sec + .book-sec > .wrap{padding-top:2.5rem}
  .cal-head{align-items:center}
  .cal-intro{margin-bottom:1.5rem}
  .cal-sec[data-estado="cargando"] .cal-cargando{grid-template-columns:1fr}
  .cal-esq:nth-of-type(n+2){display:none}
  .cal-error{padding:1.25rem}
  .cal-error-cta{width:100%;justify-content:center}
  .cal-pie{flex-direction:column;align-items:flex-start;gap:.25rem}
}
@media(max-width:720px){
  /* Un mes por pantalla en movil; los otros dos siguen en el DOM y las flechas
     desplazan la ventana de uno en uno. */
  .cal-meses>.cal-mes-card:nth-child(n+2){display:none}
}
@media(max-width:400px){
  /* A 320px, 7 celdas de 44px son 308px: no cabe ni un pixel de padding lateral.
     La rejilla se sale del wrap y la tarjeta del mes pierde bordes y radio para
     dejar exactamente esos 308px. */
  .cal-meses{margin-inline:-1.25rem}
  .cal-mes-card{border-left:none;border-right:none;border-radius:0;padding:1rem .375rem 1.1rem}
  .cal-cap,.cal-dow th:first-child{padding-left:.25rem}
  .cal-num{font-size:.78rem}
}
@media(prefers-reduced-motion:reduce){
  .cal-esq{animation:none;background-image:none}
}
```

### Contraste comprobado sobre `--night` (#0D0907)

Libre (`--text` sobre `--cream`) ≈ 15:1 · ocupada y sin dato (`rgba(255,255,255,.62)`) ≈ 6,5:1 ·
borde discontinuo (`.42`) ≈ 3,6:1, por encima del 3:1 que pide un elemento no textual · pasada
(`.45`) ≈ 4,5:1.

### Cadenas nuevas que hay que dar de alta en EN e IT

`Calendario` · `Noches libres de un vistazo` · la intro «Orientativo: …» · `Meses anteriores` ·
`Meses siguientes` · `Consultando disponibilidad…` · las 4 de leyenda (`Noche libre`,
`Noche ocupada`, `Sin confirmar`, `Fecha pasada`) · las 3 del error · `Ver disponibilidad real` ·
`Elegir fechas y ver precio` · el `<noscript>`.
