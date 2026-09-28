# Bitácora de auto-informes de agentes — `central`

> **Para qué.** Cada agente programado (skill de `docs/SKILLS.md` § "Agentes programados")
> deja aquí UNA entrada por ejecución: qué hizo, qué dudó, qué falló. Es la materia prima
> del `agentes-entrenador` (rutina semanal) para mejorar los prompts por RENDIMIENTO real,
> no por intuición. El contenedor es efímero: si no queda escrito aquí, no existió.
>
> **Cómo se mantiene.** Los agentes SOLO añaden entradas arriba del todo (3-5 líneas máx.,
> en el mismo commit/PR de su pasada, o en un commit propio a `main` si su pasada no tocó
> el repo). El `agentes-entrenador` PODA las entradas ya procesadas en su pasada semanal
> (git guarda el histórico; este archivo no engorda). Nadie más borra aquí.
>
> **Formato por entrada (una línea de lista, multilinea si hace falta):**
> `- **YYYY-MM-DD · <skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx / SHA / —`
> Sin dudas ni fallos → escribir `dudas: —; fallos: —` (el "todo bien" también es señal).

- **2026-09-28 · mercado-booking** · hizo: SEGUNDA pasada del día (el trigger diario ya se había
  disparado y registrado a las 11:12, PR #3830) — 237 comparables reales de Booking en las 24/24
  ventanas de mercado pedidas (mismo recorte `max=24` sobre los 508 candidatas/484 recortadas de
  hoy; mismas ventanas de evento Q1 2027). El `ingest` es idempotente por día, así que no duplica
  filas en `market_rates`; sí quedó un segundo latido `ok:false` (mismo motivo: escaparate 0/4,
  las 4 ventanas propias de 2026-10-06 siguen `hotel_names_no_availability`, no se cambiaron
  fechas). Sin novedad frente a la pasada de las 11:12: no se avisó a Alberto. dudas: por qué se
  disparó dos veces el mismo día (revisar el trigger programado); fallos: —; PRs/commits: —
  (solo escritura vía `/api/sivra/mercado/ingest` + este commit de bitácora).
- **2026-09-28 · mercado-booking** · hizo: pasada diaria — 236 comparables reales de Booking en
  las 24/24 ventanas de mercado pedidas (`max=24`, `candidatas=508`, `recortadas=484`, no agota el
  plan; casi todas evento Q1 2027 Centro histórico/Triana + Congreso SEC oct26); 4 anuncios propios
  de HOUSE SEVILLANA detectados en las ventanas de aforo 12 (07/19/21/22-mar-2027) y descartados
  antes de escribir. Paso 2-bis (escaparate propio) 0/4 medidas: las 4 (Busto Reform, Dúplex
  center, Luxury Busto, HOUSE SEVILLANA) devolvieron `hotel_names_no_availability` para
  2026-10-06 — mismo patrón recurrente ya diagnosticado el 23-27/09 (ventana fija ocupada; causa de
  fondo es código del generador de plan, fuera de esta skill, cazado en PR #3713 el 27/09) — hueco
  del conector, no fallo; no se cambiaron fechas/noches del plan. Latido `ok:false` (regla propia:
  escaparate sin medir cuenta aunque los comparables de mercado fueran bien). dudas: —; fallos: —;
  PRs/commits: — (solo escritura vía `/api/sivra/mercado/ingest`; este commit solo anota la
  bitácora y `CONTEXTO-SESIONES.md`).

- **2026-09-28 · pricing-agente** · hizo: ciclo semanal completo de los 4 pisos, delegado a 4 agentes en paralelo (uno por piso, mismas 12 ventanas que ciclos anteriores: oct26-jul27 1 finde/mes + Semana Santa + Feria + Karol G). Verificación obligatoria por SQL directo (no solo autoinforme): busto=128, duplex=146, luxury=146, house=101 comps nuevos en `market_rates`, ningún piso a 0. 48/48 propuestas dry-run en `pricing_decisiones`, circuit-breaker sano en los 4. Aprendizaje registrado en `pricing_aprendizaje` id 82. Telegram enviado con el resumen y la línea de comps por piso; dudas: —; fallos: — (1 timeout SSL transitorio en luxury, resuelto al reintentar). Hallazgos de calidad de dato sin arreglar aún (self-listing colándose como comp propio; `mercado/ingest` no distingue Trivago de Booking en `fuente`) — quedan anotados en `pricing_aprendizaje` id 82 para un ciclo futuro. PRs/commits: commit directo a `main` (esta pasada no tocó código, solo BD + Telegram).

## Entradas pendientes de procesar (lo más reciente arriba)

- **2026-09-28 · facturas-correo** · hizo: pasada disparada por trigger. Salud Vía B OK
  (`dias_caido=0`, última copia hoy 28/09 en `_buzon_pdf`); `agente_salud` actualizado
  (`ok=true`). Vía A (`gmail-adjuntos`) sigue `CONNECTION_CLOSED`, no bloquea. Backlog persistente
  revisado: `Facturas/Revisar` (ASECON factura 1-001804, 181,50€, "estudio-preparación-presentación
  Renta" a nombre de Alberto — confirmado SIN cargo en banco jul-sep, coincide con el aviso de
  ASECON de que sigue impagada) y `Facturas/PDF-pendiente` (2 Endesa Socorro 24, Ref
  P26CON034910794 y P26CON039980996 — solo enlace al portal, sin PDF adjunto en el email; la
  primera ya está conciliada por banco desde una pasada previa, solo falta el PDF; la segunda aún
  sin cargo en el banco). Ninguna se pudo resolver (sin browser/OCR ni `gmail-adjuntos`) → se
  mantienen las etiquetas. `Facturas/Extraccion-fallida`: `list_labels` marcaba 1, pero
  `search_threads` (la fuente correcta) da 0 — sin backlog real. Barrido 4.0
  (`v_facturas_sin_cargo`): 0 filas `sin_revisar`. Candidatos Gmail (`newer_than:2d`) y subidas
  manuales (`_subir_aqui` + raíz 2026): 0 facturas nuevas. dudas: ASECON 181,50€ — ¿se paga? ¿a qué
  `destino` iría si se archiva (no encaja en pisos/dúplex/seguros)?; fallos: —.
  PRs/commits: este commit (solo memoria/bitácora, sin cambios de código).
- **2026-09-27 · mercado-booking** · hizo: segunda pasada diaria del día — 238 comparables reales
  de Booking en las 24 ventanas de mercado del plan (`max=24`, `candidatas=508`, `recortadas=484` —
  no agota el plan; ventanas casi todas de evento Q1 2027 en Santa Cruz/Betis-Sevilla + una de
  octubre 2026); paso 2-bis (escaparate propio) 2/4 medidas (Dúplex center 545,84€/3n y HOUSE
  SEVILLANA 2.328€/3n), Busto Reform y Luxury Busto sin disponibilidad en Booking para 06-08/10 —
  hueco del conector, contado como `escaparateSinRespuesta`, no como "el canal cuadra"; 2 anuncios
  propios de HOUSE SEVILLANA detectados y descartados de los comparables de mercado (aforo 12,
  ventanas 2027-02-23/25 y 2027-02-28/03-02) antes de escribir. Latido `ok:true`. dudas: —;
  fallos: —; PRs/commits: — (solo escritura vía `/api/sivra/mercado/ingest`; este commit solo anota
  la bitácora y `CONTEXTO-SESIONES.md`).
- **2026-09-27 · facturas-correo** · hizo: pasada disparada por trigger. Salud Vía B OK
  (`dias_caido=1`, última copia 26/09 en `_buzon_pdf`); Vía A (`gmail-adjuntos`) sigue sin
  provisionar (`CONNECTION_CLOSED`, no bloquea). Barrido 4.0 (`v_facturas_sin_cargo`): 0 filas
  `sin_revisar` — todo lo abierto ya tiene `sin_cargo_motivo` de pasadas previas. Candidatos Gmail
  (`newer_than:3d`) y subidas manuales (`_subir_aqui` + raíz 2026): 0 facturas nuevas, solo mensajes
  de huéspedes de Booking (ruido, descartado). Backlog persistente revisado: Endesa Socorro
  P26CON034910794 (ago) ya estaba conciliado por banco (−37,87€, 24/08) desde una pasada anterior,
  se mantiene `Facturas/PDF-pendiente` a propósito (falta el PDF, no el número); Endesa Socorro
  P26CON039980996 (13/09) sigue sin cargo bancario que casar — normal, aún no le toca. dudas: la
  factura ASECON 1804 (150€+IVA=181,50€, «ESTUDIO-PREPARACION-PRESENTACION RENTA», sin pagar según
  su recordatorio del 24/09) sigue en `Facturas/Revisar` sin decidir si es gasto de gestoría
  deducible o gasto personal — para tu decisión, Alberto. fallos: —. PRs/commits: — (sin cambios de
  código; solo `agente_salud` en Supabase).
- **2026-09-27 · mercado-booking** · hizo: pasada diaria completa — 235 comparables reales de
  Booking en las 24 ventanas de mercado del plan (tope `max=24`, quedaron 484 ventanas casando el
  filtro para pasadas siguientes; mayoría fechas de evento Q4 2026/Q1 2027 — FIBES TIS2026, Betis y
  Sevilla FC, calendario); paso 2-bis (escaparate propio) 2/4 ventanas medidas (Dúplex center y
  HOUSE SEVILLANA), 2 sin disponibilidad esas fechas en Booking (Busto Reform, Luxury Busto) — hueco
  del conector, no fallo; 5 anuncios propios de HOUSE SEVILLANA detectados y descartados de los
  comparables de mercado (aforo 12, ventanas 10-06, 01-17, 01-31, 02-07, 02-14) antes de escribir.
  Latido `ok:true`. dudas: —; fallos: —; PRs/commits: — (solo escritura vía `/api/sivra/mercado/ingest`,
  este commit solo anota la bitácora).

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-08-23 · psd2-health-check** · hizo: pasada a petición de Alberto (banner «3 días sin
  movimientos»); feed PSD2 VIVO — las 2 conexiones `vinculada` con sync OK hoy 08:23, último mov
  20/08 (jueves; 21/08 laborable sin movimientos + fin de semana), volumen 30d 54 vs 75 (−28 %,
  bajo el umbral del 50 %); el aviso de Kutxabank ****0855 es `ℹ️` (ventana 89d rechazada, datos
  reales solo desde 24/07) — no es fallo. Veredicto: parón real de actividad, no anomalía técnica
  (corroborado por facturas-correo: tampoco hay PDFs nuevos en Gmail desde el 20/08); sin alerta
  Telegram — Alberto ya estaba mirando el panel. dudas: —; fallos: —; PRs/commits: rama
  `claude/problem-diagnosis-462duc`.
- **2026-08-23 · pricing-agente / mercado-booking** · hizo: seguimiento pedido por Alberto tras el
  arreglo del canal (#1582) — al comprobar que el precio llegaba a Smoobu apareció que **House
  Sevillana no recibió NI UNA fila de `pricing_applied` el 22/08** (los otros tres, 526 entre los
  tres). Causa: `mercado-booking` no entregó ese día (0 filas `booking_mcp` frente a 237/238/239 los
  días 19-21) y el motor elegía corpus por `MAX(search_date)` a secas → ganó una pasada de serper con
  1 comparable plausible de 22 → `datos_insuficientes` → piso saltado en silencio. Arreglado y
  mergeado (#1594): se elige la última pasada con ≥5 plausibles y el salto avisa por Telegram.
  El 23/08 la rutina volvió a entregar (238 comps) y House recuperó 58 comparables plausibles.
  dudas: `apply-auto` no deja latido, así que «0 filas» es ambiguo por diseño — se resolvió
  contrastando el patrón histórico, no con un dato directo; **propuesta para el entrenador: darle
  huella propia en `agente_latidos`**. fallos: el fallo de `mercado-booking` del 22/08 no disparó
  ninguna alerta propia — su latido quedó a 41 h sin latir y nadie lo miró hasta que se buscó la
  causa aguas arriba de otro síntoma. PRs/commits: #1594
- **2026-08-23 · facturas-correo** · hizo: preflight canal alerta OK (200); Vía B: última copia
  `_buzon_pdf` 20/08 (dias_caido=3 por fórmula), pero verificado con búsqueda directa
  (`has:attachment filename:pdf newer_than:3d`) que no ha entrado NINGÚN PDF nuevo en Gmail desde
  entonces — no es corte, `agente_salud` actualizado a `ok=true` con el detalle; backlog
  `PDF-pendiente`/`Revisar`/`Extraccion-fallida` vacío (confirmado por `search_threads`, no por el
  contador de `list_labels`); Paso 4.0 (`v_facturas_sin_cargo`) sin filas `sin_revisar`. 1 candidato
  nuevo: recibo Stripe "Financial Datasets, Inc." 17,78€ (21/08) — API de fundamentales que usa
  `packages/module-trading`/trading-analista → `seguros` (correduría), archivado en Drive
  (08-Agosto-2026, doc de texto por ser recibo HTML sin PDF) + fila en `facturas_drive`; sin cargo
  bancario aún (PSD2 solo llega hasta 20/08) → queda pendiente de conciliar. `_subir_aqui` vacío;
  root de `FACTURAS Apartamentos/2026` sin PDFs huérfanos nuevos (los 20 que hay ya tienen aviso en
  `_DUPLICADOS_BORRAR` de pasadas previas, papelera sin verificar zombis hoy por volumen). dudas: —;
  fallos: —; PRs/commits: — (solo bitácora + BD + Drive).
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-09-27 · pasada semanal (rango 30/08→27/09; ~90 entradas de bitácora procesadas y podadas,
**primera poda que llega a `main` desde el 30/08** — el trigger corrió todos los domingos, pero
sus PRs #2413/#2864/#3131/#3721 mezclaban poda y `SKILL.md`, el automerge los descartaba y nunca
se mergearon; corregido en `SKILL.md` por #3725), más el bloque suelto bajo el header "Entradas pendientes de procesar" que
llevaba semanas sin fusionarse con el resto — unificado en un único flujo). Preflight canal 200 OK.
Sin pendientes en `docs/FEEDBACK-AGENTES.md`. `correduria_asistente_turno`/`_regla` (fuente nueva
del 26/09) sin filas todavía — feature recién nacida, sin señal que dé.

**Retoma y cierra el PR #3131** (draft desde el 20/09, nunca mergeado): su guardarraíl "verifica el
borrado releyendo el archivo" se aplica aquí en `SKILL.md`; su diagnóstico de `buscador-ia` (PR
#2916, swap DeepSeek) ya está mergeado (20/09) y el de `mercado-booking` ("PRIORIDAD TEMPORAL
jul-ago 2027" repitiéndose pese a objetivo cumplido) dejó de aparecer en la bitácora desde el 07/09
— Alberto debió editarlo a mano en el trigger, como pedían las pasadas de esa semana. El propio
#3131 es la prueba en vivo de su guardarraíl: declaró una poda "verificada" el 20/09 y las 52
entradas seguían íntegras porque el PR nunca se mergeó — el archivo, no el commit local, es la
fuente de verdad.

**Diagnóstico por agente (rango 30/08→27/09):**
- 🚩 **`mercado-booking`** — nuevo patrón recurrente 23/09→26/09 (3 pasadas): escaparate propio 0/4
  medido por ventana fija ocupada, latido `ok:false`, 1 Telegram enviado el 25/09 (no repetido el
  26/09, correcto por regla propia de "2 días seguidos"). La causa de fondo (el generador de plan no
  rota la ventana cuando la fija está ocupada) es CÓDIGO fuera de esta skill — que además PROHÍBE a
  la sesión cambiar las fechas del plan por su cuenta — y ya lo tiene cazado la auditoría de HOY
  mismo (PR #3713, mergeado 27/09: "`sivra_mercado_booking` lleva 60,4h sin `ok=true` y va a peor").
  Sin acción de prompt aquí para no duplicar el hallazgo de `/auditoria-diaria`.
- ✅ **`facturas-correo`** — dos patrones repetidos, los dos decisiones de Alberto pendientes, no
  fallos del agente: recibo Fly.io/Manuel Suárez (30/08→01/09, 5 pasadas; ya evaluado como "sin
  acción" por la propia pasada del 30/08, dejó de aparecer después) y la factura ASECON nº1-001804
  (repetida desde julio, última mención 26/09, "2º día consecutivo sin cambios") — el agente hace lo
  correcto en ambos (re-verifica contra banco cada día, no archiva sin confirmar, lo deja en
  `Revisar`/"Para tu decisión"). Sin acción de prompt.
- ✅ **`trading-analista`** — sano; sigue dejando auto-informe cada pasada (el hueco del 30/08/PR
  #1865 quedó cerrado). Único punto fino ya conocido (transcripción manual de velas) sin incidente:
  1 detección propia de datos cruzados (25/09) corregida ANTES de enviar nada.
- Resto (`pricing-agente`, `buscador-ia`, `agente-correduria`, `ialimp-client-health`,
  `psd2-health-check`, `radar-espana`, `fiscal-novedades`, `rrhh-compliance-calendar`,
  `patrimonio-cfo`, `conectores-vigia`, `github-vigia`) — sin patrón de 2+ repeticiones que pida
  tocar el prompt en el rango.
- Revisión transversal: sin contradicciones/redundancias nuevas entre skills; único hallazgo, la
  propia estructura de este archivo (ver arriba).

**Backlog de PRs `claude/*` abiertos: 47** (creció de 43 el 20/09 —PR #3131— y de 2 el 30/08). El
más antiguo: **#2318, abierto el 05/09/2026 (22 días)** — no se cierra en bloque desde aquí (acción
de Alberto, como el precedente del 29/07). Único fix aplicado: guardarraíl anti-falso-hecho en el
paso de poda de esta misma skill (retomado de #3131, PR de esta pasada). dudas: —; fallos: —;
PRs/commits: PR de esta pasada (cierra #3131).

2026-08-30 · pasada semanal (rango 24/08→30/08) · 24 entradas procesadas y podadas
(mercado-booking ×9, facturas-correo ×5, pricing-agente ×2, psd2-health-check, github-vigia,
ialimp-client-health, patrimonio-cfo, buscador-ia, y el auto-informe del entrenador del 23/08).
Backlog de PRs abiertos: **2** (#1803 del 27/08, #1864 del 30/08 — sano, ninguno de 2+ semanas).
Único fix aplicado: paso de auto-informe en `trading-analista/references/pasada-diaria.md` (PR
draft #1865) — la skill nunca instruía dejar rastro en esta bitácora, y llevaba semanas activa
sin ninguna entrada propia (ver entrada de esta pasada arriba).

2026-08-23 · pasada semanal (rango 16/08→23/08) · 20 entradas procesadas y podadas
(mercado-booking ×7, facturas-correo ×6, psd2-health-check ×2, pricing-agente ×2, buscador-ia ×2,
y el auto-informe del entrenador del 16/08). Backlog de PRs abiertos: **4**
(#1514/#1594/#1599/#1600, el más antiguo del 20/08 — sano, ninguno de 2+ semanas). Único fix
aplicado: caveat en `facturas-correo/SKILL.md` sobre comprobar el estado existente antes de
copiar/sobrescribir (2 fallos propios de la semana con la misma raíz — ver entrada de esta pasada
arriba).
- 27/09/2026 · idealista-radar (pasada manual de arranque) · 12/13 núcleos (Huelva 8/9 + Cádiz 4/4), 285 casas escritas, 17 fuera de zona · Matalascañas sin respuesta (bloqueo de permisos en el subagente) · norte validado en local, pendiente de desplegar centros.
