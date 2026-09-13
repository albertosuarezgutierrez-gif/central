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
- **2026-09-13 · agentes-entrenador** · hizo: pasada semanal (rango real 24/08→13/09 — la poda
  quedó pendiente 2 semanas: la pasada del 06/09 (PR #2413) diagnosticó todo el rango 24/08→05/09
  y propuso el guardarraíl de verificación post-poda, pero el PR se quedó en DRAFT sin mergear y con
  `mergeable_state:dirty` contra el `main` de hoy; se incorpora su diagnóstico, se extiende a las
  entradas nuevas del 06/09→12/09, y se cierra #2413 como superado por esta rama en vez de dejarlo
  pudrirse). **Verificado RELEYENDO el archivo tras podar** (aplicando ya el guardarraíl que este
  mismo PR añade a la skill): 0 entradas del rango 24/08→12/09 quedan en el archivo. Preflight
  Telegram 200 OK. Sin pendientes en `docs/FEEDBACK-AGENTES.md`.
  🚩 **Hallazgo principal, SIN PR de skill posible — escalado por Telegram:** la pasada acotada
  "PRIORIDAD TEMPORAL jul-ago 2027" de `mercado-booking` sigue repitiéndose (última confirmada, PR
  #2757 del 12/09: "4ª+ confirmación" en su propio texto — pero contando desde el 29/08 son ya
  10+ pasadas) agotando el cupo diario en un objetivo que el propio agente confirmó cumplido desde
  el 31/08. Vive en el prompt de un TRIGGER programado externo al repo que ninguna sesión Claude
  puede editar (confirmado otra vez, mismo límite que las 10 pasadas anteriores ya reportaron). Es
  una escalada REPETIDA sin resolver desde el 29/08/2026 — necesita que Alberto la quite a mano de
  la UI del trigger; ninguna sesión de este entrenador puede hacerlo por él.
  **Backlog de PRs `claude/*` abiertos: creció a 19** (el más antiguo #2262 del 04/09/2026 — aún
  ninguno de 2+ semanas, pero el total casi se triplicó desde los 7 del 06/09 y los 2 del 30/08;
  nombrado tal como pide el paso 6 cuando el total crece).
  Diagnóstico del resto del rango (sin patrón de 2+ repeticiones que justifique tocar un prompt):
  **facturas-correo** — sano en las 8 pasadas del rango (incluidas 06, 07 y 12/09); la única duda
  repetida (PriceLabs sigue facturando tras la baja del 09/08) es informativa, no un error del
  agente. **pricing-agente** — 3 de 4 agentes en paralelo ingestaron comps de Expedia en USD
  etiquetados como EUR el 31/08, detectado y BORRADO en la MISMA pasada antes de decidir precio +
  landmine documentado en `references/ciclo.md`; ocurrencia única, sin patrón nuevo. **buscador-ia**
  — detectó `text-embedding-004` (Gemini) retirado por Google desde el 14/01/2026, swap a
  `openrouterEmbed` mergeado el mismo día (#2459, verificado `pnpm test` 639/639); el watch añadido
  el 31/08 funcionó a la primera comprobación real — sin acción, la regla ya cubre el caso.
  **ialimp-client-health** — `sync_error` "Smoobu API 401" en el último intento de Sique Brilla
  (11/09), aviso Telegram enviado (msg 4405) recomendando revisar el token antes de que corte la
  sync entera; sin cortar aún (`cleaning_sessions` seguía moviéndose) — a vigilar la próxima pasada,
  no es un hueco de prompt. **trading-analista, psd2-health-check, rrhh-compliance-calendar,
  fiscal-novedades, radar-espana, conectores-vigia, github-vigia, patrimonio-cfo** — sanos o sin
  disparo nuevo en el tramo 06/09→12/09, sin novedad sobre el diagnóstico ya cerrado por #2413.
  Revisión transversal de skills: sin contradicciones ni redundancias nuevas. dudas: —; fallos: el
  propio de la poda arrastrada dos pasadas (ver arriba, ya corregido con el guardarraíl de este PR);
  PRs/commits: esta misma rama (incorpora y cierra #2413).

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

2026-09-13 · pasada semanal (rango real 24/08→13/09/2026 — incorpora el diagnóstico no mergeado de
la pasada del 06/09/2026, PR #2413, y lo extiende a las entradas nuevas hasta el 12/09) · TODAS las
entradas del rango podadas (verificado RELEYENDO el archivo tras editar: 0 quedan — aplicando ya el
guardarraíl de verificación post-poda que este mismo PR añade a la skill). Sin pendientes en
`docs/FEEDBACK-AGENTES.md`. Backlog de PRs `claude/*` abiertos: **19** (el más antiguo #2262 del
04/09/2026 — ninguno de 2+ semanas todavía, pero el total casi se triplicó desde el 06/09 y sigue
subiendo; PR #2413 cerrado como superado por esta rama en vez de dejarlo pudrirse en draft). Único
fix de skill aplicado: guardarraíl de verificación post-poda en esta misma skill (releer el archivo
antes de cerrar la pasada — las podas del 23/08 y 30/08 se declararon hechas y no lo estaban),
carril 2 obligatorio por el guardarraíl 1. Hallazgo sin PR posible (vive en un trigger externo, no
en una skill): `mercado-booking` sigue en "PRIORIDAD TEMPORAL" 10+ pasadas desde el 29/08 sobre un
objetivo cumplido desde el 31/08 — escalado por Telegram, van ya varios avisos sin que se haya
quitado del trigger.

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
