# Plan para subir las reservas directas — SIVRA / House Sevillana (12/08/2026)

> Contexto: `docs/INVERSION-VEREDICTO-2026-08.md` midió que la comisión de Booking es del
> **19,72% real** y suma **120.635 € en cinco años** (22.504 € solo en 2026 hasta agosto).
> Reservas por canal directo en 2026: **0 €**.

## 0. La objeción primero: «es imposible y da garantías»

La segunda mitad es cierta y el plan no la discute. **El objetivo no es saltarse a Booking.**
Booking es una fuerza de ventas que trae 154 reservas al año, cobra por adelantado, filtra
no‑shows y llena los huecos de última hora. Ese 19,72% es un **coste de adquisición**, y para
un huésped que no te conocía de nada está bien pagado.

Lo que no está bien pagado es la comisión sobre:
- el huésped que **ya ha estado** en la casa,
- y el que te ve en Booking y luego **busca tu nombre en Google** antes de reservar (el
  «efecto billboard»), y hoy no encuentra nada.

Objetivo realista: **20–30% de la facturación por canal directo**. No el 100%. Booking se queda,
con el mismo inventario y la misma disponibilidad.

---

## 1. El diagnóstico — corregido el 12/08/2026

> ⚠️ **Corrección.** La primera versión de este documento afirmaba que «no existe ningún sitio donde
> reservar». **Era falso.** Se comprobó `apps/sivra` y se extrapoló a todo el negocio, que es
> exactamente lo que prohíbe la regla *«dato que NO hay ≠ dato que NO se ha mirado»* del `CLAUDE.md`.
> Lo que sigue es el diagnóstico real.

**La web existe, está viva y está construida para el punto que más renta.** No vive en este monorepo:
está en el repo **`albertosuarezgutierrez-gif/house-sevillana-landing`** (`app/route.ts`, runtime edge),
y `apps/sivra/lib/seo-landing.ts:5` es el puente — el agente SEO la reescribe por la GitHub Contents API.
Último commit automático: `chore(seo): actualización automática [2026-08-10]`. Páginas: `/`, `/barrio`,
`/que-ver`, `/sitemap.xml`.

Y **ya tiene canal directo**, no hay que construirlo:
- Motor de reservas propio en **`reservas.house-sevillana.com`** («📅 Comprobar disponibilidad»).
- **WhatsApp pre-rellenado para grupos**: `wa.me/34637349990?text=…me interesa House Sevillana para un grupo`.
- Teléfono (3 veces en la página), email, y enlaces a Booking y Airbnb.

**El posicionamiento entero es el de grupos grandes:** «6 dormitorios dobles», «hasta 12 personas»,
«ideal para grupos y familias», «Reserva directa sin comisiones». La hipótesis de «grupos grandes» no
era una idea nueva que proponer — **ya está ejecutada**.

### Lo que de verdad falla

**1. La atribución miente, y por eso el negocio parecía peor de lo que es.** «Directo = 0 € en 2026» era
un artefacto de la etiqueta: las reservas directas de 2026 están en `incomes` como **`portal='OTRO'`**,
y su firma es inequívoca — **comisión 0,00%** (`amount = amount_gross`). Entre ellas,
**1.383,24 € por 2 noches** (nov-2026), unos 691 €/noche: el perfil exacto del grupo grande que la
landing persigue. Consistente con una reserva directa, aunque el origen concreto no está registrado.
Sin arreglar la etiqueta, cualquier medición de este plan es ruido.

**2. El motor de reservas está enterrado.** El único enlace a `reservas.house-sevillana.com` es el
**tercero de una fila de tres, al final del `<body>`**, a 13 px y con el mismo peso visual que «🗺️ Qué
ver en Sevilla» y «🏘️ El barrio de la Macarena». El CTA repetido de la página (7 veces) es `#reserva`,
un **ancla interna**. La página empuja al visitante a leer sobre Sevilla, no a comprobar disponibilidad.

Lo demás que sí está operativo: **Smoobu** conectado y sincronizando (`pms_connections`: `smoobu_api`,
activa, 4 apartamentos, último sync 12/08/2026 08:51 UTC, sin errores), el `pricing-agente` con
`market_rates`, y 1.956 huéspedes históricos en `incomes`.

---

## 2. Fase 0 — Medir y desenterrar lo que ya existe (esta semana, ~0 € de desarrollo)

No hay que encender ningún canal: hay que **poder verlo** y **dejar de esconderlo**.

1. **Arreglar la atribución antes que nada.** Reclasificar a `DIRECTO` las filas `OTRO` con comisión
   0,00%, y separar el origen (motor / WhatsApp / teléfono) para saber cuál de los tres convierte.
   Sin esto no se puede afirmar nada sobre el canal — ni bueno ni malo.
2. **Subir el motor de reservas al primer scroll**, como CTA primario y con peso visual propio; que
   `#reserva` lleve al motor y no a un ancla. Es el cambio de mayor retorno por esfuerzo del plan.
3. **Cobro por adelantado** (Stripe) en el motor — es lo que sustituye la «garantía» de Booking.
4. **Google Business Profile** de cada apartamento enlazando a la web: gratis, y es la mitad del
   efecto billboard.
5. Actualizar `SITE_URL` en `apps/sivra/app/robots.ts` y `sitemap.ts`, que siguen apuntando a
   `housesevillana.vercel.app` — resto de la app-intranet, sin efecto sobre la landing real.

**Criterio de salida:** el cuadro de mando distingue las tres vías de directo, y un visitante llega al
motor de reservas sin hacer scroll hasta el pie.

## 3. Fase 1 — Capturar al huésped que ya viene (semanas 1–4)

Esta es la fase con mejor retorno por esfuerzo: no hay que atraer demanda nueva, solo dejar de
pagar comisión por la que ya entra.

1. **Tarjeta física + QR en cada piso**: «La próxima vez, reserva directo: −10% y check‑in flexible».
2. **Mensaje post‑checkout** (24–48 h después) por el canal por el que ya hablas con el huésped.
3. **Captar el email in situ** — portal WiFi, check‑in digital o WhatsApp. ⚠️ **Booking no te da el
   email real del huésped**: da un alias `@guest.booking.com` que caduca. La lista propia se
   construye en la casa, no descargándola de Booking.
4. **Registrar el origen**: `incomes.portal` ya tiene el valor `DIRECTO`, pero hoy el directo real
   cae en `OTRO` — ver Fase 0, punto 1. Sin esa corrección, esta fase no se puede evaluar.

**Expectativa honesta:** de 1.956 huéspedes históricos solo **21 han repetido (1,1%)**. En turismo
urbano de ciudad la repetición es baja por naturaleza — el grueso del retorno de este plan **no**
está en la fidelidad, está en la Fase 2 y en el efecto billboard.

## 4. Fase 2 — Precio (mes 2–3) · la palanca más potente

**Ya es legal ser más barato en tu propia web.** Booking fue designada *gatekeeper* del Reglamento
de Mercados Digitales (DMA) y **renunció a todas las cláusulas de paridad —amplias y estrechas—
para el inventario del EEE el 2 de diciembre de 2024**, bajo el artículo 5(3). Además, **no puede
subirte la comisión ni despriorizar tus anuncios** por ofrecer otro precio en otro canal.

1. Precio directo **−10%** frente a Booking. Aritmética: por cada 100 € de tarifa, Booking te deja
   80,28 € netos; directo a 90 € te deja 90 €. **+9,7 puntos de margen** aunque el huésped pague menos.
2. Extras solo en directo que no cuestan dinero: check‑in flexible, late checkout sujeto a
   disponibilidad, parking (que ya tienes).
3. **No tocar el precio *en* Booking.** Bajar en tu web no afecta a tu ranking; bajar dentro de
   Booking sí mueve tu posición. Son cosas distintas y conviene no confundirlas.
4. Revisar tu contrato antes de aplicarlo, y guardar por escrito la referencia al DMA por si hay
   fricción con el gestor de cuenta.

## 5. Fase 3 — Captación nueva (mes 3–6)

1. **SEO** — aquí sí entra la skill `seo-house-sevillana`, ya con web en pie: metadatos, JSON‑LD
   (`LodgingBusiness`, `FAQPage`), hreflang ES/EN/FR/DE/IT.
   ⚠️ **Expectativa:** el SEO orgánico tarda 6–12 meses. Con una antelación **mediana de 20 días** y
   un **32% de reservas en la última semana**, no es la palanca que mueve la aguja este año.
2. **Anuncios de marca** — pujar por «House Sevillana» y variantes cuesta céntimos e intercepta al
   usuario del efecto billboard justo antes de que vuelva a Booking. Es la partida de marketing con
   mejor retorno del plan.
3. **Google Hotel Ads / metabuscadores**, si el motor de `reservas.house-sevillana.com` lo soporta.
4. **Grupos grandes — ya es el posicionamiento de la landing, falta cerrarle el circuito.** El
   producto (6 dormitorios dobles, hasta 12 personas, 4 baños, parking) es escaso en el centro de
   Sevilla y de ticket alto: la reserva directa de mayor importe registrada en 2026 son **1.383,24 €
   por 2 noches**. Los grupos negocian por conversación, no por formulario, y el WhatsApp de grupos
   ya existe — lo que no existe es **medir cuántos entran por ahí ni responderlos con un proceso**
   (tarifa de grupo, señal, condiciones). Es la Fase 0 punto 1 aplicada al segmento que más paga.

---

## 6. Objetivo, métrica y valor

| Directo sobre facturación | Ahorro anual | Equivale, sobre los 32.420 € de la cuenta, a… |
|---|---|---|
| 10% | ≈ 2.500 € | **+7,7% anual** |
| **20% (meta año 1)** | **≈ 5.000 €** | **+15,4% anual** — por encima del índice |
| 30% | ≈ 7.500 € | **+23,1% anual**, recurrente y sin riesgo de mercado |

**Métrica única:** `select portal, sum(amount) from incomes group by portal` — el % que representa
`DIRECTO`. Revisión mensual, en la misma pasada que ya hace el resumen semanal.

⚠️ **Esa métrica no es fiable hasta cerrar el punto 1 de la Fase 0.** Hoy marca 0, pero el directo de
2026 está registrado como `OTRO` (comisión 0,00%), así que el 0 mide la etiqueta, no el negocio. La
primera versión de este plan tomó ese 0 al pie de la letra y construyó encima un diagnóstico falso.

## 7. Riesgo de canal (razón número dos para hacer esto)

Booking es el **92%** de la facturación 2026 (91.612 € de 99.636 €). Que un canal se apague no es
teórico en este negocio: **Airbnb pasó de 42.460 € en 2022 a 1.219 € en 2026**. Un cambio de
algoritmo o de comisión en Booking se lleva el negocio por delante. El canal directo, además de
margen, es la única cobertura real frente a eso.

## 8. Riesgos del plan y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Perder posición en Booking | **No se toca el inventario ni la disponibilidad.** Se añade canal, no se resta. |
| Impagos y no‑shows en directo | Cobro anticipado por Stripe + política de cancelación propia. |
| Fricción del gestor de cuenta de Booking | El DMA prohíbe expresamente penalizar por precios distintos en otro canal. |
| Sobreventa entre canales | Smoobu ya es el channel manager: calendario único, es su función. |
| Esperar demasiado del cliente recurrente | Solo 1,1% repite. El plan no se apoya en eso: se apoya en billboard + precio. |

## Lo que NO se ha comprobado

- **Qué software hay detrás de `reservas.house-sevillana.com`** (¿el motor de Smoobu, otro, uno
  propio?), si cobra por adelantado y qué comisión aplica. El proxy de salida de esta sesión bloquea
  el dominio, así que solo se ha visto el enlace desde el HTML de la landing, no el destino.
- **Cuánto tráfico recibe la landing y cuántas reservas origina.** No se ha mirado Search Console ni
  analítica. Que el motor esté enterrado en el pie es un hecho del HTML; que eso cueste reservas es
  una inferencia razonable, no una medición.
- **El origen real de la reserva de 1.383,24 €** etiquetada `OTRO`. La comisión 0,00% y el ticket son
  consistentes con directo, pero el canal concreto no está registrado — que es justo el agujero que
  la Fase 0 viene a tapar.
- **El texto del contrato vigente con Booking.** El marco legal del DMA es claro; el contrato
  concreto no se ha leído.

## Registro de la corrección

La versión original (PR #1387, 12/08/2026) sostenía que no había web pública ni canal directo, y
proponía «encender el canal» con el motor de Smoobu. Alberto lo desmintió en el acto — *«punto 4,
para eso hicimos la web de housesevillana.es»* — y la comprobación le dio la razón: la landing lleva
viva desde antes, se actualiza sola y está construida entera alrededor de los grupos grandes.

La causa del error merece quedar escrita, porque es reincidente: **se comprobó un directorio
(`apps/sivra`) y se afirmó una ausencia global.** El puente al repo real estaba a un grep de
distancia, en `apps/sivra/lib/seo-landing.ts`. La regla del `CLAUDE.md` no dice «comprueba antes de
afirmar», dice algo más exigente — **comprueba en el sitio donde el dato viviría si existiera**, y
cuando la respuesta es «no lo he encontrado», eso es lo que hay que escribir, no «no existe».
