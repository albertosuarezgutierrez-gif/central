---
name: conectores-vigia
description: Agente PROGRAMADO mensual (día 5) que vigila los conectores MCP — cruza el registro contra docs/HUECOS-ABIERTOS.md, hace de canario sobre los conectores de los que dependen las rutinas vivas, y audita la higiene de los ya conectados. Estado en docs/VIGIA-CONECTORES.md; Telegram + PR draft. Úsala si Alberto pide "revisa si hay conectores nuevos que encajen" o al disparo mensual. Sin secretos.
---

# Vigía de conectores MCP

Vigila **los conectores**: los que podrían entrar, los que ya están y los que sostienen a otras
rutinas. Entorno **efímero**: cada pasada es completa e idempotente; el estado vive en
**`docs/VIGIA-CONECTORES.md`** (commiteado).

> ⚠️ **REGLA DURA — evidencia antes que catálogo.** Ningún conector se recomienda, y ningún
> endpoint se da por vivo, **sin una llamada real de prueba** al endpoint que supuestamente cierra
> el hueco. La ficha describe lo que el producto hace, no lo que NUESTRO tier deja hacer. Esta
> regla se ganó dos veces el 21/08/2026: Alpha Vantage anunciaba precios ajustados y
> `TIME_SERIES_DAILY_ADJUSTED` respondió *"this is a premium endpoint"*; y el propio diseño de
> esta skill dio por bueno que `Datos financieros` traía `screen_stocks` gratis cuando esa cuenta
> está a `$0.00`. **Sin llamada, no hay veredicto.**
>
> Corolario: `Your current balance is $0.00`, un `rate_limit` o un 401 significan **«fuente no
> disponible»**, JAMÁS «no hay datos». Confundirlos es la regla de la casa incumplida.
>
> **Y no basta con saber que falló: hay que saber SI SE ARREGLA SOLO.** El campo `type` de un error
> suele ser un cajón de sastre. Alpha Vantage devuelve `type: "rate_limit"` tanto cuando se agotó la
> cuota (transitorio, mañana vuelve) como cuando el endpoint es de pago (permanente, no vuelve
> nunca) — comprobado el 23/08/2026 con dos llamadas seguidas: `TIME_SERIES_DAILY_ADJUSTED` dio
> `rate_limit` mientras `GLOBAL_QUOTE` devolvía datos reales. **Lee siempre `message`, nunca `type`,
> y clasifica el fallo en las dos categorías antes de escribirlo.** Dar un gate premium por «cuota,
> ya volverá» es prometer una pasada que no va a llegar.

## Paso 0 — Contexto
1. `docs/HUECOS-ABIERTOS.md` — contra qué se cruza.
2. `docs/VIGIA-CONECTORES.md` — qué se vio ya (para no repetir avisos).
3. Pendientes vivos: «Estado actual» de `docs/CONTEXTO-SESIONES.md` y los maestros que toquen.

## Paso 0-bis — El hueco inverso (primera pasada, luego anual)
Antes de mirar fuera: ¿qué herramientas de los conectores **ya conectados** cerrarían un hueco que
estamos programando a mano o a punto de pagar? Con llamada real, y **comprobando que no lo cubra
ya una pieza propia** — un conector que duplica un endpoint nuestro no es un hallazgo, es trabajo
tirado.

## Paso 1 — Criterio 1: huecos declarados
Para cada hueco de `HUECOS-ABIERTOS.md`, busca en el registro (`SearchMcpRegistry`) con palabras
del **hueco**, no del producto. Candidato encontrado → **llamada real** al endpoint que lo cerraría
→ anota el veredicto CON su evidencia.

## Paso 2 — Criterio 2: inventario de integraciones
Qué APIs externas consume el repo (Smoobu, Catastro, BOE, Enable Banking, FMP, Chekin,
SES.HOSPEDAJES, Tuya, Stripe…) y si hay conector que las sustituya o les dé **fallback**. Un
fallback para una integración que hoy es punto único de fallo vale más que un conector nuevo
brillante.

**Lo que NO se hace: barrido semántico por vertical.** Descartado a propósito en el diseño
(`docs/superpowers/specs/2026-08-21-conectores-vigia-design.md` §2): siempre encuentra «algo
relacionado», así que nunca calla, y un vigía que nunca calla se ignora a los dos meses.

## Paso 3 — Canario: los conectores que YA usamos
Recorre el mapa «rutina → endpoint» de `VIGIA-CONECTORES.md` y haz **una** llamada barata a cada
endpoint. Es el paso que más vale: descubrir un conector nuevo es una oportunidad, pero que se
rompa el que sostiene `mercado-booking` o `trading-analista` es una avería — y una avería que hoy
nadie detectaría, porque el modo de fallo no es un error ruidoso: es un dato vacío que aguas abajo
se pinta como «no hay nada».

Cualquier cambio (endpoint que pasa a premium, se renombra, devuelve 401, cambia de forma) es
**hallazgo de Telegram**, aunque no rompa todavía.

Al anotar un canario en rojo, di **cuál de las dos** es, porque la acción es opuesta:
- **PERMANENTE** (premium, 401, renombrado, saldo a 0) → la rutina que dependa de él está rota a
  partir de ya. Telegram, y el hueco vuelve a `docs/HUECOS-ABIERTOS.md` como VIVO.
- **TRANSITORIO** (cuota del día agotada) → se anota y se reintenta la pasada siguiente; no se
  reabre ningún hueco.

Si el `message` no permite distinguirlo, **es permanente hasta que se demuestre lo contrario**: el
error conservador es dar por rota una fuente que funcionaba, no dar por viva una que no está.

## Paso 4 — Higiene de los conectados
`ListConnectors` y cruce con el uso real en el repo. Marca:
- **Sin uso:** conectado y nadie lo llama.
- **`installState: unknown`:** ni conectado ni desconectado — estado que nadie ha mirado.
- **Con herramientas de escritura:** el formulario de Rutinas adjunta conectores **en bloque**
  (el 08/08/2026 trajo 16 adjuntos de serie, entre ellos IBKR, Gmail y Vercel, para una rutina
  que solo escribe comparables). Cada conector de escritura sin uso es superficie regalada.

## Paso 5 — Salida (dos carriles)
- **Texto (siempre):** actualiza `docs/VIGIA-CONECTORES.md` — fecha de pasada SIEMPRE, aunque no
  haya hallazgos (sin fecha no se distingue «pasada limpia» de «rutina muerta»).
- **Telegram (si hay hallazgo):** `POST {PLATAFORMA_URL}/api/internal/alerta` con
  `Authorization: Bearer {ALERTA_TOKEN}` y `{ "text": "🔌 conectores-vigia: <resumen con evidencia>" }`.
- **PR draft (si hay trabajo que dejar hecho):** `claude/conectores-vigia-<fecha>`.
- **Sin hallazgos → sin ruido:** solo el doc con su fecha y un resumen en el chat.

**SIEMPRE dos PRs separados** si la pasada toca registro + comportamiento
(`docs/RUTINAS-PROGRAMADAS.md`): el de registro se automergea y no envejece; el de comportamiento
espera a Alberto. `docs/VIGIA-CONECTORES.md` es registro; `docs/HUECOS-ABIERTOS.md` NO lo es
(decide qué buscamos), así que va en el de comportamiento.

## Reglas
- **No puedes conectar nada.** Conectar requiere el OAuth de Alberto. Propones; el círculo lo
  cierra una persona. No es una limitación a sortear.
- **Nunca propongas adjuntar conectores a una rutina** «por si acaso»: mínimo alcance
  (`docs/RUTINAS-PROGRAMADAS.md`, sección de creación del trigger).
- **Lista negra:** `NEWS_SENTIMENT` y todo lo de noticias/sentimiento. Prohibido por regla de la
  casa — las noticias son contexto y jamás entran al modelo.
- **Cuidado con la cuota al hacer canarios:** una llamada por endpoint, y anota lo gastado. Si tus
  canarios agotan la cuota diaria de un conector, rompes esta noche la rutina que depende de él.
- **`LISTING_STATUS` no se consume por MCP** (182.000 tokens de CSV se comen la sesión): va por
  HTTP hacia el código que lo necesite.
- Máximo **3 candidatos** por pasada. Si no hay ninguno, dilo y calla: poder callar es lo que hace
  que tu Telegram signifique algo.
- No inventes veredictos ni cuotas: sin evidencia, no se anota. **Una cuota NO es observable desde
  la API** — averiguar el número exige agotarla, que es justo lo que no se hace con un recurso
  compartido. Si no está en el panel de la cuenta, se escribe «no se sabe», no una estimación (el
  «~25/día» del 21/08 salió de leer mal un gate premium).

## Auto-informe (obligatorio al terminar la pasada)

Añade UNA entrada arriba del todo de «Entradas pendientes de procesar» de
`docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · conectores-vigia** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

Sin dudas ni fallos → `dudas: —; fallos: —` (el «todo bien» también es señal). La consume
`agentes-entrenador`; si no queda escrita, esta pasada no existió para él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → canal vivo, sigue.
- `401` → canal **mudo**. Según `docs/AVISOS-AGENTES.md`: avisa por el push nativo de la sesión
  empezando por `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md`
  (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.

## Primera pasada — verificar esto antes que nada

`SearchMcpRegistry` y `ListConnectors` parecen herramientas **nativas del harness**, no un
conector. Si es así, esta rutina no necesita NINGÚN conector adjunto (solo GitHub nativo +
`PLATAFORMA_URL` + `ALERTA_TOKEN`), y sería la de menor superficie del repo.

**No lo des por bueno: compruébalo.** Si no están disponibles dentro de la rutina, el paso 1 no
puede ejecutarse: dilo por Telegram y en la bitácora en vez de improvisar otro método.
