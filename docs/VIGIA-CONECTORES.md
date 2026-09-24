# Vigía de conectores MCP — estado

> Estado entre pasadas de `conectores-vigia` (mensual, día 5). El contenedor es efímero:
> lo que no está aquí, no existe para la próxima pasada.
>
> **Regla dura:** ningún veredicto se anota sin una llamada real al endpoint. La ficha de un
> conector describe lo que el producto hace, no lo que NUESTRO tier deja hacer. Sin evidencia,
> la fila no se escribe.

## Última pasada

**05/09/2026** — primera pasada real de la rutina programada. Ver hallazgos abajo.

## Veredictos

| Conector | Estado | Evidencia | Fecha |
|---|---|---|---|
| Alpha Vantage | **Conectado. Útil SOLO por `LISTING_STATUS`.** | `LISTING_STATUS` ✅ gratis (8.491 deslistadas con `ipoDate`/`delistingDate`) → cierra el sesgo de supervivencia, sin equivalente propio. `EARNINGS_CALENDAR` ✅ gratis (ISRG → `reportDate 2026-10-20`, est. 2,63 USD) pero **NO USAR**: `lib/trading/earnings-yahoo.ts` ya lo cubre desde el 05/08, da además `confirmada` y corre server-side; meterlo sería redundante, peor y gastaría cuota compartida. `TIME_SERIES_DAILY_ADJUSTED` ❌ *"this is a premium endpoint"* → NO cierra H1. | 21/08/2026 |
| Datos financieros | **Conectado y CON SALDO** (recargado 21/08/2026, ~20 US$/1.000 peticiones). Screener saneado en uso: `screenerMercado.ts` (module-trading, PR #1579, 11 tests) traduce a `MetricasFactor`, anula el ROIC increíble en vez de recortarlo y anula yields fuera de USD. Corre en sesión Claude, no en Vercel. | Saldo recargado por Alberto el 21/08; `screenerMercado.ts` ya integrado y testeado (PR #1579, 22/08). Insiders/13F/fundamentales siguen cubiertos por piezas propias: `/api/trading/insiders` (Form 4), `/api/trading/gurus` (Dataroma), `/api/trading/fundamentales` (SEC XBRL). | 22/08/2026 |
| Twelve Data | Descartado | Indicadores técnicos que `@central/module-trading` ya calcula (SMA/EMA/RSI/MACD/ATR/ADX). | 21/08/2026 |
| Bigdata.com | **Descartado por regla de la casa** | Noticias y sentimiento. Las noticias son CONTEXTO y jamás entran al modelo. | 21/08/2026 |
| Webull | Descartado | Otro bróker, con herramientas de escritura. Riesgo sin beneficio: IBKR ya cubre el caso. | 21/08/2026 |
| Morningstar · MSCI · Moody's | Descartados | Enterprise de pago; ninguna hipótesis firmada los usa. | 21/08/2026 |
| D&B Finance · Datarails | Descartados | No son bolsa (crédito corporativo y FP&A). | 21/08/2026 |

> ⚠️ **23/08/2026 — `type: "rate_limit"` de Alpha Vantage NO significa «cuota agotada».** Es un cajón
> de sastre para «llamada rechazada»; el motivo real vive en `message`. Comprobado con dos llamadas
> seguidas el mismo día:
>
> | Llamada | Respuesta |
> |---|---|
> | `TIME_SERIES_DAILY_ADJUSTED` (IBM) | `type: "rate_limit"` · *"This is a premium endpoint"* |
> | `GLOBAL_QUOTE` (IBM) | datos reales (235,68 USD, cierre del 21/08) |
>
> Si la cuota estuviera agotada, la segunda habría fallado también. Es decir: **el mismo `type`
> tapa una avería PERMANENTE (endpoint de pago) y una TRANSITORIA (cuota gastada)**, y son
> decisiones opuestas — una se arregla mañana sola, la otra no se arregla nunca. El canario debe
> leer `message`, nunca `type`.
>
> De aquí salió el «~25/día»: se leyó el gate premium del 21/08 como si fuera la cuota tocando techo.

## Cuotas (recurso COMPARTIDO — quien la gasta se la quita a otro)

| Conector | Cuota | Quién la consume | Notas |
|---|---|---|---|
| Alpha Vantage | **No se sabe, y no se puede saber desde la API.** El «~25/día» que puso aquí la primera pasada era una LECTURA MAL HECHA del `type: "rate_limit"` del gate premium (ver nota abajo, 23/08). Averiguar el número real exige agotar la cuota, que es justo lo que no se puede hacer con un recurso compartido. **Única fuente: el panel de la cuenta de Alberto.** Lo comprobado el 23/08 es que el 21/08 **quedaba** cuota, no cuánta. | `conectores-vigia` (canarios, 1/mes). **`trading-analista` NO lo usa** — su calendario de earnings es propio. | `EARNINGS_CALENDAR` se pide UNA vez SIN `symbol` (devuelve el calendario entero) y se filtra en local. Símbolo a símbolo revienta la cuota con una watchlist de 15. |
| Datos financieros | Saldo agotado (`$0.00`) | nadie | Recargar solo si se decide desbloquear H2 (~20 US$). |

## Mapa rutina → endpoint del que depende (lo recorre el paso canario)

| Rutina | Conector | Endpoint | Si muere… |
|---|---|---|---|
| `mercado-booking` | Booking.com | `accommodations_search` | `market_rates` deja de distinguir temporada y el pricing decide con comparables viejos. |
| `trading-analista` | IBKR | `get_price_history`, `get_price_snapshot`, `get_account_summary` | La pasada nocturna no puede puntuar nada. |
| `trading-analista` | *(ninguno — pieza propia)* | `lib/trading/earnings-yahoo.ts` → Yahoo `quoteSummary` | La guarda `earningsInminente` deja de vetar **en silencio**. Es best-effort y devuelve `null` al fallar, así que el canario debe mirarlo: `estadoEarnings()` marca esos símbolos como `desconocido` y la pasada los canta. |

## Higiene de los conectados

> ⚠️ Alcance real: `ListConnectors` solo ve el estado A NIVEL DE CUENTA (`installState`), no qué
> conectores lleva adjuntos cada rutina — eso solo se verifica abriendo la rutina en la UI (ver
> `docs/RUTINAS-PROGRAMADAS.md`). Esta tabla es higiene de cuenta, no auditoría por rutina.

| Conector | `installState` | Uso real (evidencia en el repo) | Acción |
|---|---|---|---|
| **Expedia** | `needs_reconnect` (roto, sin re-auth) | **SÍ** — `pricing-agente` lo usa como 2ª fuente de mercado (`mcp__Expedia__search_hotels`, `ciclo.md` Paso 2) y como única fuente de demanda por vuelos (`mcp__Expedia__search_flights`, Fase 3 opcional). Diseño resiliente («triangula 2-3 OTAs: si una falla, las otras cubren»), así que no rompe el ciclo, pero lo deja triangulando con 1 fuente menos y sin la señal de vuelos, en silencio. | Reconectar (requiere OAuth de Alberto). |
| Google Cloud BigQuery | `needs_reconnect` | No se encontró uso en skills/docs. | Ninguna (no urgente). |
| Linear | `needs_reconnect` | No se encontró uso en skills/docs. | Ninguna (no urgente). |
| Stripe (conector MCP) | `needs_reconnect` | El repo integra Stripe por API propia (`core-email`/ia-rest), no por este conector MCP — sin evidencia de que ningún agente lo llame. | Ninguna (no urgente). |
| higgsfield, Otto Travel, PayPal, Windsor.ai | `unknown` | Sin uso encontrado. | Ninguna. |
| Morningstar, MSCI | `unknown` | Ya descartados (ver tabla de veredictos arriba). | Ninguna. |
| HubSpot, Resend, PDF Viewer | `connected` pero sin uso encontrado | Resend consta EXPLÍCITAMENTE retirado como adjunto de serie de `mercado-booking`/`pricing-agente` (`docs/RUTINAS-PROGRAMADAS.md`). | Candidatos a desconectar si Alberto no les ve uso futuro (no se actúa sin su OK). |
| Tripadvisor, Trivago, lastminute.com | `connected` | **SÍ** — `pricing-agente` (3ª fuente / fallback si Booking o Expedia fallan). | Ninguna. |
| Wyndham, DirectBooker | `connected` | Sin uso encontrado (cadenas hoteleras; SIVRA es host, no agregador). | Candidatos a desconectar (no se actúa sin su OK). |
| Booking.com, IBKR, Alpha Vantage, Datos financieros, Adobe, Gmail, Google Drive, Supabase (×3), openrouter, Vercel | `connected` | En uso confirmado por otras rutinas/skills. | Ninguna. |

## Bitácora de hallazgos

- **05/09/2026 — confirmado (ya no «probablemente»): esta rutina corre sin NINGÚN conector
  adjunto.** `SearchMcpRegistry`/`ListConnectors` respondieron con normalidad (son nativas del
  harness), pero una búsqueda de las herramientas `mcp__ibkr__*` / `mcp__booking__*` por nombre no
  encontró nada, y `ListConnectors` devolvió `enabledInChat: false` en los ~30 conectores de la
  cuenta sin excepción. **Consecuencia estructural: el Paso 3 (canario con llamada real a
  Booking/IBKR/Alpha Vantage/Datos financieros) es IMPOSIBLE de ejecutar desde esta sesión tal como
  está configurada hoy.** No es un fallo de esta pasada — es el diseño de mínimo alcance funcionando
  como se pretendía —, pero deja el paso más valioso del skill (el canario) sin ejecutar mes a mes.
  Alberto decide si vale la pena adjuntar Booking.com + IBKR de solo lectura a esta rutina para
  poder cumplir el Paso 3, asumiendo el coste de superficie.
- **05/09/2026 — Expedia en `needs_reconnect`.** Ver fila de higiene arriba. `pricing-agente` sigue
  operando (diseño resiliente) pero con una fuente de mercado menos y sin demanda por vuelos.
