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
- **2026-09-05 · conectores-vigia** · hizo: primera pasada real (antes solo sembrado a mano);
  confirmó que la rutina corre sin ningún conector adjunto (`enabledInChat:false` en los ~30 de la
  cuenta) → el Paso 3 (canario) es estructuralmente imposible desde aquí, documentado en
  `VIGIA-CONECTORES.md` y `RUTINAS-PROGRAMADAS.md`; higiene de cuenta: Expedia en `needs_reconnect`
  rompe una fuente de `pricing-agente` (degrada, no corta, por diseño resiliente); sin candidatos
  nuevos para H1/H3. dudas: si Alberto quiere pagar la superficie de adjuntar Booking+IBKR
  solo-lectura para poder cumplir el Paso 3 algún mes; fallos: —; PRs/commits: rama
  `claude/vigilant-euler-kgm3ia`.
- **2026-09-04 · mercado-booking** · hizo: 2ª pasada ACOTADA por prioridad temporal (agosto 2026,
  ídem 03/09), `?desde=2027-07-01&hasta=2027-08-31&max=24`. 24 ventanas de mercado medidas (6
  fechas × 4 pisos con aforo correcto) → 240 comps `booking_mcp`, 0 sin respuesta, 0 propios
  colados en mercado. 📐 escaparate: solo 1/4 medido hoy (prop_busto_reform, 85,54€/noche) — los
  otros 3 (`prop_house_sevillana`, `prop_duplex_center`, `prop_luxury_busto`) devolvieron
  `hotel_names_no_availability` (contado como hueco, no como canal cuadrado; el 03/09 sí midió
  4/4, así que es una intermitencia de disponibilidad del conector, no un fallo propio). Cupo
  diario (24 ventanas) agotado en la pasada de prioridad → sin cupo para pasada normal hoy.
  **El objetivo de la línea de prioridad YA estaba cumplido antes de esta pasada** (el propio
  `plan` no lista 2027-07 ni 2027-08 en `meses_sin_bucket`, solo 04/05/06/09) y la entrada del
  03/09 ya lo declaró — la línea de prioridad sigue en el prompt programado porque nadie la ha
  quitado del disparador, no porque falte medición. Recomendado: Alberto retira la línea
  `PRIORIDAD TEMPORAL` del trigger programado.
  dudas: por qué el disparador sigue trayendo la prioridad si ya se cumplió dos veces; fallos: —
  (la falta de 3/4 en escaparate es del conector, no del agente); PRs/commits: — (solo bitácora y
  BD vía endpoints, sin tocar código).
- **2026-09-03 · trading-analista** · hizo: PASO 0 sin huella de hoy (último saldo 02/09 20:16,
  sin fila `trading_pasadas` de hoy) → pasada completa a las 20:15 UTC (disparo normal, no
  repesca). Preflight `/api/internal/alerta` 200. NAV IBKR 33.068,94€ empujado a `/saldo` (sin
  salto >15%). Cartera real (CVX 6 uds, VWCE 188 uds) empujada a `/cartera`, 0 descartadas, track
  OK. `get_account_trades(DAYS_7)` sin operaciones nuevas → `/operaciones` con array vacío +
  latido `trading_operaciones` ok. Velas de los 24 símbolos de la watchlist delegadas a un
  subagente (uno a uno, protocolo anti-barajado) para no cargar el contexto principal con OHLCV —
  mecánico, por la regla de delegación. `/analizar`: 24 analizados, 0
  vetados/descartados/suplantados/divergentes, top-5 cantado con `stopViable`; ninguna idea pasó
  las barreras (concentración, posición ya abierta, tendencia bajista) → 0 compras paper nuevas.
  Contraste de frescura (Yahoo) desfasado 1 día en los 24 símbolos (`sinJuzgar`=24) — cantado en
  Telegram, es la fuente de contraste, no una anomalía de datos. `/puntuar`: 88 puntuadas, 0
  cerradas, 0 stops paper aplicados. Atribución earnings: 36 tesis dentro de ventana (+1,21%
  medio), 0 muestra limpia hoy, 1.812 sin consultar aún. Resumen por Telegram enviado (messageId
  3998). Hoy es jueves, sin bloque de radar/satélite (solo lunes).
  dudas: —; fallos: —; PRs/commits: — (solo bitácora y BD vía endpoints, sin tocar código).
- **2026-09-03 · mercado-booking** · hizo: pasada ACOTADA por prioridad temporal (agosto 2026),
  pedida vía `?desde=2027-07-01&hasta=2027-08-31&max=24`. 24 ventanas de mercado medidas (6 fechas
  × 4 pisos, aforo correcto por piso) → 240 comps `booking_mcp` escritos, 0 sin respuesta, 0
  anuncios propios colados (los 4 propios de la ventana `escaparate` salieron por `hotel_names` y
  se escribieron aparte, no como comps). 4/4 ventanas de escaparate propio medidas también.
  **Objetivo cumplido**: julio-2027 y agosto-2027 llegan a 3 fechas distintas con 10
  comparables/fecha por piso — la línea de prioridad temporal de la skill se retira en este PR.
  Cupo de 24 agotado en la pasada prioritaria; no quedó margen para la pasada normal del resto del
  plan (568 candidatas totales, solo 28 pedidas). dudas: —; fallos: —; PRs/commits: —.
- **2026-09-02 · trading-analista** · hizo: PASO 0 sin huella de hoy (último saldo 01/09 20:16,
  sin fila `trading_pasadas` de hoy) → pasada completa a las 20:15 UTC (disparo normal, no
  repesca). Preflight `/api/internal/alerta` 200. NAV IBKR 32.862,88€ empujado a `/saldo` (sin
  salto >15%). Cartera real (CVX 6 uds, VWCE 188 uds) empujada a `/cartera`, 0 descartadas, track
  OK. `get_account_trades(DAYS_7)` sin operaciones nuevas → `/operaciones` con array vacío +
  latido `trading_operaciones` ok. Velas de los 24 símbolos de la watchlist bajadas por 3
  subagentes en paralelo (protocolo anti-barajado, uno a uno cada uno) para no cargar el contexto
  principal con OHLCV — mecánico, por la regla de delegación. `/analizar`: 24 analizados, 0
  vetados/descartados/suplantados/divergentes, top-5 cantado con `stopViable`; ninguna idea pasó
  las barreras (concentración, posición ya abierta, tendencia bajista) → 0 compras paper nuevas.
  `/puntuar`: 88 puntuadas, 0 cerradas (nadie venció hoy), 0 anuladas, 0 huérfanas. Resumen por
  Telegram enviado (messageId 3951). Hoy es miércoles, sin bloque de radar/satélite (solo lunes).
  dudas: —; fallos: —; PRs/commits: — (solo bitácora y BD vía endpoints, sin tocar código).
- **2026-09-02 · psd2-health-check** · hizo: preflight `/api/internal/alerta` 200 (canal vivo);
  consulta de frescura sobre `movimientos_bancarios WHERE origen='psd2'`: último movimiento
  2026-09-01 (hace 1 día, <48h OK), mov_30d=50 vs mov_30d_prev=68 (no hay caída >50%) → estado
  ✅ OK, sin anomalía, sin alerta enviada. Revisadas también `conexiones_banco.ultimo_avisos`: la
  conexión Kutxabank activa (`vinculada`, sync hoy) solo lleva la nota `ℹ️` ya conocida (ventana de
  89 días rechazada, importa desde 2026-08-03) — no cuenta como fallo; las otras 3 filas con avisos
  sin prefijo son conexiones `sustituida`/`caducada` con syncs de 17/08, ya no activas. dudas: —;
  fallos: —; PRs/commits: — (solo bitácora, sin tocar código).
- **2026-09-01 · facturas-correo** · hizo: pasada diaria (primera desde el 23/08, hueco de 9 días).
  Preflight `/api/internal/alerta` 200. Paso 0: Vía B sana (última copia `_buzon_pdf` hoy mismo,
  `dias_caido=0`); `agente_salud` actualizado. Backlog barrido: `PDF-pendiente` vacío;
  `Extraccion-fallida` tenía 1 hilo (ticket Mercadona reenviado por Pilar, 237,06€ a domicilio) →
  resuelto por cuerpo del correo (personal, entrega en Monte Carmelo), etiqueta quitada; `Revisar`
  tiene 1 hilo sin resolver (recibo Fly.io $6,68 que Manuel Suárez reenvía desde su propio correo —
  no está claro por qué ni si es gasto de Alberto → sigue "Para tu decisión"). Paso 4.0
  (`v_facturas_sin_cargo`): las 8 filas siguen en `revisada_sin_cargo` de pasadas anteriores, 0 en
  `sin_revisar` — nada que reabrir. Paso 1: 0 candidatos nuevos en Gmail (`newer_than:2d`) — el único
  ruido eran mensajes de huéspedes de Booking y la circular del colegio; los 2 correos con factura de
  hoy (IONOS, limpiezascruzz agosto) ya venían con `Facturas/Procesada` puesta por el cron
  `facturas-scan` de plataforma antes de que arrancara esta sesión (`gastos`/`facturas_drive` sin
  filas nuevas en 48h → no verificado si archivó bien; issue conocida y fuera de mi alcance, ver
  bitácora 23/08). `_subir_aqui` y raíz de `FACTURAS Apartamentos/2026` sin PDFs nuevos desde 05/08.
  `_DUPLICADOS_BORRAR`: 21 avisos pendientes, ninguno nuevo desde 17/08 (zombis sin re-verificar hoy,
  igual que la pasada anterior). dudas: Fly.io de Manuel Suárez (Revisar) — ¿por qué te lo reenvía y
  es gasto tuyo?; fallos: —; PRs/commits: — (solo bitácora + `agente_salud` + etiqueta Gmail).
- **2026-09-01 · mercado-booking (pasada acotada, PRIORIDAD jul-ago 2027)** · hizo: mismo plan
  filtrado `?desde=2027-07-01&hasta=2027-08-31&max=24` que ayer (31/08). 238 comps reales en las
  24 ventanas del cupo (6 fechas × 4 pisos: 02/07, 10/07, 27/07 — las 3 mismas de ayer, reescritas
  por ser idempotente — y 01/08 [evento Campeonato Mundial de Remo, factor 1,55], 06/08, 14/08 —
  agosto cambia de fecha frente a ayer, que tenía 24/08 en vez de 01/08). 4/4 ventanas de
  escaparate propio medidas (ayer House Sevillana había dado `escaparateSinRespuesta`; hoy sí
  contestó: 1.198,88€ total/2 noches). 0 ventanas sin respuesta, 0 anuncios propios colados en el
  corpus de mercado, 0 fallos. **Objetivo cumplido — YA lo estaba desde ayer (31/08): ambos meses
  llegan a ≥3 fechas distintas con ≥3 comparables por piso** (hoy con 10 comps/fecha/piso).
  🚩 **Acción pendiente para Alberto/entrenador: quitar el párrafo "PRIORIDAD TEMPORAL (agosto
  2026)" del prompt de la rutina programada** — esta sesión no tiene acceso al store del trigger
  para editarlo ella misma, y al no haberse quitado ayer la pasada de hoy se ha repetido sin
  necesidad (gasto de cupo redundante en julio). Sin cupo restante para la pasada normal (24/24 +
  4/4 escaparate agotados). dudas: —; fallos: —; PRs/commits: — (solo BD + bitácora).
- **2026-09-01 · rrhh-compliance-calendar** · hizo: pasada mensual. Leído `docs/ROADMAP-rrhh.md`;
  9 ítems 🔴 obligatorios pendientes (fichaje RD 8/2019, geolocalización, TSA, art.28 RGPD, canal
  denuncias, informe ITSS, modelo 145, caducidad NIE, borrado RGPD automatizado — PRL ya hecho,
  excluido); 6 ítems 🟠 de monetización pendientes. Nota de urgencia añadida: septiembre =
  inspecciones de trabajo → prioriza fichaje + informe ITSS. Preflight `/api/internal/alerta` 200;
  aviso Telegram enviado (messageId 3888). dudas: —; fallos: —; PRs/commits: commit directo a `main`
  (solo docs).
- **2026-09-01 · fiscal-novedades** · hizo: pasada mensual completa. Paso 1-4 (deducciones): contrastadas
  todas las cifras vigiladas (mínimos, maternidad, FN estatal/andaluza + límites de renta 25k/30k) contra
  BOE/BOJA/AEAT — sin cambios, PGE 2027 aún en preparación (no publicado); sin PR. Paso 5 (ayudas): 1ª
  detección de la ayuda Junta Andalucía 600€/hijo<3 tras 3er hijo — descartada por límite de renta (base
  ~46k€ >> tope 6× IPREM); 1ª pasada por cliente (`ayudas_perfiles`): Joaquín Jaén con 1 aviso (plan de
  choque hostelería RD 638/2026, hasta 11.000€, plazo 30/09/2026, CNAE sin confirmar) por Telegram +
  INSERT en `fiscal_ayudas`; Sique Brilla sin novedad; Kit Digital sigue sin reabrir. dudas: si el CNAE de
  alta de Joaquín Jaén es 56.21 (catering) o no — decide Alberto/consulta directa; fallos: —;
  PRs/commits: commit directo a `main` (solo docs).
- **2026-09-01 · radar-espana** (primera pasada real vía trigger) · hizo: termómetro con datos
  reales citados (Sevilla capital municipal +8,9% m/m propio + prensa; Asturias +15,4%/Cantabria
  +18,2% interanual; Huelva/Cádiz/Sevilla provincia sin datos declarado); refrescó las 3
  valoraciones `vivienda` con el snapshot nuevo de `mercado_zonas` (29/08); halló que San Julián
  (barrio de Socorro 24) tiene su cupo VUT (7 licencias) agotado — escasez confirmada de la
  licencia viva; BCE con probable subida de tipos el 10/09. dudas: —; fallos: intentó capitalizar
  el enfoque `vut` de Socorro/Dúplex y lo abortó a medio camino — el reparto de limpieza/lavandería
  entre los 4 pisos (`pl-mensual.ts`) no es reconstruible con SQL suelto sin riesgo de fabricar el
  NOI; queda como hueco explícito con la vía correcta apuntada (endpoint que exponga
  `getPLMensual()`). PRs/commits: el de esta rama.
- **2026-08-31 · agentes-entrenador** (2ª pasada dirigida: «revisa que ningún agente tenga huecos
  así») · hizo: barrido de la clase de hueco del caso V4 Flash (traspasos sin dueño, listas
  estáticas sin curación, supuestos sin verificar) sobre los ~17 agentes. Sanos: auditoría
  (reconciliación de cobertura + vigila al vigilante), conectores-vigia, github-vigia,
  fuentes-de-verdad, radar→fiscal. Hallazgos: (1) 🔴 VISIÓN (`llama-3.2-11b-vision` en NIM,
  cliente vivo ialimp) y EMBEDDINGS (`text-embedding-004`) sin vigilante → añadidos al Paso 1
  del buscador-ia; (2) 🟡 SKILLS.md decía «PENDIENTE de trigger» de mercado-booking/radar/CFO
  cuando los 3 existen y corren (verificado list_triggers). dudas: —; fallos: —; PRs: el de esta rama.
- **2026-08-31 · agentes-entrenador** (pasada dirigida, orden de Alberto tras el caso V4 Flash) ·
  hizo: post-mortem (el hueco era de DISEÑO: la delimitación del 09/07 dejó OpenRouter sin dueño
  de descubrimiento — el cron solo elige de listas estáticas y el buscador tenía orden de no
  mirar; el V4 Flash llevaba en catálogo desde el 24/04, 4 meses invisible, y la pasada semanal
  de AYER dijo «sin candidatos» cumpliendo su skill al pie de la letra); arreglo: Paso 1.5 nuevo
  en la skill buscador-ia (watch de OpenRouter: qué sirve DE VERDAD cada slug + descubrimiento),
  lección de slugs, y regla de re-evaluar pines al apagar/encender eslabones. dudas: —; fallos: —;
  PRs: el de esta rama.
- **2026-08-31 · buscador-ia** (pasada dirigida, pregunta de Alberto) · hizo: confirmó DeepSeek V4
  Flash en OpenRouter ($0,086/$0,17 por M) y detectó que nuestro default `deepseek/deepseek-chat`
  es el V3 viejo 3-6× más caro; mini-eval A/B en vivo OK; PR draft con el swap (default + Director +
  PREFERIDOS). Sin Telegram: Alberto estaba en la conversación. dudas: —; fallos: —; PRs: swap V4 Flash.
- **2026-08-31 · facturas-correo** · hizo: pasada completa. Paso 0: Vía B sana (última copia a
  `_buzon_pdf` 29/08, dias_caido=2); Vía A (`gmail-adjuntos`) sigue sin provisionar (conocido).
  `Facturas/PDF-pendiente` vacía. `Facturas/Extraccion-fallida` tenía 1 hilo (Mercadona/Pilar,
  ticket a Monte Carmelo 68, 237,06€) — se pudo leer entero esta vez → `personal` (auto, entrega
  vivienda habitual), sin archivar, etiqueta quitada. Paso 4.0: barrido `v_facturas_sin_cargo`
  2026 → las 8 filas ya estaban `revisada_sin_cargo` (7 Pepephone sin cargo localizado + 1
  CREATE-Socorro duplicada), ninguna `sin_revisar` nueva. Paso 1/1-bis: sin candidatos nuevos en
  Gmail (`newer_than:2d`) ni en `_subir_aqui`; la raíz de `FACTURAS Apartamentos/2026` solo tiene
  sobrantes YA flagueados en `_DUPLICADOS_BORRAR` en pasadas anteriores (no reprocesados, no es
  obligatorio cada pasada). dudas: hilo `Facturas/Revisar` de Manuel Suárez (recibo Fly.io
  6,68$, reenviado 28/08) sigue sin resolver — no es gasto claro de Alberto, no se auto-clasifica;
  lleva 3 días en cola. fallos: —. PRs/commits: (este commit).
- **2026-08-31 · mercado-booking (pasada acotada, PRIORIDAD jul-ago 2027)** · hizo: plan filtrado
  `?desde=2027-07-01&hasta=2027-08-31&max=24` en vez del barrido normal, para cerrar el objetivo
  de ≥3 comparables en ≥3 fechas distintas por piso en esos dos meses (los eventos confirmados sin
  medir se comían el cupo si se priorizaba a ojo). 240 comps reales en las 24 ventanas del cupo (6
  fechas × 4 pisos: 02/07, 10/07, 27/07, 06/08, 14/08, 24/08 de 2027 — 3 fechas por mes y por piso,
  bucket mensual queda elegible en ambos meses). 3/4 ventanas de escaparate propio medidas (Dúplex
  center, Luxury Busto, Busto Reform; House Sevillana 24-26/08/27 sin disponibilidad en Booking →
  contado como escaparateSinRespuesta, no como "canal cuadra"). 0 ventanas sin respuesta, 0 anuncios
  propios colados en el corpus de mercado, 0 fallos. Sin cupo restante para la pasada normal (24/24
  gastadas en la prioridad) — no se corrió hoy. dudas: —; fallos: —; PRs/commits: — (solo BD +
  bitácora, sin cambios de código).
- **2026-08-31 · pricing-agente** · hizo: ciclo semanal completo, los 4 pisos (obligatorio,
  no solo los en vivo). Paso 1: 8/48 fechas muestreadas del ciclo 24/08 se vendieron
  (House Feria a 1767€, pelotazo funcionando); House sept sigue al 43% ocupación a 30d
  vista → NO se revierte target_pctl 0,60 (criterio de reversión del aprendizaje id 76
  seguía sin cumplirse). Paso 2: 5 agentes en paralelo (Booking + fallback lastminute/
  expedia en Semana Santa/Feria) — 12 ventanas/piso + 7 fechas de evento que el guardián
  llevaba 3 días marcando "congelada" (Copa del Rey, San Isidoro, 3 LaLiga, JEID, Mundial
  Remo), ahora con 4 comps/piso cada una. Paso 3 (verificación SQL, no autoinforme):
  comps nuevos hoy en `market_rates` — house=153, busto=150, luxury=150, duplex=148,
  ningún piso a 0. Paso 4: 48 propuestas (p55/p60/p60/p50 según piso) por los raíles en
  dry-run forzado (`ALERTA_TOKEN`); circuit-breaker sano (avg 29,7%, no salta), 48 filas
  en `pricing_decisiones`. Paso 5: aprendizaje escrito (`ciclo_31_08_2026`). Paso 6:
  informe por Telegram con la línea "Comps escritos:" obligatoria (HTTP 200). dudas:
  Luxury Busto 10-oct-2026 el mercado subió a p50=470€ (antes 123-169€ en barridos de
  meses atrás) — esa noche ya vendida a 162€, irrelevante hoy, pero vigilar si se repite
  en fechas cercanas (¿dinámica real de última disponibilidad o ruido de muestra?).
  fallos: —. PRs/commits: (este commit, memoria + bitácora, sin cambios de código).
- **2026-08-31 · buscador-ia** · hizo: pasada semanal completa. Preflight Telegram 200 OK. Watch de
  deprecación de los 4 eslabones activos (Groq/Cerebras/Gemini/Kimi, por WebSearch, sin keys en
  sesión) → todos vivos, sin swaps necesarios; NIM sigue apagado por decisión de Alberto (28/08) y
  fuera de vigilancia activa (sin id que verificar). Descubrimiento: ningún candidato cruza el
  listón calidad/precio (mercado de pago dominado por flagship caros; Qwen3.7 Flash anotado sin
  acción). Sin Telegram (nada urgente). dudas: —; fallos: —; PRs/commits: PR draft con el doc de
  estado (rama `claude/youthful-gates-4oor0p`).
- **2026-08-30 · facturas-correo** · hizo: pasada diaria completa. Paso 0: Vía B sana
  (`dias_caido=1`, última copia `_buzon_pdf` 29/08 IONOS); backlog: `PDF-pendiente` vacío,
  `Revisar` 1 hilo (Fly.io/Manuel Suárez, sigue sin respuesta de Alberto — día 3), y
  `Extraccion-fallida` 1 hilo (Mercadona/Pilar, 237,06€ entrega Monte Carmelo) → resuelto y
  quitada la etiqueta: es personal, claro (no ambiguo pese a venir de Pilar). `agente_salud`
  actualizado. Paso 1: 3 candidatos por keyword de "booking"/"smoobu" en el remitente, los 3
  ruido (mensajería de huéspedes Booking + ticket de soporte Smoobu, no facturas) → etiquetados
  `Procesada`. `_subir_aqui` vacío; raíz `FACTURAS Apartamentos/2026` sin subidas nuevas (los
  PDFs sueltos que quedan son deuda histórica ya con aviso en `_DUPLICADOS_BORRAR` de pasadas
  previas, no reverificado hoy). Paso 4.0: `v_facturas_sin_cargo` sin filas `sin_revisar` — las
  8 pendientes (Pepephone ene-jun, Giraldillo mayo, CREATE-Socorro jun) siguen
  `revisada_sin_cargo`, no reabiertas. Preflight Telegram 200 OK, sin aviso (nada urgente).
  dudas: el Fly.io ($6,68) de Manuel Suárez lleva 3 días en `Facturas/Revisar` sin que Alberto
  diga si es gasto suyo; fallos: —; PRs/commits: este commit.
- **2026-08-30 · mercado-booking** · hizo: pasada PRIORITARIA jul-ago 2027 (2º día seguido,
  mismo prompt programado). Medidas las 24 ventanas del plan acotado (240 comps reales
  `booking_mcp`, 4 pisos × 6 fechas: 02/10/27-jul-27-jul-01-ago[evento Mundial Remo,
  factor confirmado ~1.55x]-06-ago-14-ago) + escaparate 3/4 (House Sevillana sin
  disponibilidad esas fechas → hueco, no fallo). 0 ventanas sin respuesta, 0 propios
  descartados. **Objetivo ya estaba cumplido ANTES de esta pasada**: el plan devolvió
  `meses_sin_bucket: [2027-04,05,06]` — julio y agosto 2027 no aparecen, o sea ya tenían
  bucket mensual elegible (lo dejó hecho la pasada de ayer 29/08). Esta pasada solo refrescó
  el corpus, no cambió el estado. dudas: la línea "PRIORIDAD TEMPORAL" sigue en el prompt
  programado por 2º día — Alberto tiene que quitarla él (fuera del repo, sin acceso desde
  aquí); fallos: 1 timeout SSL transitorio (ventana 07-10/12 duplex_center), reintentado con
  éxito; PRs/commits: este commit.
- **2026-08-29 · facturas-correo** · hizo: Vía B sana (`dias_caido=0`, copió 3 PDFs en 48h);
  backlog `PDF-pendiente`/`Extraccion-fallida` en 0 hilos (verificado por `search_threads`).
  Paso 1: 0 candidatos nuevos (único match, un ticket de soporte de Smoobu, no es factura).
  `_subir_aqui` vacío. Paso 4.0: `v_facturas_sin_cargo` sin filas `sin_revisar` — las 8
  pendientes (Pepephone ene-jun, Giraldillo mayo, CREATE-Socorro jun) siguen
  `revisada_sin_cargo`, no reabiertas. Preflight Telegram 200 OK, sin aviso (nada urgente).
  Pasada en blanco: todo lo de hoy ya lo había cerrado la pasada de ayer (28/08). dudas: el
  Fly.io ($6,68) de Manuel Suárez sigue en `Facturas/Revisar` sin que Alberto haya dicho si es
  gasto suyo; fallos: —; PRs/commits: este commit.
- **2026-08-29 · mercado-booking** · hizo: pasada PRIORITARIA pedida por Alberto para
  julio/agosto-2027 (`?desde=2027-07-01&hasta=2027-08-31&max=24`). Medidas las 24 ventanas
  del plan acotado (280 comps reales `booking_mcp`: 24×10 + 1 ventana extra en agosto ronda 3
  que hizo falta añadir a mano porque el día 1-ago era "evento", no cuenta como fecha normal
  del bucket). **Objetivo cumplido: julio-2027 y agosto-2027 ya tienen ≥10 comparables en 3
  fechas distintas por piso** (bucket mensual elegible en ambos; verificado con
  `meses_sin_bucket` antes/después del plan). Escaparate 3/4 (House Sevillana sin
  disponibilidad esas fechas → hueco, no fallo). Sin cupo para pasada normal del resto del
  plan (572 ventanas totales). dudas: la línea "PRIORIDAD TEMPORAL" vive en el prompt
  programado fuera del repo (no en `docs/RUTINAS-PROGRAMADAS.md`, que solo documenta el
  prompt base) — Alberto tiene que quitarla él, esta sesión no tiene acceso a esa config;
  fallos: —; PRs/commits: este commit.

- **2026-08-28 · ialimp-client-health** · hizo: pasada semanal Sique Brilla (empresa_id
  `05edacff-ea49-42fe-8997-f9369613a845`). PMS sync activo (Smoobu, sin `sync_error`, último
  28/08 15:01, 32 sesiones/24h, 33/7d); 0 programaciones sin cubrir; 0 impagos activos. Todo
  verde, sin aviso Telegram (nada urgente). dudas: —; fallos: —; PRs/commits: este commit.

- **2026-08-28 · mercado-booking** · hizo: 2ª pasada del día (tras la de 13:26, PR #1822).
  Plan pedía 24 ventanas de mercado (de 572 candidatas, todas ronda 1/evento —
  `sin_medir_nunca`, distintas de las de la pasada anterior: 2027-03-23/25 al 2027-04-18/20,
  incluye Sevilla FC vs Deportivo abr-11) + 4 de escaparate propio; medidas las 24 de mercado
  (0 sin respuesta, 240 comps reales escritos con `fuente:"booking_mcp"`; 0 anuncios propios
  colados entre los comparables esta vez). Escaparate 2/4 medido (Dúplex center, Busto Reform);
  House Sevillana y Luxury Busto sin disponibilidad en Booking para sus fechas de refresco →
  2 huecos, no error del conector (el ingest ya distinguía este caso el 27/08). Latido `ok:true`.
  dudas: si dos pasadas el mismo día es el diseño previsto de la rutina o un disparo duplicado
  del scheduler — no se toca la cadencia sin que Alberto lo confirme; fallos: —; PRs/commits: —
  (solo Supabase, sin tocar código).

- **2026-08-28 · github-vigia** · hizo: Paso 2 a mano (3 búsquedas: EIAC/seguros, pricing dinámico VR, SES.HOSPEDAJES). 1 hallazgo: `pvilas/hospedajes` — GPLv3 + Python + muerto (may-2023, 1 mantenedor), NO integrable, pero trae los XSD/WSDL oficiales 3.0.0 cuyos namespaces casan con `module-ses/src/soap.ts` y nosotros no tenemos ninguno; útil como referencia porque no hay sandbox SES. Las otras 2 búsquedas, sin candidatos (EIAC es de TIREA, cerrado → el parser hay que escribirlo; pricing VR es todo comercial). dudas: si los XSD de 3.0.0 siguen vigentes tras el RD 933/2021 — NO se da por bueno, hay que pedirlos al Ministerio; fallos: canal Telegram omitido, esta sesión no tiene PLATAFORMA_URL/ALERTA_TOKEN (no es un 401, es que no existen las envs); PRs/commits: este commit.
- **2026-08-28 · facturas-correo** · hizo: Vía B sana (dias_caido=0), sin backlog en
  `PDF-pendiente`/`Revisar`/`Extraccion-fallida` (verificado por `search_threads`, no por el
  contador de `list_labels`). 4 candidatos de correo: Amazon (mochila escolar) y colegio
  (info comedor) → personal/no-factura, Mercadona vía Pilar (237,06€, entrega Monte Carmelo)
  → personal (se quita `Extraccion-fallida`, ya resuelto). Barrido Paso 4.0: conciliada DIGI
  agosto (76€, turistico_pisos, único cargo exacto); resto del backlog (`Pepephone` ene-jun,
  `Giraldillo` mayo, `CREATE-Socorro` jun) ya estaba `revisada_sin_cargo`, no reabierto.
  dudas: recibo Fly.io ($6,68) reenviado por Manuel Suárez (info@manuelsuarez.es) a Alberto,
  originalmente a manuelsuarezz@gmail.com — no encaja en ningún destino conocido, dejado en
  `Facturas/Revisar` para que Alberto diga si es gasto suyo (¿hosting del CRM de asegura?) o
  solo FYI de Manuel; fallos: —; PRs/commits: —
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
- **2026-08-30 · agentes-entrenador** · hizo: pasada semanal (rango 24/08→30/08, desde la poda
  del 23/08; 24 entradas procesadas y podadas: mercado-booking ×9, facturas-correo ×5,
  pricing-agente ×2, psd2-health-check, github-vigia, ialimp-client-health, patrimonio-cfo,
  buscador-ia, y el auto-informe del entrenador del 23/08). Preflight Telegram 200 OK. Sin
  pendientes en `FEEDBACK-AGENTES.md`. Backlog de PRs abiertos: **2** (#1803 del 27/08,
  #1864 del 30/08 — ambos sanos, ninguno de 2+ semanas). **Hallazgo (carril 2, PR draft
  #1865):** `trading-analista` es la única skill de "Agentes programados" que nunca instruye
  escribir su auto-informe en `AGENTES-BITACORA.md` — 0 entradas suyas en TODO el histórico
  de este archivo pese a llevar semanas con el trigger corriendo (confirmado por
  `docs/SKILLS.md`) y a un volumen alto de PRs de trading esta semana (H9-H15, VWCE #1837,
  cartera paper #1831/#1833); a diferencia de `mercado-booking`, que sí lo instruye en su
  `SKILL.md`. No es fallo de rendimiento del agente, es un hueco del prompt: añadido paso 8
  a `references/pasada-diaria.md`. Diagnóstico del resto (sin acción, sin patrón nuevo de
  2+ repeticiones): **facturas-correo** — sano las 5 pasadas del rango; la única duda
  repetida (recibo Fly.io de Manuel Suárez sin clasificar, 24/28/29-08) es una decisión
  pendiente de Alberto, no un error del agente. **mercado-booking** — sano; el recorte por
  tope de plan sigue siendo capacidad, no bug (ya diagnosticado el 23/08). **pricing-agente**
  — el pendiente de Busto Feria 17-abr se cerró el mismo día (24/08) con el check #10 del
  guardián. **buscador-ia** — WebFetch a los 5 catálogos bloqueado por el proxy toda la
  semana, degradó a WebSearch sin inventar datos; sugiere key de solo-lectura o abrir el
  proxy (decisión de infra de Alberto, no de prompt). **github-vigia** — 1ª pasada del
  trigger nuevo, sin Telegram por falta de envs en su entorno (ya conocido: "nace mudo",
  `docs/CONTEXTO-SESIONES.md` 28/08). **agente-huésped (código, no skill)** — 2 incidentes
  de feedback en vivo (pago auto-enviado, traducción) resueltos el mismo día por la sesión
  que los detectó (PRs #1863/#1862); sin acción del entrenador. Resto sin evidencia en el
  rango: ialimp-client-health, psd2-health-check y patrimonio-cfo (verde, sin dudas/fallos);
  rrhh-compliance-calendar, radar-espana, fiscal-novedades, conectores-vigia (rutinas sin
  disparo en el rango). Revisión transversal: sin contradicciones/redundancias nuevas entre
  skills. dudas: —; fallos: —; PRs/commits: PR #1865 (rama `claude/upbeat-shannon-q2rv5j`).

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
