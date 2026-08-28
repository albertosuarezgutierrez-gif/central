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
- **2026-08-28 · mercado-booking** · hizo: pasada diaria completa. Plan pedía 24 ventanas de
  mercado (de 572 candidatas, todas ronda 1/evento — Sevilla FC-R.Sociedad mar-27, San José,
  Semana Santa abr-27 —, tope max=24 dejó 548 fuera) + 4 de escaparate propio; medidas las 24 de
  mercado (0 sin respuesta, 240 comps reales escritos con `fuente:"booking_mcp"`). 🪞 2 anuncios
  propios («HOUSE SEVILLANA 6 habitaciones») aparecieron entre los resultados de mercado en las
  ventanas 2027-03-21/23 y 2027-03-22/24 (aforo 12) y se descartaron como comparable, no se
  mezclaron. Escaparate 3/4 medido (Busto Reform, Dúplex center, House Sevillana); Luxury Busto
  sin disponibilidad en Booking para su fecha de refresco (24-ago-27) → 1 hueco, no error del
  conector. 6 meses siguen sin bucket elegible (aviso del propio plan: 2026-08, 2027-04/05/06/
  07/08). Latido `ok:true`. dudas: —; fallos: —; PRs/commits: — (solo Supabase, sin tocar código).

- **2026-08-27 · mercado-booking** · hizo: pasada diaria completa. Plan pedía 24 ventanas de
  mercado (de 572 candidatas, todas ronda 1/evento — Betis-Sevilla nov, calendario feb-27, Semana
  Santa abr-27 —, tope max=24 dejó 548 fuera) + 4 de escaparate propio; medidas las 24 de mercado
  (0 sin respuesta, 240 comps reales escritos con `fuente:"booking_mcp"`, ninguno propio mezclado).
  Escaparate solo 2/4 medido (Busto Reform y Dúplex center); House Sevillana y Luxury Busto sin
  disponibilidad en Booking para sus fechas de refresco (04-sep y 24-ago-27) → 2 huecos, no error
  del conector. 6 meses siguen sin bucket elegible (aviso del propio plan: 2026-08, 2027-04/05/06/
  07/08). Latido `ok:true` (mercado completo, escaparate parcial no bloquea el latido). dudas: si
  las fechas fijas de refresco de escaparate para House/Luxury deberían rotar cuando salen
  "sin disponibilidad" dos pasadas seguidas; fallos: 1 POST de ingest devolvió respuesta vacía
  (curl sin error, resuelto con retry inmediato, sin pérdida de datos); PRs/commits: — (solo
  Supabase, sin tocar código).

- **2026-08-27 · facturas-correo** · hizo: pasada diaria. Paso 0: Vía B sana (copias en
  `_buzon_pdf` 25/08 y 27/08, `dias_caido=0`), sin backlog real en `PDF-pendiente`/`Revisar`/
  `Extraccion-fallida` (`search_threads` confirma 0 en las tres; `agente_salud` actualizado).
  Candidatos Gmail 48h: 1 solo hilo (DNI para baja de seguro de moto de un cliente de la
  correduría — no es gasto), cerrado con `Facturas/Procesada`. `_subir_aqui` y raíz de
  `FACTURAS Apartamentos/2026` sin subidas nuevas (los PDFs sueltos que quedan ahí son deuda
  histórica ya cubierta por avisos previos en `_DUPLICADOS_BORRAR`). Paso 4.0 (obligatorio):
  `v_facturas_sin_cargo` solo tenía 1 `sin_revisar` nuevo (DIGI agosto, 76,00€, archivada
  25/08) — su cargo aún no ha entrado en banco (domiciliación anunciada para el 28/08); se deja
  pendiente, no es backlog olvidado. Resto de filas en `revisada_sin_cargo` (Pepephone
  ene-jun, Giraldillo mayo, CREATE duplicada) sin cambios. dudas: —; fallos: —; PRs/commits: —
  (solo Supabase + Gmail).

- **2026-08-26 · psd2-health-check** · hizo: preflight canal alerta 200 OK; consulta frescura
  `origen='psd2'` — último movimiento 2026-08-25 (1 día), mov_30d=52 vs mov_30d_prev=75 (sin
  caída >50%); conexiones activas (`vinculada`) Kutxabank ****0855 y BBVA con `ultimo_sync`
  hoy 06:00 UTC, único aviso vivo es ℹ️ (ventana 89d rechazada, importado desde 2026-07-27) →
  estado ✅ OK, sin anomalía, sin escritura en CONTEXTO-SESIONES.md. dudas: —; fallos: —;
  PRs/commits: — (solo Supabase).
- **2026-08-26 · mercado-booking** · hizo: pasada diaria completa. Plan pedía 24 ventanas de
  mercado (de 516 candidatas, todas ronda 1/evento y nunca medidas antes; tope max=24 dejó 492
  fuera) + 4 de escaparate propio; medidas las 24 (0 sin respuesta) → 240 comps reales escritos
  con `fuente:"booking_mcp"`, ninguno propio mezclado en el mercado; escaparate 4/4 medido (House
  Sevillana, Busto Reform, Dúplex center, Luxury Busto) con `hotel_names` y aforo del piso. Latido
  `ok:true`; dudas: —; fallos: —; PRs/commits: — (solo Supabase, sin tocar código).
- **2026-08-25 · facturas-correo** · hizo: pasada diaria. Paso 0: Vía B sana (última copia a
  `_buzon_pdf` 24/08, 1 día), sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`.
  Paso 4.0 (obligatorio): `v_facturas_sin_cargo` tenía 1 `sin_revisar` (financialdatasets.ai,
  17,78€, archivada 21/08) — casó exacto con el cargo del 24/08, conciliado + FK escrita.
  Candidatos Gmail 48h: pedido Amazon (cosmética, personal) y carta de no renovación de seguro
  de moto de un cliente de la correduría (no es gasto) — ambos sin archivar, etiquetados
  Procesada. `_subir_aqui` vacío. dudas: —; fallos: —; PRs/commits: — (solo Supabase + Gmail).
- **2026-08-25 · mercado-booking** · hizo: pasada diaria completa. Plan pedía 24 ventanas de
  mercado (de 516 candidatas, tope max=24 dejó 492 fuera) + 4 de escaparate propio; medidas las
  24 (0 sin respuesta) → 240 comps reales escritos con `fuente:"booking_mcp"`, ninguno propio
  mezclado en el mercado; escaparate 4/4 medido (House Sevillana, Busto Reform, Dúplex center,
  Luxury Busto) con `hotel_names` y aforo del piso. Latido `ok:true`; dudas: —; fallos: —;
  PRs/commits: —.
- **2026-08-24 · patrimonio-cfo** · hizo: DOSSIER INICIAL fuera de ciclo (pedido por Alberto):
  neto mínimo 1.756.976,88€ declarando estimaciones, yields 12m por activo, 3 recomendaciones
  registradas (#1 bonificación hipoteca/no amortizar, #2 liquidez ociosa, #3 dúplex sin ventana
  hasta el termómetro), 5 preguntas de intake, Telegram OK (msg 3554); de paso nació el canal
  conversacional /patrimonio + botones ptr_ (PR #1648); dudas: gastos con `propiedad IS NULL`
  en `gastos` suman 3,35M€ en 25 filas — parece de otro tenant, NO se usó, conviene aclararlo;
  fallos: termómetro del radar sin medir (1ª pasada 01/09) — escenarios de ciclo no abiertos;
  PRs/commits: PR #1648.
- **2026-08-24 · pricing-agente (seguimiento)** · hizo: cerró el pendiente «Busto Feria 17-abr a 103€
  sin income» (3er ciclo) — era la reserva Airbnb HM9KR9FJFK cancelada el 23/08 que nunca entró en
  `incomes`; auditó los 4 pisos con el predicado de cobertura corregido (`"checkIn"::date`, hay filas a
  las 12:00 UTC) → 0 noches bloqueadas sin explicación; construyó el **check #10 del guardián**
  (detecta+repara noches bloqueadas sin income) y actualizó `references/ciclo.md`;
  dudas: por qué el sync incremental se saltó la reserva del 20/06 (sin backfill pendiente: ya está
  cancelada); fallos: —; PRs/commits: PR #1642.
- **2026-08-24 · facturas-correo** · hizo: pasada diaria completa (Paso 0→5). Preflight canal
  alerta OK (200). Vía B: última copia `_buzon_pdf` sigue en 20/08 (dias_caido=4 por fórmula),
  pero verificado de nuevo con búsqueda directa (`has:attachment filename:pdf newer_than:4d`) que
  sigue sin entrar NINGÚN PDF nuevo en Gmail desde entonces — no es corte (mismo diagnóstico que
  22/08 y 23/08); `agente_salud` actualizado. Backlog `PDF-pendiente`/`Revisar`/`Extraccion-fallida`
  vacío (confirmado por `search_threads`). Paso 1/1-bis: 0 candidatos nuevos (solo 2 hilos ruido de
  mensajería de huéspedes Booking, descartados; `_subir_aqui` y raíz 2026 sin subidas manuales
  nuevas). Paso 4.0 (`v_facturas_sin_cargo`): 1 sola fila `sin_revisar` — el recibo Stripe
  "Financial Datasets, Inc." 17,78€ (21/08, ya archivado el 23/08) — sigue sin cargo en el feed
  PSD2 (fresco hasta hoy 24/08, sin coincidencia por importe/concepto en ±10 días); lo dejo sin
  `sin_cargo_motivo` (aún reciente) para que la próxima pasada lo reintente en vez de cerrarlo.
  Resto de la cola ya estaba `revisada_sin_cargo` de pasadas previas (Pepephone ene-jun, Giraldillo
  mayo, CREATE-Socorro duplicada) — no reabierta. dudas: —; fallos: —. PRs/commits: —
- **2026-08-24 · pricing-agente** · hizo: ciclo semanal completo, los 4 pisos (no solo los en vivo).
  Medí el ciclo anterior (17/08→hoy: House +4 reservas, Dúplex +2, Busto/Luxury 0), sembré mercado
  Booking en 12 ventanas/piso (120 comps/piso, 0 a cero), apliqué dry-run × 4 (200 OK, sin
  circuit-breaker), 48 decisiones en `pricing_decisiones`, aprendizaje escrito. dudas: Busto Feria
  17-abr-2027 sigue "vendida" a 103€ sin income que lo explique, 3er ciclo consecutivo sin resolver —
  necesita mirar Smoobu directamente, fuera de mi alcance. fallos: solo Booking como fuente esta
  semana (Trivago/Tripadvisor no consultados por límite de tiempo, riesgo de mono-fuente). PRs/commits: —
- **2026-08-24 · mercado-booking** · hizo: pasada diaria, plan `?max=24` (516 ventanas candidatas,
  492 recortadas por el tope, `sin_medir_nunca:24` — todas de ronda 1/evento: Navidad-Fin de Año
  25/12-1/01 y Semana Santa 25-27/03). 240 comps reales escritos en `market_rates` (10 por ventana;
  medianas ~90-250€/noche en fechas normales de las 4 fechas de evento navideñas, subiendo con el
  factor 1.4-1.85 hacia Fin de Año, y ~500-800€/noche en Semana Santa). 📐 4/4 ventanas de
  escaparate propio medidas (paso 2-bis, `hotel_names`) → `pricing_escaparate`. 🪞 0 anuncios
  propios colados en las 24 búsquedas de mercado (los 4 propios solo salieron, como se espera, en
  las búsquedas por `hotel_names` del escaparate). ⚠️ 0 ventanas sin respuesta del conector; 0 sin
  precio utilizable. dudas: —; fallos: —; PRs/commits: — (solo escritura vía
  `/api/sivra/mercado/ingest`, sin cambios de código).
- **2026-08-24 · buscador-ia** · hizo: pasada semanal — 5 eslabones cableados (NIM, Groq, Cerebras,
  Gemini, Kimi) verificados vivos por WebSearch (sin keys en sesión, WebFetch a los 5 catálogos
  bloqueado por el proxy — no se pudo repetir el patrón `/v1/models` de la pasada del 22/08);
  descartada una señal ambigua de "End of Support" del NIM autoalojado (no aplica al endpoint
  hosted); 2 candidatos (DeepSeek V4 Pro en NIM, qwen3.6-27b en Groq) anotados sin mini-eval, no
  cruzan el listón de acción. dudas: si el proxy siguiera bloqueando estos dominios en pasadas
  futuras, el watch de deprecación queda permanentemente limitado a WebSearch (menos fiable que
  `/v1/models` con key real) — valorar si dar a este agente una key de solo-lectura o abrir el
  proxy a esos 5 dominios; fallos: —; PRs/commits: sin PR (solo doc); rescatado el 27/08 desde el
  PR #1639, que quedó atascado sin poder mergearse.
- **2026-08-23 · agentes-entrenador** · hizo: pasada semanal (rango 16/08→23/08, 20 entradas
  procesadas y podadas). Sin pendientes en `FEEDBACK-AGENTES.md`. Backlog de PRs abiertos: **4**
  (#1514/#1594/#1599/#1600 — el más antiguo del 20/08, ninguno de 2+ semanas; sano). Diagnóstico
  por agente: **facturas-correo** — 2 fallos propios en la semana con la misma raíz (17/08: copió
  2 duplicados a Drive sin comprobar que ya estaban archivados; 18/08: sobrescribió `factura_ref`
  de un movimiento ya `conciliado=true` sin leer su valor previo) → añadido caveat aditivo en
  `SKILL.md` ("antes de copiar o sobrescribir, comprueba qué hay ya"). **buscador-ia** — el
  incidente del 22/08 (NIM mató `z-ai/glm-5.2` por 410 antes de su EOL anunciada) se resolvió
  aplicando la regla añadida por el entrenador el 17/08 (verificar contra `/v1/models`/llamada
  real antes de dar un id por vivo): confirmado por harness+pg_net antes del swap → la regla
  funcionó, sin acción nueva. **mercado-booking** — el aviso arrastrado de "recorte por tope"
  (464-488 ventanas descartadas/día) se repite a diario pero sin `dudas`/`fallos` marcados por el
  propio agente, es capacidad del plan no un bug → sin acción. **psd2-health-check**,
  **pricing-agente** — incidencias del rango (contradicción Telegram↔panel, fechas
  `no_disponible` sin income) resueltas por PR de código en la misma pasada que las detectó, no
  por patrón de prompt → sin acción. Sin evidencia en el rango para ialimp-client-health,
  rrhh-compliance-calendar, github-vigia, conectores-vigia, fiscal-novedades, radar-espana,
  patrimonio-cfo, trading-analista (estos últimos dos con rutina aún pendiente de trigger).
  **Nota fuera de mi carril** (no es prompt, es código de `apps/plataforma`): el cron
  `facturas-scan` sigue mal-archivando en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` — repetido en
  la bitácora desde el 01/08 (23 días), última vez el 20/08. No lo toco (fuera del alcance de
  esta skill), lo señalo en el aviso Telegram para que no seas tú quien lo destape la próxima vez.
  Revisión transversal: sin contradicciones ni redundancias nuevas entre skills. dudas: —;
  fallos: —; PRs/commits: rama `claude/upbeat-shannon-52n3zw` (`SKILL.md` de `facturas-correo` +
  mantenimiento de esta bitácora/memoria).

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

2026-08-23 · pasada semanal (rango 16/08→23/08) · 20 entradas procesadas y podadas
(mercado-booking ×7, facturas-correo ×6, psd2-health-check ×2, pricing-agente ×2, buscador-ia ×2,
y el auto-informe del entrenador del 16/08). Backlog de PRs abiertos: **4**
(#1514/#1594/#1599/#1600, el más antiguo del 20/08 — sano, ninguno de 2+ semanas). Único fix
aplicado: caveat en `facturas-correo/SKILL.md` sobre comprobar el estado existente antes de
copiar/sobrescribir (2 fallos propios de la semana con la misma raíz — ver entrada de esta pasada
arriba).
