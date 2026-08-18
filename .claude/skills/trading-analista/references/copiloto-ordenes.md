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

## Alertas de precio (`create_alert`)
- Permitidas a petición de Alberto o para niveles que él haya acordado (p. ej. zona de
  entrada de una propuesta validada). Incluir **SIEMPRE `email`** (el de Alberto): sin él la
  alerta solo se ve en IBKR Desktop y no le llega nada.
- Antes de crear, `get_alerts` para no duplicar; anotar en el resumen qué alertas viven.
- Una alerta es un aviso, no una autorización: si dispara, se le cuenta a Alberto — no se
  crea ninguna instrucción sin que él la pida.
