# Verificación AUTOMÁTICA de eventos previstos (SIVRA pricing) — 12/08/2026

## El problema

El descubrimiento de eventos previstos (`estado='previsto'`, PR del 01/08/2026) termina en un
Telegram que dice:

> _Si confirmas alguno, pásalo a `confirmado` y ya tarifica._

Alberto, al recibirlo con tres fechas de «Mangafest Winter Edition»: **«esto tiene q ser
automático, yo no sé de esta información»**. Y tiene razón por dos motivos:

1. **Le pide un dato que no tiene.** Saber si un festival anunciado en prensa acabará
   celebrándose no es conocimiento del dueño de cuatro pisos: es trabajo de rastreo, que es
   justo lo que la máquina sabe hacer.
2. **Una cola de decisiones humanas se atasca.** Un previsto sin confirmar ni descartar se
   queda protegiendo el suelo de una noche para siempre — o, peor, sube el precio ponderado
   (v2 del 09/08) de una fecha que nunca existió, sin que nadie lo retire.

Además el propio aviso mentía: decía «de momento NO suben el precio» cuando desde la v2 un
previsto LEJANO sí mueve el precio ponderado por confianza.

## Qué se construye

Un cron nuevo **`/api/sivra/eventos/verificar`** (diario, 05:30 UTC, detrás de los dos
descubridores) que juzga cada previsto vivo y **decide solo**.

### Tres señales independientes, cada una con TRES estados

Regla de la casa: *dato que no hay ≠ dato que no se ha mirado*. Ninguna señal puede devolver
«no» cuando lo que pasa es «no lo sé».

| Señal | Corrobora cuando | «No se ha podido mirar» |
|---|---|---|
| **Fuente dura** | existe otra fila `confirmado` (Ticketmaster / websearch) en la misma fecha con nombre parecido | la consulta a BD falla |
| **Prensa dirigida** | `buscarWeb` responde `veredicto:'confirmado'` con confianza ≥ 0,8 | la búsqueda no responde o el JSON no se parsea → `no_verificable` |
| **Mercado real** | el p50 de comps FIABLES (`booking_mcp`/`manual`, sin clonar) de esa noche está ≥25% sobre la línea del mes, con ≥4 comps y ≥3 fechas de base | corpus sin cobertura → `sin_datos` |

### Cómo decide (`lib/sivra/eventos-verificacion.ts`, puro y testeado)

1. Fuente dura corrobora → **`confirmado`**.
2. Prensa dice `desmentido` (cancelado / no existe) → **`descartado`**.
3. Prensa dice `confirmado` con confianza ≥ 0,8 → **`confirmado`**.
4. Mercado `sube` **y** la prensa no lo contradice (`confirmado`/`sigue_previsto`) → **`confirmado`**.
5. La prensa da una **fecha distinta** dentro del horizonte → esta fila se **descarta** («la fecha
   real es otra») y se **reubica** el evento a la fecha buena como fila nueva, con el estado que
   le corresponda. Que un evento se mueva de día no puede costar una fecha protegida de menos y
   otra de más.
6. **Caducidad:** a ≤21 días de la fecha, con ≥2 verificaciones ÚTILES y sin corroborar →
   **`descartado`**.
7. En cualquier otro caso **no se toca el estado** (solo se refresca confianza/evidencia).

**Con 0 verificaciones útiles NUNCA se descarta.** Una búsqueda caída no es un evento
inexistente. Una pasada que no pudo verificar nada deja el latido en rojo.

### Quién manda

Columna nueva **`decidido_por`**: `'auto'` (el cron) o `'alberto'` (mano humana, hoy por SQL).
El cron **solo escribe filas que no lleven `'alberto'`**, igual que el upsert del descubrimiento
ya respeta el estado decidido a mano.

### Telegram

- **Desaparece** el aviso 🔮 que pedía confirmar (decisión de Alberto: «silencio salvo problema»).
- Queda **una línea** cuando el cron auto-confirma un **pelotazo** (factor ≥ 1,4): eso sí pasa a
  tarificar al factor pleno y merece que se sepa.
- Queda el **latido** `sivra_eventos_verificar` (30 h) — si la verificación no puede correr, el
  vigía lo canta. Un verificador mudo tendría el mismo efecto que el estado anterior (previstos
  eternos) pero sin que nadie se enterara.

## Esquema

`prisma/sql/2026-08-12_eventos_verificacion.sql`:

| Columna | Para qué |
|---|---|
| `verificado_at` | último INTENTO (cola: `NULLS FIRST`) |
| `verificado_ok_at` | última verificación que sí pudo mirar |
| `verificaciones` | cuántas ÚTILES lleva — es lo que autoriza a caducar |
| `veredicto` | etiqueta corta de la última decisión (auditable sin releer código) |
| `decidido_por` | `auto` / `alberto` |

`avisado_at` se conserva (histórico del aviso viejo), ya sin escritor.

## Presupuesto y límites

- Máximo `SIVRA_EVENTOS_VERIFICAR_MAX` (default 6) búsquedas por pasada, con presupuesto de
  tiempo explícito (`maxDuration=300`, deadline 240 s) — la lección del `facturas-scan` que
  moría en 504 antes de escribir su huella.
- Un evento se re-verifica como mucho cada 7 días, salvo que esté en zona de caducidad
  (≤21 días), donde se mira a diario.
- Coste: ~0,02 €/búsqueda por el plugin `web` de OpenRouter, dentro del presupuesto diario de la
  pasarela.

## Riesgos asumidos

- **Auto-confirmar de más:** un previsto confirmado por error tarifica al factor pleno. Mitigado
  por el umbral alto de prensa (0,8), por exigir corroboración independiente, y porque el raíl
  de ±%/día del motor tarda 2-3 pasadas en llegar al precio (hay tiempo de deshacer).
- **Descartar de más:** un evento real sin cobertura de prensa a 21 días pierde la protección de
  suelo. Es el lado barato del error, y solo ocurre tras dos verificaciones que sí pudieron mirar.
- **Cobertura de mercado fina:** hoy el corpus fiable (`booking_mcp`) es joven, así que la señal
  de mercado será `sin_datos` la mayoría de las veces. Es correcto: no confirma ni descarta nada.
