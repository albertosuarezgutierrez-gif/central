# Post-mortem — NVDA, resultados del 26/08/2026 (libro paper)

> **Por qué existe este documento.** La operación salió BIEN y por eso hay que escribirla. Un acierto
> que no produjo la señal, sumado sin distinguir al track record, es lo que hará creer que el agente
> está listo para dinero real cuando no lo esté. La regla de la casa aplicada a nosotros mismos: el
> resultado no valida el proceso.
>
> **Ámbito: cartera PAPER.** NVDA nunca estuvo en la cuenta real de IBKR. La cuenta real, a 26/08
> 20:16 UTC, tenía exactamente dos posiciones: VWCE (188 títulos) y CVX (6 títulos).

## Los hechos, con sus fuentes

| Dato | Valor | Fuente |
|---|---|---|
| Apertura | 21/08/2026, 27 títulos a 214,72 $ | `trading_paper_posicion` |
| Stop | 203,22 $ (2×ATR14, ATR 5,7507) | `trading_paper_posicion` · `trading_tesis.indicadores` del 21/08 |
| Distancia del stop | −5,36% desde la entrada | calculado |
| Última referencia antes del evento | 209,96 $ (cierre IBKR del 26/08: 209,66 $) | `trading_tesis` del 26/08 · IBKR |
| Situación la víspera | **en pérdida** (−2,2% sobre la entrada), a ~3% del stop | calculado |
| Resultados | 26/08/2026, 8-K presentado a las 16:21 ET (**después del cierre**) | SEC, acc. 0001045810-26-000073 |
| Reacción | +6,79% en la sesión del 27/08 (223,90 $, precio vivo, no cierre) | IBKR |

## Qué decidió el agente

**Nada.** No existe ninguna regla de salida por resultados. La barrera `earningsInminente` solo veta
**abrir** un largo si el evento cae a ≤3 días; una vez dentro, el evento no se vuelve a mirar. La
posición se abrió el 21/08, a 5 días de los resultados — fuera de la ventana por dos días. La
exposición al hueco la produjo el calendario, no un criterio.

Se puede comprobar en la propia BD: los días 24, 25 y 26 la estrategia `catalizador` emitió señal
alcista para NVDA con el rationale «earnings en 2d / 1d / 0d», y las tres quedaron con
`motivo_bloqueo = 'posición ya abierta'`. Ni una sola de esas filas menciona el riesgo del evento.

## Por qué el stop no era una protección

Un hueco de apertura no se ejecuta al stop, se ejecuta a la apertura. Con la referencia de la
víspera (209,66 $), un movimiento **simétrico** del que ocurrió —un −6,79%— habría abierto en
195,42 $: **por debajo del stop de 203,22 $**. La pérdida real habría sido ~−9% sobre la entrada, no
el −5,36% que el dimensionado creía estar arriesgando.

No es hipotético. El precedente inmediato del mismo valor, medido:

| Fecha | Cierre | Variación |
|---|---|---|
| 25/02/2026 (resultados, post-cierre) | 195,56 $ | — |
| 26/02/2026 | 184,89 $ | **−5,46%** |
| 27/02/2026 | 177,19 $ | **−9,39% acumulado** |

## El hallazgo colateral: no se sabe ni a posteriori si «batió»

Al reconstruir el caso, las dos fuentes de pago del monorepo dan **signo opuesto** para el mismo
trimestre:

| Fuente | BPA reportado | Estimado | Veredicto |
|---|---|---|---|
| Financial Datasets (8-K, GAAP) | 2,46 $ | 1,85 $ | BEAT +33,0% |
| Alpha Vantage (`EARNINGS`) | 0,99 $ | 2,09 $ | MISS −52,6% |

El propio 8-K explica la discrepancia: declara un BPA diluido **non-GAAP de 1,01 $** frente al
**GAAP de 2,46 $**. Es la misma clase de error que documenta `CLAUDE.md` con ORCL: *la clave de un
dato es su periodo y su unidad, no la etiqueta del documento que lo publica*. Consecuencia práctica:
**cualquier regla automática del tipo «comprar si bate» la decidiría el parser, no la empresa.** No
se cablea ninguna.

Contexto que hace la sorpresa aún menos informativa: NVDA batió el BPA en los **12 trimestres
anteriores** a este (desde el que reportó en noviembre de 2022). Batir es la base, no la noticia.

## Qué se ha cambiado a raíz de esto (y qué NO)

**Sí — carril de datos** (PR de esta entrada):

1. `trading_tesis.proximo_earnings` + `earnings_estado`: la fecha de resultados ya se **persiste** con
   la tesis. Antes se usaba (barrera y estrategia `catalizador`) pero solo sobrevivía como texto libre
   en `rationale`, que no se puede agregar ni cruzar.
2. `trading_paper_posicion`: misma pareja de columnas, congelada **al abrir**.
3. `trading_paper_orden.evento_dentro` en las SELL: única huella que sobrevive al cierre (la fila de
   la posición se borra), con tres estados — `cruzado` | `limpio` | `sin_consultar`.
4. `/api/trading/puntuar` publica la **atribución por evento**: retorno medio de los resultados con
   evento dentro de la ventana frente a los que no, y **cuántos no se han podido comprobar**.
5. Backfill de lo ya existente reconstruido desde `rationale`, etiquetado `earnings_estado =
   'reconstruido'` — es una deducción a posteriori, no una medición, y va marcada para poder
   excluirla de cualquier agregado estricto.

**No — eso sería cambiar el modelo** (y va por `docs/TRADING-HIPOTESIS-PREREGISTRO.md`):

- Ninguna regla de salir o reducir antes de resultados.
- Ningún cambio en el dimensionado.
- Ningún cambio en `trading_estrategia_stats` ni en la confianza del torneo: la atribución se calcula
  sobre el mismo conjunto que alimenta las stats, pero **no las toca**.

Motivo para no cablear una regla ahora: el historial de este repo con reglas de evento es **0 de 4**
—capitulación (H8) invirtió el signo entre mitades; las tres reglas de salida de H9 fallaron su
criterio; base y ruptura con volumen también se dieron la vuelta (+1,44 pp en 2011-18 → −2,72 pp en
2019-26, n=1.257)—. Todas parecían sensatas antes de medirlas. La quinta se mide antes de creerla, y
para medirla hacía falta justo el registro que faltaba.

## Lo que queda pendiente

- **Movimiento implícito de las opciones** (straddle ATM de la semana del evento) como contexto de
  dimensionado. Solo merece la pena si entra en el tamaño; como línea informativa más en el Telegram,
  no — ya hay cuatro «contextos» que no cambian nada.
- Con 2-3 meses de atribución acumulada, decidir **con datos** si una regla de evento se preregistra.

## Nota de encuadre

A 24/08/2026, la cohorte forward con más recorrido (`2026-07-18.v1`, 37 días, n=8) va **−0,99%
frente a +3,18% del SPY: −4,17 pp de alpha**. El objetivo declarado del agente es batir al índice;
ahora mismo no lo hace. Esa es la cifra que la atribución por evento existe para no dejar maquillar.
