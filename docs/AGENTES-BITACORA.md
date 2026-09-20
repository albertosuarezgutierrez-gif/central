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
- **2026-09-20 · agentes-entrenador** · hizo: pasada semanal (rango real 24/08→19/09 — la poda
  llevaba sin ejecutarse DE VERDAD desde el 23/08 pese a que la nota del 30/08 y el PR #2864
  [`mergeable_state:dirty`, nunca mergeado] la daban por hecha; 52 entradas procesadas y podadas
  esta vez, verificado RELEYENDO el archivo tras el commit — ver detalle en «Última poda» abajo).
  Sin pendientes en `FEEDBACK-AGENTES.md`. **Backlog de PRs `claude/*` abiertos: 43** (creció de 19
  el 13/09 y de 2 el 30/08 — el más antiguo, #2262, es del 04/09/2026: **16 días, primera vez que
  cruza el umbral de 2+ semanas**; no se cierran en bloque desde aquí, es acción de Alberto).
  Diagnóstico por agente (sin patrón nuevo de prompt salvo el propio, arriba): **mercado-booking**
  — el párrafo "PRIORIDAD TEMPORAL" del trigger programado sigue repitiéndose (última confirmada
  16/09, PR #3024 sin mergear) pese a que el objetivo se declaró cumplido el 31/08 — más de 3
  semanas y 15+ pasadas gastando el cupo diario en reconfirmar lo mismo; sigue sin ser editable
  desde el repo (vive en el trigger, fuera de código) → reescalado por Telegram, necesita que
  Alberto lo quite a mano de la UI. **buscador-ia** — el PR #2916 (swap `deepseek-v4-flash` →
  `v4.1-flash`, modelo retirado por DeepSeek el 10/09, `mergeable_state:clean`, tests+code-review
  ya OK) lleva 6 días sin mergear: mientras tanto se paga 1,7-3,5× el precio documentado en cada
  llamada vía un alias de compatibilidad que puede desaparecer sin aviso — no es un fallo del
  agente (ya hizo su trabajo), es backlog de merge. **facturas-correo/pricing-agente** — el bloqueo
  de Sentinel (`sensitive_env`) del 14/09 ya está resuelto (`scripts/canal-aviso.sh` + fix en
  `sentinel_preflight.py`, ambos mergeados el 13-14/09); sin recurrencia desde entonces, sin acción.
  Resto de agentes sanos o sin disparo nuevo en el rango. Revisión transversal: sin
  contradicciones/redundancias nuevas entre skills, aparte del hallazgo de poda. dudas: —; fallos:
  —; PRs/commits: PR draft (guardarraíl de verificación releída en `SKILL.md`, cierra #2864) + este
  commit directo (poda + memoria).

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

2026-09-20 · pasada semanal (rango REAL 24/08→19/09/2026) · 52 entradas procesadas y podadas
(mercado-booking ×14, facturas-correo ×12, pricing-agente ×6, buscador-ia ×4, agentes-entrenador ×4,
trading-analista ×2, psd2-health-check ×2, ialimp-client-health ×2, y 1 cada uno de
rrhh-compliance-calendar, radar-espana, patrimonio-cfo, github-vigia, fiscal-novedades,
conectores-vigia).
🔴 **Hallazgo: la poda llevaba sin ejecutarse DE VERDAD desde el 23/08.** La nota del 30/08 (justo
debajo) y el intento posterior en PR #2864 (13/09, `mergeable_state:dirty`, nunca mergeado — que a
su vez decía superar al #2413, tampoco mergeado) declaraban la poda hecha, pero las entradas
seguían íntegras en este archivo hasta hoy: nadie había releído el archivo después de "podar" para
comprobarlo. Corregido esta vez verificando el resultado tras el commit (releído el archivo entero,
0 entradas de la sección procesada sobreviven) y añadido el mismo guardarraíl a `SKILL.md` (PR
draft, cierra #2864).
Backlog de PRs `claude/*` abiertos: **43** (creció de 19 el 13/09 y de 2 el 30/08 — el más antiguo,
#2262, es del 04/09/2026: 16 días, primera vez que cruza el umbral de 2+ semanas). No se cierran en
bloque desde aquí (acción de Alberto, como el precedente del 29/07); los más urgentes nombrados en
el aviso Telegram (#2916 buscador-ia, listo para mergear desde hace 6 días; #2864 superado, se cierra).

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
