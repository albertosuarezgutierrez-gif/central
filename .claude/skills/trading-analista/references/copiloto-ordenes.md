# Copiloto de órdenes + cartera real núcleo-satélite (15/08/2026)

Decisión de Alberto (15/08/2026, sesión «compras IBKR»): el agente pasa de solo-paper a
**copiloto con confirmación humana**, sin tocar la regla de oro. Base: el MCP de IBKR **no
puede ejecutar órdenes** — `create_order_instruction` crea una *instrucción* (borrador), y
es Alberto quien la revisa y la envía desde la app de IBKR vía el deep-link que devuelve.
Esa limitación técnica es la salvaguarda: el agente prepara, Alberto confirma.

## Doctrina núcleo-satélite (lo que respaldan los datos)
- **Núcleo:** ETF global amplio con el grueso del capital (80-100% del NAV). **No se toca.**
  Es el suelo a batir (`docs/INVERSION-VEREDICTO-2026-08.md` §8.1).
- **Satélite:** máx. 10-20% del NAV para propuestas del sistema — **HOY EN PAPER**. Pasa a
  dinero real SOLO si el Tramo 2 del forward (120 días; cohortes vivas 2026-07-18/20) valida
  y Alberto abre la puerta explícitamente. Esa decisión se anota en
  `docs/TRADING-HIPOTESIS-PREREGISTRO.md` y en la memoria; hasta entonces no existe.
- **⛔ Rotación núcleo→satélite PROHIBIDA:** «sacar del ETF porque hay una oportunidad» es el
  patrón de timing que dio −33,9% y reactiva la regla fiscal de los 2 meses (art. 33.5 f
  LIRPF). El agente NUNCA propone vender el núcleo para financiar una señal. El satélite se
  financia con liquidez nueva o con su propio tamaño, jamás vaciando el núcleo.

## Instrucciones de orden (`create_order_instruction`)
- **Cuándo SÍ:** solo cuando Alberto lo pide explícitamente en conversación («prepárame la
  compra del ETF», «déjame lista la orden de X»). La petición autoriza ESA instrucción, no
  las siguientes.
- **Cuándo NO:** la Rutina programada (pasada nocturna) **NUNCA crea instrucciones por su
  cuenta** mientras dure la Fase 1 — ni para el núcleo ni para el satélite. Sin excepciones
  «porque la señal era buenísima».
- **Cómo:** `search_contracts` → `contract_id_ex` (string, verbatim) → instrucción **LIMIT
  por defecto** (MARKET solo si Alberto lo pide; en ETFs líquidos un LIMIT cerca del ask
  protege sin coste). Cantidad calculada y CANTADA antes de crear (unidades × precio ≈
  importe, formato español). El deep-link devuelto se manda por Telegram con la tesis en
  2-3 líneas.
- **Una instrucción creada NO es una orden ejecutada.** Jamás dar por hecha la compra:
  verificar con `get_account_orders` / `get_account_trades` / `get_account_positions` antes
  de afirmar que algo se ejecutó (regla «dato que no hay ≠ dato no mirado»).

## Vigilancia de la cartera real (paso nuevo de la pasada diaria)
Tras leer el NAV, leer también `get_account_positions` y añadir al resumen de Telegram un
bloque **💼 Cartera real** (2-4 líneas):
- Núcleo: valor, peso sobre NAV y P&L no realizado del ETF. Comparar su marcha con el SPY
  **avisando de la divisa** (el TWR de la cuenta es base euro; no mezclar sin decirlo).
- Liquidez: si hay >20% del NAV en cash sin desplegar en el núcleo, decirlo en una línea
  («liquidez parada»), sin insistencia ni recomendación nueva cada día.
- Posiciones fuera del plan (ni núcleo ni paper): señalarlas — son operativa manual de
  Alberto; se informa, no se juzga ni se propone cerrarlas.
- Si `get_account_positions` falla, el bloque dice «cartera real: sin leer hoy» — nunca
  omitirlo en silencio (un bloque ausente es indistinguible de una cartera vacía).
- **Además de al Telegram, las posiciones van al PANEL (17/08/2026):** empujarlas a
  `POST /api/trading/cartera` (paso 1c de `references/pasada-diaria.md`) para que la sección
  «💼 Cartera real» de `/trading` se refresque. Solo se llama con una lectura BUENA — un fallo
  de lectura no se manda como cartera vacía.
- **📈 La curva de evolución la alimenta ESA MISMA llamada (18/08/2026):** el endpoint anota el punto
  del día en `trading_cartera_real_track` (uno por día y DIVISA; la última pasada del día lo reescribe)
  y devuelve `track` (puntos escritos) y `trackError`. Es la ÚNICA fuente del gráfico: la foto de
  posiciones se reemplaza cada noche, así que un día sin pasada es un día sin punto — un hueco real en
  la curva, no un valor a interpolar. **Si `trackError` viene con contenido, cántalo en el Telegram**
  (la cartera sí se guardó, pero ese día no entra en el gráfico).

## Alertas de precio (`create_alert`)
- Permitidas a petición de Alberto o para niveles que él haya acordado (p. ej. zona de
  entrada de una propuesta validada). Incluir **SIEMPRE `email`** (el de Alberto): sin él la
  alerta solo se ve en IBKR Desktop y no le llega nada.
- Antes de crear, `get_alerts` para no duplicar; anotar en el resumen qué alertas viven.
- Una alerta es un aviso, no una autorización: si dispara, se le cuenta a Alberto — no se
  crea ninguna instrucción sin que él la pida.

## 📏 El stop y el tamaño salen de los datos, no del pulso (20/08/2026)
Medido sobre la cuenta real (sesión 19/08, PR #1505): de las **116 ventas de 2026, 109 fueron
órdenes STOP** y sumaron **−21.692,60 USD**; las 7 ventas a mercado sumaron **+2.946,74 USD**.
La mediana de distancia a la que saltó el stop fue del **1,30%** y 25 de 95 saltaron a menos del 1%.
CoreWeave **subió un 42,1%** entre la primera y la última operación mientras dejaba **−6.369 USD** en
33 movimientos. **La pérdida no vino de elegir mal los valores, vino de dónde estaba el stop.**

Antes de preparar cualquier instrucción (y solo cuando Alberto la pida — la Rutina programada sigue
sin crear instrucciones), pasa las velas que ya tienes por **`@central/module-trading`**
(`packages/module-trading/src/riesgo-hueco.ts`):
- **`evaluarStop(velas, distanciaPct)`** → `saltaPorRuido` (% de sesiones normales en las que el
  recorrido desde la apertura habría tocado el stop), `saltaPorHueco` (% de sesiones en las que un
  hueco de apertura lo ATRAVESÓ: ahí el stop no protege, solo fija el peor precio), `sugerida`
  (distancia en múltiplos de ATR) y un veredicto `decorativo | ajustado | razonable` con su frase.
- **`tamanoPorRiesgo(precio, distanciaPct, riesgoMaxEur)`** → **la respuesta correcta a «este stop es
  demasiado corto» NO es acercarlo ni alejarlo a ojo, es COMPRAR MENOS.** Con 500€ de riesgo caben
  494 títulos a un stop del 1,30% y 53 a uno del 12%: el stop corto no limitaba la pérdida, hacía que
  una posición enorme pareciera prudente.
- **Sin historia suficiente devuelven `null`, y `null` no se pinta como «riesgo 0»**: se dice que no
  se ha podido medir. Un cero tranquilizador aquí es exactamente el error que el módulo existe para
  evitar.

Contexto medido sobre 40 sesiones reales de CRWV: hueco de apertura a la baja típico **2,07%** (más
grande que su mediana de stop), un stop al 1,30% salta por ruido normal en el **75%** de las sesiones
y es atravesado por un hueco en el **33%**; el ATR sugería ~20%. Y la lección de Moderna del 19/08
(abrió **+84,3%** sobre el cierre anterior): un hueco no respeta el stop, lo atraviesa — entre el
cierre y la apertura no hay precio donde ejecutar.

⚠️ **Estado: el módulo NO está enganchado a la pasada automática.** Hoy se usa a mano cuando Alberto
pide una instrucción. Engancharlo al paso de propuestas (que el aviso diga «stop mínimo X%, tamaño
máximo Y títulos») está pendiente y es lo siguiente que toca.
