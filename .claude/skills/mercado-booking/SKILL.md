---
name: mercado-booking
description: Rutina PROGRAMADA diaria que mide el precio REAL por fecha y aforo con el conector de Booking.com y lo escribe en market_rates (fuente booking_mcp) — la única fuente de SIVRA que distingue temporada. Úsala al disparo diario o si Alberto pide "mide el mercado de verdad" / "refresca los comparables por fecha". Sin secretos: solo nombres de variable.
---

# Mercado real por fecha — rutina de Booking (SIVRA)

**Qué haces:** pides al servidor QUÉ hay que medir —ventanas de MERCADO (fecha × aforo) y ventanas
de NUESTRO PROPIO ESCAPARATE—, las consultas UNA A UNA con el conector de **Booking.com**, lo
escribes por el raíl HTTP y dejas huella del latido. Nada más. No decides precios, no tocas Smoobu,
no llamas a la IA.

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
  🆕 **Pero SÍ mándalo en `apartments` igualmente.** El endpoint lo saca del corpus de comparables y
  lo guarda aparte, en `pricing_escaparate`. Ojo: eso es el aprovechamiento OPORTUNISTA de cuando
  aparece solo; la medición de verdad la pides tú en el **paso 2-bis**, que es obligatorio.
  ⚠️ **No confundas con la competencia de la misma calle:** dos de nuestros pisos están en Bustos
  Tavera y ahí hay comparables legítimos ajenos («Monkeys Apartments Casa Palacio Bustos Tavera»,
  «Bustos Tavera Suite»). Se descarta por el NOMBRE del anuncio, nunca por la calle.
- **🚨 SI NO CORRES, UN PISO SE QUEDA SIN PRECIO. Medido el 22/08/2026.** Esta rutina no es un
  «nice to have» que enriquece el corpus: es la ÚNICA fuente fiable de la pasada que el motor elige
  cada día. Ese día no entregaste (0 filas `booking_mcp` frente a las 237-239 de los tres días
  anteriores), el barrido barato sí corrió, y el motor —que cogía la pasada más RECIENTE sin más
  condición— se quedó con 22 comparables de Serper de los que **uno solo** sobrevivía al filtro de
  €/plaza. Por debajo del mínimo de 5, `pricing/apply` saltó **House Sevillana entera**: cero filas
  en `pricing_applied` en todo el día, en el piso que más factura, justo el día en que su canal
  acababa de corregirse. Cuanto más grande es el piso, más fácil le pasa (su umbral de €/plaza es el
  más alto: 12 plazas × 12€ = 144€, contra los 24-60€ de los otros tres).
  **Ya hay red** desde el PR #1594: el motor elige la última pasada que deje ≥5 comparables
  plausibles, así que un día tuyo en blanco cae al corpus de ayer en vez de dejar el piso mudo. Pero
  la red tiene un límite duro: **`MAX_MARKET_AGE_DAYS = 7`**. Dos o tres días sin entregar se
  aguantan; una semana deja al motor sin mercado y esta vez la red no lo tapa.
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
GET {PLATAFORMA_URL}/api/sivra/mercado/plan?max=24
Authorization: Bearer {ALERTA_TOKEN}
```
Devuelve `{ventanas:[{checkin, checkout, aforo, pisos[], motivo, etiqueta, ronda, diasSinMedir,
comps}], escaparate:[…], escaparate_huecos:[…], plan_total, filtro, candidatas, recortadas, pedidas,
sin_medir_nunca, avisos}` **ya ordenado por urgencia** (lo nunca medido primero, luego lo más viejo). No reordenes ni elijas tú: el orden
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

### 2-bis. Mide NUESTRO propio escaparate (bloque `escaparate` del plan) — OBLIGATORIO

**Por qué (19/08/2026).** El motor tarifica midiendo el precio GUEST del mercado y convirtiéndolo a
precio BASE de Smoobu. Esa conversión era un **×1,20 supuesto que nadie había medido**, y al mirar el
portal resultó que ni el número ni el MODELO: el canal multiplica por **menos de 1** (~0,9) y encima
**suma una cuota fija por estancia** (la limpieza: 598€ en House). Con esos parámetros equivocados el
motor pedía ~230€ menos de base en las noches caras de Navidad. Hasta hoy esto se medía por
casualidad —si el piso propio salía en una búsqueda de comparables—; ahora se pide explícitamente.

Por cada entrada de `escaparate` (`{property_id, nombre_portal, checkin, checkout, noches, guests,
base_total, motivo}`):
- búsqueda con **`hotel_names: ["<nombre_portal>"]`** (NO `destination` ni `coordinates`: son
  mutuamente excluyentes con `hotel_names`), `checkin_date`/`checkout_date` de la entrada,
  `number_of_adults` = `guests`, `currency: EUR`, `user_country_code: es`.
- del resultado quédate con `price.book`, que es el **TOTAL de la ventana**.
- escríbelo con el MISMO `POST /api/sivra/mercado/ingest` del paso 3, con `scenario` = el
  `property_id` de la entrada, las fechas de la entrada y **un solo** `apartments[]` con el nombre
  devuelto por el portal, `price_total = price.book` y `price_night = round(price.book / noches)`. El endpoint lo reconoce como propio, no lo
  mete en `market_rates` y le calcula ÉL la base de Smoobu de esas noches.

🚨 **No cambies las fechas ni las noches que te da el plan.** Están elegidas para que las ventanas
tengan RECORRIDO de precio entre sí: si todas cuestan lo mismo, el multiplicador y la cuota fija son
matemáticamente indistinguibles y el ajuste responde `indeterminado` — mediste y no sirvió de nada.
🚨 **El aforo lo manda el plan** (es el máximo del piso, el mismo con el que se miden sus
comparables). Con un aforo menor mides el recargo por persona, no el canal.
🚨 Si una entrada no devuelve nada (fechas no disponibles, piso ocupado), **cuéntala como
`escaparateSinRespuesta` y sigue**: es un hueco, no un «el canal cuadra».
Arrastra `escaparate_huecos` al parte tal cual: ahí sale, por ejemplo, un piso cuyo nombre de portal
no conocemos (`lib/sivra/mercado-propios.ts::NOMBRE_PORTAL`) — eso hay que arreglarlo a mano.

Quien usa esto es el cron `/api/sivra/pricing/canal` (07:45 UTC), que ajusta la recta y **reescribe
él solo** `channel_markup` + `cuota_fija` del piso, acotado a ±15% de efecto por pasada. Tú no
calculas nada de eso: solo mides.

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
respuesta. El `detalle` dice, en este orden: comps escritos y ventanas medidas · **ventanas de
escaparate propio medidas / pedidas** · ⚠️ ventanas sin respuesta del conector · sin precio
utilizable · 🪞 anuncios propios descartados · fallos. Ejemplo: `«38 comps reales en 12 ventanas ·
📐 4/4 ventanas de escaparate · ⚠️ 2 ventanas sin respuesta del conector (NO es «no hay mercado»:
no se ha podido mirar)»`.
🚨 **Un escaparate sin medir NO puede quedar fuera del parte:** si el plan pedía ventanas propias y
no mediste ninguna, el latido va `ok:false` aunque los comparables fueran bien — sin escaparate, el
motor sigue convirtiendo mercado→base con parámetros viejos, y eso mueve TODAS las fechas.
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

- **Las ventanas de escaparate van APARTE del tope de mercado** (`ESCAPARATE_POR_PISO`, hoy 2 por
  piso y pasada, ~8 consultas). Son baratas y son la mitad del sistema: mídelas siempre, aunque
  tengas que recortar mercado.
- **24 ventanas por pasada** (subido de 12 el 17/08/2026 con OK de Alberto: el plan creció a ~464
  ventanas con las rondas de profundidad y a 12/día tardaba ~5 semanas — el objetivo es acumular
  3 fechas/mes por piso cuanto antes para poder retirar el sweep de Serper, cuyo corpus sin fecha
  metía además precios de habitación como si fueran pisos enteros). El techo duro del endpoint es
  30. La cobertura se ACUMULA (el motor mira 120 días atrás). **Si la sesión se te queda sin
  contexto a mitad, NO pasa nada: los comps ya escritos quedan (el ingest es idempotente) — manda
  el latido con lo que llevas y que la pasada de mañana siga; en el parte di hasta dónde llegaste.**
- Cada respuesta del conector es grande: no la pegues entera en el informe, solo los campos que usas.
- El bucket mensual del motor exige **≥3 fechas distintas del mes**, así que un mes no queda
  «cubierto» hasta la 3ª pasada. Hasta entonces sus comps solo alimentan el bucket por fecha exacta.

## Envs de la rutina
`PLATAFORMA_URL` + `ALERTA_TOKEN`. Conector requerido: **Booking.com**. (Supabase solo si quieres
consultar algo extra; el circuito normal no lo necesita.)
