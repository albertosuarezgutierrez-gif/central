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
- **2026-08-17 · mercado-booking** · hizo: pasada de 12 ventanas (plan `?max=12`, las 12 vírgenes de
  ronda 1 — evento Feria confirmado, 17-23/09/2026 — `prop_luxury_busto`, `prop_house_sevillana`,
  `prop_busto_reform`, `prop_duplex_center`). 120 comps reales escritos (`fuente:"booking_mcp"`),
  0 ventanas sin respuesta, 0 sin precio utilizable, 0 anuncios propios descartados (revisado a
  propósito en la ventana de aforo 12, donde suele colarse el nuestro — esta vez limpio). Quedan
  452 ventanas candidatas sin medir del plan de 464 (aviso del propio endpoint). dudas: —; fallos: —
  (1 SSL transitorio en un POST, resuelto con retry inmediato); PRs/commits: — (solo memoria/BD)
- **2026-08-16 · facturas-correo** · hizo: pasada completa (Paso 0→5). Vía B sana (última copia
  _buzon_pdf 14/08, dias_caido=2, `agente_salud` actualizado). Sin backlog en `PDF-pendiente`/
  `Revisar`/`Extraccion-fallida`. Paso 4.0 (`v_facturas_sin_cargo`): 8 filas, TODAS ya
  `revisada_sin_cargo` (ninguna `sin_revisar`) — nada que trabajar. Candidatos Gmail (`newer_than:2d`):
  1 hilo (mensaje de huésped de Booking, no factura). Sin subidas manuales nuevas en `_subir_aqui` ni
  en la raíz de `2026`. Sin novedades reales que archivar/conciliar hoy. dudas: —; fallos: —;
  PRs/commits: — (solo memoria + `agente_salud`)
- **2026-08-16 · psd2-health-check** · hizo: pasada profunda tras escalado de la auditoría — 🚨 crítica
  confirmada (último mov 10/08, 6 días; 30d 61 vs 72). Hallazgo: sesión EB VIVA (saldo BBVA al 15/08) pero
  `/transactions` seco desde 08-10/08, tragado por `catch(()=>[])`; BBVA …2620 muerta desde 27/06. Fix de
  observabilidad en `lib/psd2.ts` + Telegram del cron (rama `claude/psd2-sync-no-movements-yw0gig`, PR draft).
  Telegram enviado; anotado en CONTEXTO-SESIONES. dudas: causa exacta la dirá la pasada de las 06:00; fallos: —
- **2026-08-16 · agentes-entrenador** · hizo: pasada semanal (rango 09/08→16/08, 27 entradas
  procesadas y podadas). Sin pendientes en `FEEDBACK-AGENTES.md`. Backlog de PRs abiertos: **3**
  (#1436/#1437/#1440, todos de hoy — sano, sigue bajando desde el pico de 73 del 29/07, sin
  crecimiento que escalar). Diagnóstico por agente: **facturas-correo** — el "fallo" repetido 5
  pasadas seguidas (12→16/08, `search_threads label:Facturas/Extraccion-fallida` vacío pese a
  `list_labels` marcando `messagesTotal:1` en Label_16) NO era un bug de la skill: verificado en
  vivo (Gmail MCP) que `search_threads` con el ID, con el nombre con y sin comillas, y con
  `in:anywhere`/`includeTrash` da 0 hilos de forma consistente y reproducible — el contador de
  `list_labels` está desincronizado (quirk conocido de Gmail en etiquetas de uso raro), la búsqueda
  real siempre tuvo razón. Añadida caveat en `SKILL.md` (aditivo, 2 frases) para que la próxima
  pasada no vuelva a anotarlo como fallo. **mercado-booking** y **pricing-agente** — las dos únicas
  dudas/fallos del rango (exclusión del anuncio propio circular; congelación de #1416 con valores
  contaminados) ya estaban resueltas en código/skill antes de esta pasada (`lib/sivra/mercado-propios.ts`,
  `pricing-suelo-pl.ts` + `estado-y-protocolo.md`) — sin acción. Resto de agentes con evidencia en
  rango (ialimp-client-health, psd2-health-check, facturas-correo el resto de pasadas) sin patrones
  repetidos (2+) que justifiquen tocar prompt. Revisión transversal: sin contradicciones ni
  redundancias nuevas entre skills detectadas. dudas: —; fallos: —; PRs/commits: rama
  `claude/upbeat-shannon-hmrhil` (`SKILL.md` de `facturas-correo` + mantenimiento de esta bitácora/
  memoria).

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-08-16 · pasada semanal (rango 09/08→16/08) · 27 entradas procesadas y podadas (mercado-booking
×9, facturas-correo ×8, pricing-agente ×4, ialimp-client-health, psd2-health-check, buscador-ia, y el
auto-informe del entrenador del 09/08). Backlog de PRs abiertos: **3** (#1436/#1437/#1440, todos del
16/08 — sano, sin crecimiento). Único fix aplicado: caveat en `facturas-correo/SKILL.md` sobre el
contador stale de `list_labels` en `Facturas/Extraccion-fallida` (falsa alarma repetida 5 días, ya
diagnosticada — ver entrada de esta pasada arriba).
