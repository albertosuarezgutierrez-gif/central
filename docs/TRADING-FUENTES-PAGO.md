# Fuentes de datos de PAGO para el trading — veredicto 15/08/2026

> Pregunta de Alberto: *«dime qué fuentes de pago añadirías; si añadimos esas fuentes, ¿se podría
> reducir el tiempo en operar en real?»*. Este doc cierra las dos preguntas por escrito, en la línea
> de `INVERSION-VEREDICTO-2026-08.md`: primero la respuesta honesta, luego el ranking por si se
> contrata algo. La decisión marco sigue siendo la firmada en la skill (`infra-forward-radar.md`):
> **datos de pago APLAZADOS, fuera del camino crítico** — este doc la detalla, no la revoca.

> ⚠️ **OBSOLETO EN UN PUNTO (corregido el 21/08/2026).** Este doc dice que el calendario de
> earnings fiable es «el único hueco de datos con coste DIRECTO en dinero real» y lo pone como
> gasto a activar al abrir el Tramo 1. **Ya no lo es: llevaba diez días cerrado cuando se escribió.**
> `apps/plataforma/lib/trading/earnings-yahoo.ts` (05/08/2026) da la fecha del próximo informe —y
> además si está `confirmada` por la empresa o solo estimada— gratis y server-side, para todas las
> rutas y no solo la sesión Claude. La fila 2 del ranking de abajo queda reducida al screener.
> El resto del veredicto (§1: los datos de pago NO acortan el camino) sigue vigente y es lo
> importante.

## 1. Respuesta directa: NO, las fuentes de pago no acortan el camino al dinero real

El reloj que abre los tramos **no es de datos, es de tiempo fuera de muestra**:

- **Tramo 1 (1.000€) ya está disponible HOY** — su único requisito es una señal viva del agente en
  el momento de comprar. Ninguna fuente de pago lo adelanta porque no hay nada que adelantar.
- **Tramo 2 exige que la cesta más vieja cumpla ≥120 días batiendo por mediana; Tramo 3, ≥180 días
  con 3 cestas.** Son días de calendario viviendo hacia delante, la única prueba sin look-ahead.
  Un dato mejor no hace pasar el tiempo más rápido: comprar datos no compra meses de forward.
- La regla firmada el 05/08 lo dice explícitamente: **«la escalera la suben las señales, no el
  calendario»** — y tampoco la sube la factura de datos. La única forma de «acelerar» sería rebajar
  las puertas, que es exactamente el autoengaño que el pre-registro existe para impedir.

Lo que una fuente de pago SÍ compra es **calidad y robustez de la medición**: menos incidentes de
precios (CVX 590$, series barajadas), un retrovisor sin sesgo de supervivencia, una guarda de
earnings que no degrade. Eso hace **más fiable** el veredicto de los tramos; no lo adelanta.

## 2. Ranking, si se decide contratar algo (por utilidad real para ESTE sistema)

| # | Fuente | Coste aprox.* | Qué resuelve de lo ya declarado como debilidad |
|---|---|---|---|
| 1 | **EODHD** (all-in-one) | ~50-80 US$/mes | Las TRES a la vez: 3er fallback de precios (Stooq→Yahoo→EODHD, ya previsto en la skill) · cierres **ajustados por splits y dividendos** (la guarda `serieDiscontinua` caza lo imposible, no lo erróneo, y a 15 años hay muchos splits) · **histórico de DESLISTADAS** (el sesgo de supervivencia del retrovisor, declarado severo a 15 años) · calendario de earnings y fundamentales de respaldo. |
| 2 | **FMP de pago** (tier básico) | ~20-30 US$/mes | ~~El único hueco de datos con coste DIRECTO en dinero real: la guarda `earningsInminente`…~~ **Corregido 21/08/2026: la fecha de earnings ya la da `lib/trading/earnings-yahoo.ts` gratis desde el 05/08, con el flag `confirmada` que FMP no da.** De esta fila queda vivo SOLO el screener (`/stable/company-screener`) para la cantera → hueco H2 de `docs/HUECOS-ABIERTOS.md`. |
| 3 | **Norgate Data** | ~30-40 US$/mes | El patrón oro de survivorship-free para EEUU (solo retrovisor). Prioridad baja: está firmado que **ningún tramo de capital se mueve con datos del retrovisor**, así que mejora un instrumento que no decide dinero. |
| 4 | **Suscripciones de datos de mercado de IBKR** | pocos US$/mes | Imprescindibles al abrir el Tramo 1 de todas formas (datos en vivo consolidados para ejecutar las órdenes a mano). No son «investigación»: son fontanería de la ejecución real. |

\* Precios orientativos al 15/08/2026, a verificar en el momento de contratar.

**Lo que NO se contrata:** feeds de noticias/sentimiento (las noticias son CONTEXTO por regla de la
casa y jamás entran al modelo — pagar por más contexto es pagar por más ruido) y cualquier dato
alternativo (satélites, tarjetas…) — este sistema no tiene ninguna hipótesis firmada que los use.

## 3. Recomendación operativa (compatible con la decisión APLAZADA)

1. **Hoy: nada.** Stooq+Yahoo cubren el forward; los incidentes de precios ya tienen guardias
   (×2, contraste, diferido, huérfanas) y el trabajo pendiente declarado es validar la fuente
   contra IBKR, que es gratis.
2. **Al abrir el Tramo 1 (decisión de Alberto):** ~~activar el calendario de earnings fiable~~
   **(ya cubierto gratis desde el 05/08 por `lib/trading/earnings-yahoo.ts` — corregido 21/08/2026)**
   + las suscripciones de datos de mercado de IBKR, que sí siguen haciendo falta: son fontanería de
   la ejecución real, no investigación.
3. **Si Stooq y Yahoo caen a la vez** (condición ya firmada en la skill): EODHD como 3er fallback.
4. **Norgate/limpieza del retrovisor:** solo si algún día una hipótesis firmada necesita el nivel
   absoluto de retorno histórico (hoy ninguna lo usa — está declarado que el nivel absoluto del
   retrovisor «no se usa para nada»).

## 4. Dónde está de verdad la palanca de tiempo

Si la pregunta de fondo es «¿cómo llego antes a que esto dé dinero?», la respuesta medida no está
en los datos de bolsa: `INVERSION-VEREDICTO-2026-08.md` §5 — la comisión de Booking (19,72%, ~25.000€/año)
y las reservas directas (todo construido, 0€ en 2026). Esa palanca no tiene reloj de forward: se
puede accionar hoy y rinde sin riesgo de mercado. El forward paper, mientras tanto, sigue su curso
al ritmo que tiene que seguir.
