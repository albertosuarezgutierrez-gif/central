# Vigía de conectores MCP — estado

> Estado entre pasadas de `conectores-vigia` (mensual, día 5). El contenedor es efímero:
> lo que no está aquí, no existe para la próxima pasada.
>
> **Regla dura:** ningún veredicto se anota sin una llamada real al endpoint. La ficha de un
> conector describe lo que el producto hace, no lo que NUESTRO tier deja hacer. Sin evidencia,
> la fila no se escribe.

## Última pasada

`—` (sin pasada aún; sembrado a mano el 21/08/2026 con lo verificado esa sesión)

## Veredictos

| Conector | Estado | Evidencia | Fecha |
|---|---|---|---|
| Alpha Vantage | **Conectado. Útil SOLO por `LISTING_STATUS`.** | `LISTING_STATUS` ✅ gratis (8.491 deslistadas con `ipoDate`/`delistingDate`) → cierra el sesgo de supervivencia, sin equivalente propio. `EARNINGS_CALENDAR` ✅ gratis (ISRG → `reportDate 2026-10-20`, est. 2,63 USD) pero **NO USAR**: `lib/trading/earnings-yahoo.ts` ya lo cubre desde el 05/08, da además `confirmada` y corre server-side; meterlo sería redundante, peor y gastaría cuota compartida. `TIME_SERIES_DAILY_ADJUSTED` ❌ *"this is a premium endpoint"* → NO cierra H1. | 21/08/2026 |
| Datos financieros | **Conectado pero SIN SALDO.** No usar sin recargar. | `Your current balance is $0.00`. Sus capacidades ya las cubren piezas propias: `/api/trading/insiders` (Form 4), `/api/trading/gurus` (Dataroma), `/api/trading/fundamentales` (SEC XBRL). | 21/08/2026 |
| Twelve Data | Descartado | Indicadores técnicos que `@central/module-trading` ya calcula (SMA/EMA/RSI/MACD/ATR/ADX). | 21/08/2026 |
| Bigdata.com | **Descartado por regla de la casa** | Noticias y sentimiento. Las noticias son CONTEXTO y jamás entran al modelo. | 21/08/2026 |
| Webull | Descartado | Otro bróker, con herramientas de escritura. Riesgo sin beneficio: IBKR ya cubre el caso. | 21/08/2026 |
| Morningstar · MSCI · Moody's | Descartados | Enterprise de pago; ninguna hipótesis firmada los usa. | 21/08/2026 |
| D&B Finance · Datarails | Descartados | No son bolsa (crédito corporativo y FP&A). | 21/08/2026 |

## Cuotas (recurso COMPARTIDO — quien la gasta se la quita a otro)

| Conector | Cuota | Quién la consume | Notas |
|---|---|---|---|
| Alpha Vantage | ~25 llamadas/día en el tier gratis. **Sin verificar:** el número sale de un `rate_limit` observado el 21/08, no de la factura. | `conectores-vigia` (canarios, 1/mes). **`trading-analista` NO lo usa** — su calendario de earnings es propio. | `EARNINGS_CALENDAR` se pide UNA vez SIN `symbol` (devuelve el calendario entero) y se filtra en local. Símbolo a símbolo revienta la cuota con una watchlist de 15. |
| Datos financieros | Saldo agotado (`$0.00`) | nadie | Recargar solo si se decide desbloquear H2 (~20 US$). |

## Mapa rutina → endpoint del que depende (lo recorre el paso canario)

| Rutina | Conector | Endpoint | Si muere… |
|---|---|---|---|
| `mercado-booking` | Booking.com | `accommodations_search` | `market_rates` deja de distinguir temporada y el pricing decide con comparables viejos. |
| `trading-analista` | IBKR | `get_price_history`, `get_price_snapshot`, `get_account_summary` | La pasada nocturna no puede puntuar nada. |
| `trading-analista` | *(ninguno — pieza propia)* | `lib/trading/earnings-yahoo.ts` → Yahoo `quoteSummary` | La guarda `earningsInminente` deja de vetar **en silencio**. Es best-effort y devuelve `null` al fallar, así que el canario debe mirarlo: `estadoEarnings()` marca esos símbolos como `desconocido` y la pasada los canta. |

## Higiene de los conectados

*(lo rellena la primera pasada — paso 4: sin uso, `installState: unknown`, con herramientas de escritura)*

## Bitácora de hallazgos

*(vacía; una línea por hallazgo, con fecha y URL/evidencia)*
