---
name: mercado-booking
description: Rutina PROGRAMADA diaria que mide el precio REAL por fecha y aforo con el conector de Booking.com y lo escribe en market_rates (fuente booking_mcp) — la única fuente de SIVRA que distingue temporada. Úsala al disparo diario o si Alberto pide "mide el mercado de verdad" / "refresca los comparables por fecha". Sin secretos: solo nombres de variable.
---

# Mercado real por fecha — rutina de Booking (SIVRA)

**Qué haces:** pides al servidor QUÉ ventanas (fecha × aforo) hay que medir, las consultas UNA A UNA
con el conector de **Booking.com**, escribes los comparables en `market_rates` por el raíl HTTP, y
dejas huella del latido. Nada más. No decides precios, no tocas Smoobu, no llamas a la IA.

## Por qué existes (06/08/2026)

El barrido automático por búsqueda web (`mercado/sweep`, Serper) quedó mecánicamente perfecto y aun
así **no mide temporada**: sus precios son de anuncio y vienen SIN fecha. Medido ese día para el
Dúplex el viernes 4-sep: Serper decía **p50 171€** (bucket del mes, elegible) y el mercado real de
Booking era **129€** — un 33% por encima, con los mismos comparables repitiendo precio en agosto,
noviembre y marzo. El motor tarifica meses enteros con ese número.

Booking sí distingue: esas mismas propiedades valen ~160€/noche en noviembre y **~650€/noche en la
Feria**. Pero a un conector se le pregunta desde una sesión, no desde un cron: por eso esto es una
rutina y no un `CRON_JOBS`.

## 🚨 No romper

- **`price.book` del conector es el TOTAL de la estancia, NO el precio por noche.** Divide entre las
  noches de la ventana (`checkout - checkin`, normalmente 2) antes de escribir. Un total servido como
  precio/noche duplica el mercado y el motor sube precios contra un fantasma — es la misma clase de
  error de unidad que costó el radar de trading (PR #1189).
- **Escribe SIEMPRE con `fuente: "booking_mcp"`.** Es lo único que distingue tu medición real de un
  precio de anuncio scrapeado (los dos llegan con `portal: "booking"`).
- **🪞 NUESTRO propio anuncio NO es un comparable.** Booking devuelve nuestros pisos entre los
  resultados (visto el 14/08/2026: «HOUSE SEVILLANA 6 habitaciones» en la ventana de aforo 12).
  Escribirlo es comparar el piso consigo mismo: el ancla de mercado pasa a contener el precio que el
  propio motor acaba de poner y el sistema se realimenta en silencio — el `fuente:"booking_mcp"` no
  te protege, porque el precio es real y de la fecha correcta; lo que está mal es de QUIÉN es.
  Descártalo y **dilo en el parte** (cuántos y cuáles). Desde el 14/08/2026 el endpoint `ingest`
  también lo filtra (`lib/sivra/mercado-propios.ts`) y devuelve `propios[]`, pero no te apoyes solo
  en el raíl: su lista es curada y solo conoce los anuncios ya vistos. Si aparece uno nuestro que no
  esté en ella, descártalo tú y déjalo anotado para añadirlo.
  ⚠️ **No confundas con la competencia de la misma calle:** dos de nuestros pisos están en Bustos
  Tavera y ahí hay comparables legítimos ajenos («Monkeys Apartments Casa Palacio Bustos Tavera»,
  «Bustos Tavera Suite»). Se descarta por el NOMBRE del anuncio, nunca por la calle.
- **NO inventes comparables ni rellenes huecos.** Si una ventana no devuelve nada, cuéntala como
  `sinRespuesta` y sigue: «el conector no contestó» NO es «no hay mercado». Esa distinción es el
  motivo de que exista esta rutina.
- **Usa PLATAFORMA, no sivra:** la red de la rutina solo alcanza `PLATAFORMA_URL`
  (`https://plataforma-ten-flame.vercel.app`).
- **Auth: `Authorization: Bearer {ALERTA_TOKEN}`** (header-only). **NO uses ni pidas `CRON_SECRET`.**
- **No toques precios.** Aplicar tarifas es del agente de pricing por los raíles de
  `aplicar-propuesta`. Tú solo alimentas el corpus de entrada.

## Pasos

### 1. Pide el plan
```
GET {PLATAFORMA_URL}/api/sivra/mercado/plan?max=12
Authorization: Bearer {ALERTA_TOKEN}
```
Devuelve `{ventanas:[{checkin, checkout, aforo, pisos[], motivo, etiqueta, ronda, diasSinMedir,
comps}], plan_total, filtro, candidatas, recortadas, pedidas, sin_medir_nunca, avisos}` **ya ordenado
por urgencia** (lo nunca medido primero, luego lo más viejo). No reordenes ni elijas tú: el orden
protege la línea de temporada. Si trae `avisos`, arrástralos al parte final.

**Pasada acotada (`?rondas=2,3&desde=2026-09-01&hasta=2027-01-31`).** Para dirigir una pasada a una
parte del plan — típicamente la **profundidad de bucket** (rondas 2 y 3 = 2ª y 3ª fecha de cada mes,
las que hacen ELEGIBLE el bucket mensual del motor, que exige ≥3 fechas distintas). Reparto de
rondas: **0** = 1ª fecha de cada mes (línea de temporada) · **1** = fechas de evento · **2 y 3** =
profundidad.
🚨 **Filtra por query, NUNCA descartando ventanas del JSON después.** El orden de urgencia pone lo
virgen primero y, entre vírgenes, la ronda baja antes que la alta: las rondas de profundidad son las
últimas de la cola, así que recortar en cliente solo alcanza lo que el tope no se comió ya (medido el
08/08/2026: de 40 ventanas de ronda 2-3 entre sep y ene, `?max=30` + filtro en cliente llegaba a 18,
y a ninguna de ronda 3). Un filtro mal escrito devuelve **400**, no la pasada entera.
Con filtro, el denominador honesto del parte es **`candidatas`**, no `plan_total`; y si
`recortadas > 0` el tope dejó fuera ventanas que casaban — dilo en el parte.

### 2. Mide cada ventana con Booking.com
Por cada ventana, una búsqueda de alojamientos con:
- destino **Seville, Spain**, `accommodation_types: ["APARTMENT"]`, `currency: EUR`,
  `user_country_code: es`
- `checkin_date`/`checkout_date` = los de la ventana
- **`number_of_adults` = `aforo` de la ventana** (es el punto: un piso de 12 plazas no se compara
  con apartamentos de 4 — bug del 31/07/2026)

De cada alojamiento quédate con: `name`, `price.book`, `rating.review_score`,
`rating.number_of_reviews`, `location.district_name`. **Ignora la lista de `facilities`** (es enorme
y no aporta nada al pricing).

`price_night = round(price.book / noches)`. Descarta el alojamiento si no trae precio, y descarta
también **nuestros propios anuncios** (ver «No romper»): con aforos grandes salen entre los resultados.

### 3. Escribe los comparables
Una llamada por ventana **y por piso** (los pisos del aforo comparten los mismos comps):
```
POST {PLATAFORMA_URL}/api/sivra/mercado/ingest
Authorization: Bearer {ALERTA_TOKEN}
{ "portal":"booking", "fuente":"booking_mcp", "scenario":"<piso>",
  "checkin":"YYYY-MM-DD", "checkout":"YYYY-MM-DD", "guests":<aforo>,
  "apartments":[{"name":"…","price_night":129,"price_total":258,"score":8.9,
                 "review_count":121,"location":"Centro histórico de Sevilla"}] }
```
Es idempotente por día (upsert por `search_date+portal+scenario+comp_name+checkin_date`): repetir
una ventana no duplica nada.

### 4. Deja huella del latido (OBLIGATORIO, incluso si fue mal)
```
POST {PLATAFORMA_URL}/api/internal/latido
Authorization: Bearer {ALERTA_TOKEN}
{ "agente":"sivra_mercado_booking", "ok":<true|false>, "detalle":"<parte>" }
```
`ok = true` **solo si** escribiste comps y **menos de la mitad** de las ventanas se quedaron sin
respuesta. El `detalle` dice, en este orden: comps escritos y ventanas medidas · ⚠️ ventanas sin
respuesta del conector · sin precio utilizable · 🪞 anuncios propios descartados · fallos. Ejemplo:
`«38 comps reales en 12 ventanas · ⚠️ 2 ventanas sin respuesta del conector (NO es «no hay mercado»:
no se ha podido mirar)»`.
Si algo revienta a mitad, **manda el latido con `ok:false` antes de rendirte**: un agente sin huella
se lee como «no se dispara» y manda a mirar al sitio equivocado (lección del 31/07/2026).

### 5. Cierra
- Auto-informe corto en `docs/AGENTES-BITACORA.md` (qué ventanas mediste, medianas por fecha/aforo,
  qué falló).
- Si la pasada fue mala **dos días seguidos**, avisa a Alberto por
  `POST /api/internal/alerta` con `ALERTA_TOKEN` (un fallo suelto no merece Telegram: el latido ya
  lo cuenta).
- Anota en `docs/CONTEXTO-SESIONES.md` solo si hubo algo digno de recordar (máx ~8 líneas).

## Presupuesto y límites (asumidos, no son un fallo)

- **12 ventanas por pasada** de un plan de ~96: la cobertura se ACUMULA (el motor mira 120 días
  atrás), así que en 3-4 días está el plan entero y luego se auto-refresca por antigüedad. Pedir más
  no cabe en el contexto de una sesión.
- Cada respuesta del conector es grande: no la pegues entera en el informe, solo los campos que usas.
- El bucket mensual del motor exige **≥3 fechas distintas del mes**, así que un mes no queda
  «cubierto» hasta la 3ª pasada. Hasta entonces sus comps solo alimentan el bucket por fecha exacta.

## Envs de la rutina
`PLATAFORMA_URL` + `ALERTA_TOKEN`. Conector requerido: **Booking.com**. (Supabase solo si quieres
consultar algo extra; el circuito normal no lo necesita.)
