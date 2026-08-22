# Diseño — `conectores-vigia` (vigía de conectores MCP)

> **Fecha:** 21/08/2026 · **Estado:** diseño aprobado por Alberto, pendiente de plan de implementación.
> Origen: Alberto pregunta si hay conectores MCP de bolsa que merezca añadir, y si se puede crear un
> agente que revise conectores y vea si alguno encaja en algún proyecto del monorepo.

## 1. Problema

Hay ~28 conectores MCP conectados a la cuenta y un registro público que crece cada mes. Hoy nadie
mira ninguna de las dos cosas:

- **Hacia fuera:** un conector nuevo puede cerrar un hueco que llevamos meses arrastrando (o que
  estamos a punto de pagar), y no nos enteramos.
- **Hacia dentro:** de los 28 conectados, varios están en `installState: unknown` y sin uso visible
  en el repo. Cada uno es superficie que el formulario de Rutinas adjunta **en bloque** — el
  incidente del 08/08/2026 (16 adjuntos heredados, entre ellos IBKR, Gmail y Vercel, para una
  rutina que solo escribe comparables de mercado) es el precedente.
- **Hacia los que ya usamos:** si un conector del que depende una rutina cambia, se deprecia o mueve
  un endpoint a premium, **la rutina se rompe en silencio**. Verificado hoy en vivo: Alpha Vantage
  anuncia precios ajustados en su ficha, y `TIME_SERIES_DAILY_ADJUSTED` responde *"this is a premium
  endpoint"*.

## 2. Decisiones tomadas (21/08/2026)

| Decisión | Valor |
|---|---|
| Alcance de la salida | **B + C**: avisa + audita los conectados + abre PR draft con el trabajo hecho. |
| Criterio de encaje | **1 + 2** (huecos declarados + inventario de integraciones). **3 descartado.** |
| Cadencia | Mensual, **día 5**, ~04:00 CEST (el 15 lo ocupa `github-vigia`). |
| Verticales | Todas, no solo trading. |
| Ficha de rutina | Nº **16** de `docs/RUTINAS-PROGRAMADAS.md`. |

### Por qué 1+2 y no 3

El criterio 3 (barrido semántico por vertical: describir la vertical, buscar por keywords, que el
LLM juzgue) **no tiene forma de estar equivocado**: siempre encuentra "algo relacionado", así que
nunca calla. Un vigía que nunca calla se ignora a los dos meses, y entonces da igual lo bueno que
sea el hallazgo del mes catorce.

Los criterios 1 y 2 **pueden fallar en seco** — un mes sin huecos que cerrar produce silencio — y esa
capacidad de callar es justo lo que hace que su Telegram signifique algo. Además el carril B los
necesita: sin el hueco concreto identificado, el PR draft no tiene qué escribir.

## 3. Estado entre pasadas

El contenedor es efímero: cada pasada es completa e idempotente, y todo lo que persiste está
commiteado.

| Fichero | Qué guarda | Nuevo |
|---|---|---|
| `docs/VIGIA-CONECTORES.md` | Conectores vistos, veredicto, fecha de pasada, **cuota y quién la consume**, y el mapa rutina→endpoint del que depende. | Sí |
| `docs/HUECOS-ABIERTOS.md` | Catálogo explícito de "esto nos falta". | Sí |

`HUECOS-ABIERTOS.md` es la pieza que hace posible el criterio 1. Esa información ya existe, pero
dispersa y sin nombre: `TRADING-FUENTES-PAGO.md` §2 es un catálogo de huecos que no se llama así,
igual que `EINFORMA-CONTRATACION.md` y los "Estado / pendientes" de los maestros. Sin un fichero
único, el criterio 1 no tiene contra qué cruzar.

**Lo mantiene también la auditoría diaria.** Si solo se llena a mano nace completo hoy y está viejo
en dos meses — y entonces el vigía calla por la razón equivocada: no porque no haya nada, sino
porque no sabe lo que falta. La auditoría ya reconcilia texto contra código y auto-aplica a `main`
(carril 1); detectar huecos nuevos y añadirlos encaja ahí sin infraestructura nueva.

## 4. La pasada

**Paso 0 — Contexto.** Lee `HUECOS-ABIERTOS.md`, `VIGIA-CONECTORES.md` y los pendientes vivos de
`CONTEXTO-SESIONES.md` + los maestros que toquen.

**Paso 0-bis — El hueco inverso (solo primera pasada, luego anual).** Antes de buscar nada fuera:
qué herramientas de los conectores **ya conectados** cerrarían un hueco que estamos programando a
mano o a punto de pagar. Siempre con llamada real de prueba, y comprobando además que **ya no lo
cubra una pieza propia** — un conector que duplica un endpoint nuestro no es un hallazgo, es trabajo
tirado.

**Paso 1 — Criterio 1: huecos declarados.** Cruza cada hueco de `HUECOS-ABIERTOS.md` contra
`SearchMcpRegistry`.

**Paso 2 — Criterio 2: inventario de integraciones.** Parte del código: qué APIs externas consume
cada vertical (Smoobu, Catastro, BOE, Enable Banking, FMP, Chekin, SES.HOSPEDAJES, Tuya, Stripe…) y
busca conector que las sustituya o les dé fallback.

**Paso 3 — Canario: los conectores que YA usamos.** Cada rutina declara de qué endpoint depende;
el vigía hace **una llamada real de prueba a cada uno**. Es el `watch de deprecación` de
`buscador-ia` aplicado a conectores, y es el paso que más vale de todos: descubrir un conector nuevo
es una oportunidad, que se rompa el que sostiene `mercado-booking` o `trading-analista` es una avería
— y una avería que hoy nadie detectaría, porque el modo de fallo no es un error, es un dato vacío
que aguas abajo se pinta como "no hay nada".

**Paso 4 — Higiene de los conectados (carril C).** `ListConnectors`, cruce con uso real en el repo, y
marca: los que nadie usa, los de `installState: unknown`, y los que exponen herramientas de
**escritura** (adjuntables a una rutina por herencia en bloque).

**Paso 5 — Salida.** Ver §7.

## 5. La regla dura: evidencia antes que catálogo

> **Ningún conector se recomienda, y ningún endpoint se da por vivo, sin una llamada real de prueba
> al endpoint que supuestamente cierra el hueco. El veredicto va con la evidencia de la llamada, o
> no va.**

Es la regla de `CLAUDE.md` —*dato que NO hay ≠ dato que NO se ha mirado*— aplicada a conectores. El
catálogo miente por omisión: describe lo que el producto hace, no lo que **tu tier** te deja hacer.

Evidencia que originó la regla (21/08/2026, Alpha Vantage recién conectado):

| Endpoint | Ficha del catálogo | Realidad del tier gratis |
|---|---|---|
| `EARNINGS_CALENDAR` | "earnings" | ✅ Funciona. `ISRG → reportDate 2026-10-20, fiscalDateEnding 2026-09-30, estimate 2,63 USD`. |
| `LISTING_STATUS` | — | ✅ Funciona. 8.491 deslistadas con `ipoDate` + `delistingDate`. |
| `TIME_SERIES_DAILY_ADJUSTED` | "stock market data" | ❌ **Premium.** *"This is a premium endpoint."* |

Sin la llamada de prueba, este diseño habría prometido un tercer fallback de precios ajustados por
splits y dividendos que **no existe** en el tier contratado.

**Segunda evidencia, el mismo día, y contra este mismo diseño.** Al redactar el paso 0-bis se dio por
bueno que `Datos financieros` aportaba `screen_stocks`, `get_insider_trades` y
`get_institutional_holdings` gratis, por leer su lista de herramientas. Falso por dos motivos que solo
aparecen mirando: la cuenta responde `Your current balance is $0.00`, y esas capacidades **ya están
cubiertas por piezas propias** (`/api/trading/insiders` con Form 4, `/api/trading/gurus` con Dataroma,
`/api/trading/fundamentales` con SEC XBRL). El error se coló en la primera redacción del spec y lo
cazó la memoria de otra sesión del 21/08/2026, no el razonamiento.

De ahí dos consecuencias para el vigía, ambas obligatorias:

- **Un conector que existe no es un conector disponible.** Saldo agotado, tier gratis y cuota diaria
  son estados invisibles en el catálogo. `Your current balance is $0.00` significa **«fuente sin
  saldo»**, nunca «no hay datos» — colapsar lo uno en lo otro es la regla de la casa incumplida.
- **Antes de proponer nada, mirar si ya lo tenemos.** El paso 0-bis cruza contra el código propio,
  no solo contra los huecos.

## 6. Límites duros

- **El agente no puede conectar nada.** Conectar requiere el OAuth de Alberto. El vigía propone; el
  círculo lo cierra siempre una persona. Esto no es una limitación a sortear: es la razón por la que
  el carril B produce un PR draft y no un cambio aplicado.
- **Nunca adjunta conectores a rutinas** ni propone hacerlo "por si acaso". La regla del mínimo
  alcance de `RUTINAS-PROGRAMADAS.md` §4 manda.
- **Lista negra explícita:** `NEWS_SENTIMENT` y todo lo de noticias/sentimiento. Prohibido por regla
  de la casa (las noticias son contexto y jamás entran al modelo) — y ahora está a un tool-call de
  distancia, así que tiene que estar escrito, no supuesto.
- **La cuota es un recurso compartido.** Alpha Vantage free son ~25 llamadas/día para *todo el que lo
  use*. El día que `trading-analista` y el vigía lo toquen a la vez se pisan, y el perdedor recibe un
  `rate_limit` que parece un fallo de red. Por eso la cuota y sus consumidores se anotan por conector.
- **`LISTING_STATUS` no se consume por MCP:** 182.000 tokens de CSV se comen una sesión entera. Va por
  HTTP contra el CSV hacia el código que lo necesite.
- **`EARNINGS_CALENDAR` se pide UNA vez sin `symbol`** (devuelve el calendario completo) y se filtra
  en local. Símbolo a símbolo revienta la cuota con una watchlist de 15.

## 7. Salida — dos carriles

- **Texto (siempre):** `docs/VIGIA-CONECTORES.md` actualizado con la fecha de pasada, aunque no haya
  hallazgos. Auto-informe en `docs/AGENTES-BITACORA.md`.
- **Telegram (si hay hallazgo):** `POST {PLATAFORMA_URL}/api/internal/alerta`, Bearer `{ALERTA_TOKEN}`,
  con preflight `GET` al arrancar. Protocolo común de `docs/AVISOS-AGENTES.md`: si el canal está mudo
  (401), avisa por el push nativo empezando por `🔇 SIN TELEGRAM (401):` y deja el aviso entero en la
  bitácora. Nunca falla en silencio.
- **PR draft (carril B):** `claude/conectores-vigia-<fecha>` con el trabajo hecho.
- **Sin hallazgos → sin ruido:** solo el doc de estado y un resumen en el chat.

**Siempre dos PRs separados** cuando la pasada toque registro + comportamiento
(`RUTINAS-PROGRAMADAS.md`): el de registro se automergea y no envejece; el de comportamiento espera
a Alberto.

## 8. Hallazgo colateral — el automerge no reconoce los ficheros de estado de los vigías

La función `es_registro()` de `.github/workflows/rutinas-automerge.yml` reconoce **nueve** rutas:
cinco de registro puro, tres de ficheros generados y la landing de House Sevillana.

```
docs/CONTEXTO-SESIONES.md · docs/AGENTES-BITACORA.md · docs/AUTO-APLICADOS.md
docs/AUDITORIA-*.md · docs/memoria/*.md
apps/plataforma/lib/estructura.generated.json · docs/ARQUITECTURA.generated.md
docs/mapa-funciones.generated.json · apps/housesevillana/app/route.ts
```

**No están** `docs/VIGIA-OSS.md`, `docs/BUSCADOR-IA.md` ni `docs/FISCAL-AYUDAS.md` — los ficheros de
estado de `github-vigia`, `buscador-ia` y `fiscal-novedades`. Cuando esas rutinas actualizan su
estado, su PR cae en carril 2 y espera ojo humano **para un cambio que es puro registro**: exactamente
el pudrirse-en-conflicto que el workflow existe para evitar (los cinco PRs muertos del 04-07/08), solo
que en las tres rutinas a las que nadie miró.

Añadir `docs/VIGIA-CONECTORES.md` sin arreglar esto lo haría nacer con el mismo defecto. Arreglo:
regla `docs/VIGIA-*.md` + las dos rutas sueltas. **PR propio** — toca un workflow, así que carril 2.

## 9. Entregables

| # | Entregable | Carril |
|---|---|---|
| 1 | Skill `.claude/skills/conectores-vigia/SKILL.md` + `docs/VIGIA-CONECTORES.md` + `docs/HUECOS-ABIERTOS.md` | PR draft |
| 2 | Ficha nº 16 en `RUTINAS-PROGRAMADAS.md` + `docs/SKILLS.md` + `docs/AGENTES-MAPA.md` + `docs/FUENTES-DE-VERDAD.md` | Mismo PR que 1 |
| 3 | Arreglo del automerge (`rutinas-automerge.yml`) | **PR propio** |
| 4 | Integrar `EARNINGS_CALENDAR` en `trading-analista` | **PR propio** |
| 5 | Crear el trigger en `claude.ai → Rutinas` | **Manual de Alberto** |

**El entregable 4 se CANCELÓ el mismo día de escribir el plan (21/08/2026), y su cancelación es
el mejor argumento a favor de este vigía.** Iba a integrar `EARNINGS_CALENDAR` de Alpha Vantage
porque `TRADING-FUENTES-PAGO.md` §2 marcaba la fecha de earnings como el único hueco con coste
directo en dinero real. Al ir a escribir el paso en la pasada nocturna apareció
`apps/plataforma/lib/trading/earnings-yahoo.ts`: cerró ese hueco el **05/08**, diez días ANTES de
que se escribiera el doc que lo declaraba abierto. Y lo cierra mejor — da `confirmada` (anunciada
por la empresa vs estimada), que Alpha Vantage no da, y corre server-side para todas las rutas.

Integrarlo habría añadido una fuente redundante, peor, y que gasta una cuota compartida de ~25
llamadas/día. De la fase 3 sobrevive `estadoEarnings()` (§9, entregable 4') y la corrección de los
docs obsoletos.

**Cuarta forma de la misma regla: el catálogo que miente puede ser el tuyo.** Un doc de huecos
envejece hacia el lado peligroso — sigue pidiendo lo que ya tienes, y nadie lo nota porque pedir
de más no rompe nada visible. Por eso el paso 0-bis cruza contra el CÓDIGO, no contra el doc que
declaró el hueco.

## 10. Riesgos y cosas a verificar en la primera pasada

1. **¿Existen `SearchMcpRegistry` / `ListConnectors` dentro de una rutina programada?** Parecen
   herramientas nativas del harness, no un conector — lo que haría del vigía la rutina con **menos
   superficie de todas** (cero conectores adjuntos, solo GitHub nativo + `PLATAFORMA_URL` +
   `ALERTA_TOKEN`). **No se da por bueno:** si no están disponibles, el paso 1 no puede ejecutarse y
   hay que replantearlo. Es lo primero que comprueba la primera pasada.
2. **Cuota del tier gratis en la propia pasada.** El paso canario gasta llamadas reales. Si los
   canarios de un conector agotan su cuota diaria, la rutina que depende de él falla esa noche. El
   canario debe ser **una** llamada barata por endpoint, y anotarse en la contabilidad de cuota.
3. **Ruido a los tres meses.** Si tras tres pasadas el vigía no ha producido ningún hallazgo
   accionable, sobra: se replantea o se apaga. Que sea capaz de callar no es excusa para que no diga
   nunca nada útil.

## 11. Fuera de alcance (YAGNI)

- Conectar conectores automáticamente (imposible: requiere OAuth de Alberto).
- Criterio 3 (barrido semántico por vertical) — descartado por diseño, §2.
- Cualquier conector de noticias/sentimiento — lista negra, §6.
- Evaluar conectores de pago por su cuenta: el vigía informa del coste y del hueco que cierra; la
  decisión de gastar es de Alberto.
