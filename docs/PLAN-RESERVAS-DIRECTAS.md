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

## 1. El diagnóstico que cambia el plan

**Los 0 € de directo no son un problema de marketing: no existe ningún sitio donde reservar.**
Comprobado en el código, no supuesto:

- `apps/sivra/app/[locale]/page.tsx` — la home pública **redirige a `/dashboard`**. La app es una
  intranet (dashboard, limpiadoras, admin), no una web de cara al huésped.
- `apps/sivra/app/sitemap.ts` lo dice literalmente: *«las páginas /la-casa, /ubicacion, /precios y
  /contacto **no existen**, así que no se anuncian en el sitemap»*.
- `apps/sivra/app/robots.ts` y `sitemap.ts` siguen con `SITE_URL = "https://housesevillana.vercel.app"`
  y el aviso *«⚠️ CAMBIA esta URL cuando registres el dominio definitivo»*. **El dominio ni está puesto.**

Consecuencia: la skill `seo-house-sevillana` está optimizando una página que no existe. **Primero se
construye el canal; optimizarlo viene después.**

Lo que sí está listo y operativo:
- **Smoobu conectado y sincronizando** (`pms_connections`: `smoobu_api`, activa, 4 apartamentos,
  último sync 12/08/2026 08:51 UTC, sin errores).
- El `pricing-agente` y `market_rates` funcionando.
- 1.956 huéspedes históricos en `incomes` — una base de contactos que nunca se ha trabajado.

---

## 2. Fase 0 — Encender el canal (esta semana, ~0 € de desarrollo)

**Usar el motor de reservas de Smoobu, no construir uno.** Smoobu incluye *booking engine* y
creador de web en sus planes, ya tiene los 4 apartamentos sincronizados y comparte calendario con
Booking (sin riesgo de overbooking). Comisión de canal: **0%**.

1. Activar el Booking Engine + la web de Smoobu con los 4 apartamentos. *(Confirmar qué plan tienes
   contratado: el motor entra en los planes de pago, no en el gratuito.)*
2. **Registrar `housesevillana.es`** y apuntarlo ahí. Hoy no está registrado.
3. Pasarela de cobro en el motor (Stripe) para cobrar por adelantado — es lo que sustituye la
   «garantía» de Booking en el canal directo.
4. Actualizar `SITE_URL` en `app/robots.ts` y `app/sitemap.ts` de `sivra` al dominio real.
5. **Google Business Profile** de cada apartamento, con enlace a la web. Gratis, y es la mitad del
   efecto billboard.

**Criterio de salida de la fase:** existe una URL donde un huésped puede ver fechas, precio y pagar.

## 3. Fase 1 — Capturar al huésped que ya viene (semanas 1–4)

Esta es la fase con mejor retorno por esfuerzo: no hay que atraer demanda nueva, solo dejar de
pagar comisión por la que ya entra.

1. **Tarjeta física + QR en cada piso**: «La próxima vez, reserva directo: −10% y check‑in flexible».
2. **Mensaje post‑checkout** (24–48 h después) por el canal por el que ya hablas con el huésped.
3. **Captar el email in situ** — portal WiFi, check‑in digital o WhatsApp. ⚠️ **Booking no te da el
   email real del huésped**: da un alias `@guest.booking.com` que caduca. La lista propia se
   construye en la casa, no descargándola de Booking.
4. **Registrar el origen**: `incomes.portal` ya tiene el valor `DIRECTO`. Es la métrica del plan.

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
3. **Google Hotel Ads / metabuscadores**, si el motor de Smoobu lo soporta con el plan contratado.

---

## 6. Objetivo, métrica y valor

| Directo sobre facturación | Ahorro anual | Equivale, sobre los 32.420 € de la cuenta, a… |
|---|---|---|
| 10% | ≈ 2.500 € | **+7,7% anual** |
| **20% (meta año 1)** | **≈ 5.000 €** | **+15,4% anual** — por encima del índice |
| 30% | ≈ 7.500 € | **+23,1% anual**, recurrente y sin riesgo de mercado |

**Métrica única:** `select portal, sum(amount) from incomes group by portal` — el % que representa
`DIRECTO`. Hoy es 0. Revisión mensual, en la misma pasada que ya hace el resumen semanal.

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

- **Qué plan de Smoobu está contratado** y si su motor de reservas está incluido. Es el supuesto que
  sostiene la Fase 0; si no lo estuviera, habría que valorar un motor propio (semanas de trabajo, no
  días) o subir de plan.
- **Si `housesevillana.es` está libre.** El código sugiere que el dominio nunca se registró, pero no
  se ha consultado el registrador.
- **El texto del contrato vigente con Booking.** El marco legal del DMA es claro; el contrato
  concreto no se ha leído.
