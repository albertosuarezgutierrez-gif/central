# Huecos abiertos — qué nos falta y quién lo necesita

> **Para qué.** Es el catálogo explícito de «esto no lo tenemos». Lo cruza `conectores-vigia`
> (mensual, día 5) contra el registro de conectores MCP: sin este fichero, ese agente no tiene
> contra qué comparar y acabaría haciendo barrido semántico, que es ruido.
>
> **Cómo se mantiene.** A mano cuando una sesión detecta un hueco, y por `/auditoria-diaria`
> (carril 1, se auto-aplica a `main`). Si solo se llenara a mano nacería completo hoy y estaría
> viejo en dos meses — y entonces el vigía callaría por la razón equivocada: no porque no haya
> nada, sino porque no sabe lo que falta.
>
> **Regla de entrada.** Un hueco solo entra con su fuente citada (fichero + por qué). Un hueco
> sin fuente es una opinión, y el vigía acabaría persiguiendo fantasmas.
>
> **Regla de salida.** Cuando un hueco se cierra, se borra su fila de «vivos» y se anota abajo
> con qué se cerró — y en `docs/VIGIA-CONECTORES.md` con la evidencia de la llamada.

## Huecos vivos

| # | Hueco | Vertical | Fuente | Por qué importa |
|---|---|---|---|---|
| H1 | Cierres ajustados por splits y dividendos (3er fallback de precios, tras Stooq y Yahoo) | trading | `docs/TRADING-FUENTES-PAGO.md` §2 | A 15 años hay muchos splits. La guarda `serieDiscontinua` caza lo imposible, no lo erróneo. **Alpha Vantage NO lo cierra**: `TIME_SERIES_DAILY_ADJUSTED` es premium (verificado 21/08/2026). Candidato: EODHD (~50-80 US$/mes). |
| H2 | Screener de acciones para la cantera | trading | `docs/TRADING-FUENTES-PAGO.md` §2 | El plan Free de FMP no da `/stable/company-screener`. `Datos financieros` tiene `screen_stocks` pero esa cuenta está a `$0.00`. Coste de desbloqueo: ~20 US$. |
| H3 | Datos de mercado en vivo de IBKR | trading | `docs/TRADING-FUENTES-PAGO.md` §2 | No es investigación, es fontanería de la ejecución: imprescindibles al abrir el Tramo 1 con dinero real. Pocos US$/mes. |

## Huecos cerrados (histórico corto)

| Hueco | Cerrado con | Fecha |
|---|---|---|
| Fecha de próximos resultados (la guarda `earningsInminente` no podía vetar sin ella) | Alpha Vantage `EARNINGS_CALENDAR`, tier gratis | 21/08/2026 |
| Histórico de deslistadas (sesgo de supervivencia del retrovisor) | Alpha Vantage `LISTING_STATUS`, tier gratis (8.491 filas con `ipoDate`/`delistingDate`) | 21/08/2026 |
