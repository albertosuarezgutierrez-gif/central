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

## Entradas pendientes de procesar (lo más reciente arriba)

- **2026-09-06 · agentes-entrenador** · hizo: pasada semanal (rango real 24/08→05/09 — la
  poda del 30/08 declaró vaciar 24/08→30/08 pero **las entradas seguían en el archivo**: se
  confirma aquí, con las 42 entradas del rango todavía presentes antes de esta pasada, que
  la poda de las dos pasadas anteriores (23/08 y 30/08) **no se aplicó de verdad** pese a
  que ambas la dieron por hecha en su propio texto — no hay forma de saber desde aquí (clon
  superficial) si se perdió en un merge o si el borrado nunca se commiteó; se poda ahora
  íntegro y se añade un guardarraíl a la skill para que no se repita sin verificación (PR
  draft, carril 1 del guardarraíl 1). Sin pendientes en `FEEDBACK-AGENTES.md`. Backlog de
  PRs abiertos: **7** (`claude/*`, el más antiguo #2262 del 04/09 — ninguno de 2+ semanas,
  sano pese a crecer desde los 2 del 30/08). Diagnóstico por agente: **mercado-booking** —
  🚩 la pasada acotada "PRIORIDAD TEMPORAL jul-ago 2027" lleva **7 pasadas seguidas** (29/08,
  30/08, 31/08, 01/09, 03/09, 04/09, 05/09) agotando el cupo diario (24/24 ventanas) en un
  objetivo que el propio agente confirmó cumplido desde el 29-31/08; la línea vive en el
  prompt del TRIGGER programado, fuera del repo, y esta sesión (comprobado con
  `CronList`/`CronCreate`, que solo gestionan cron in-memory de la propia sesión) tampoco
  tiene acceso a ese store — mismo límite que reportaron las 7 pasadas. No es un fix de
  skill: escalado por Telegram para que Alberto la quite a mano de la UI del trigger.
  **facturas-correo** — sano; la única duda repetida (Fly.io de Manuel Suárez sin
  clasificar) sigue siendo decisión pendiente de Alberto, no error del agente (ya
  diagnosticado el 30/08). **pricing-agente** — sano, sin pendientes nuevos. **trading-analista**
  — el hueco de auto-informe detectado el 30/08 (PR #1865) se confirma RESUELTO: la pasada
  del 03/09 ya dejó su entrada propia. **buscador-ia, github-vigia, psd2-health-check,
  ialimp-client-health, rrhh-compliance-calendar, radar-espana, patrimonio-cfo,
  fiscal-novedades** — sanos, sin patrón de 2+ repeticiones. **conectores-vigia** — 1ª pasada
  real (05/09): confirma que el Paso 3 (canario) es estructuralmente imposible sin
  conectores adjuntos, ya documentado por el propio agente en `VIGIA-CONECTORES.md`, sin
  acción nueva de prompt. Revisión transversal: sin contradicciones/redundancias nuevas
  entre skills. dudas: —; fallos: el propio (ver arriba); PRs/commits: rama
  `claude/upbeat-shannon-rdw66d` (PR draft del guardarraíl + esta bitácora/memoria).

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

2026-09-06 · pasada semanal (rango real 24/08→05/09, 42 entradas procesadas y podadas — las
dos podas anteriores, 23/08 y 30/08, se declararon hechas pero **NO se aplicaron**: las
entradas de ese rango seguían todas en el archivo). Sin pendientes en `FEEDBACK-AGENTES.md`.
Backlog de PRs abiertos: **7** (`claude/*`, el más antiguo #2262 del 04/09 — sano, ninguno de
2+ semanas, aunque creció desde los 2 del 30/08). Único fix de skill aplicado: guardarraíl
añadido a esta misma skill para verificar la poda releyendo el archivo antes de dar la pasada
por cerrada (PR draft, rama `claude/upbeat-shannon-rdw66d`). Hallazgo sin PR (no es de skill,
es de trigger externo): la línea "PRIORIDAD TEMPORAL" de `mercado-booking` lleva 7 pasadas
seguidas repitiéndose sin que nadie pueda quitarla desde una sesión — escalado por Telegram.

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
