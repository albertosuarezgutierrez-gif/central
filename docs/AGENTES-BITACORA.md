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

- **2026-09-26 · mercado-booking** · hizo: pasada de 24 ventanas (max=24, tope dejó fuera 484 de 508
  candidatas) → 238 comps reales escritos (05-31 dic + 1 ene, aforos 2/4/5/12, evento confirmado
  ronda 1). Escaparate propio: 0/4 medido — Busto Reform, Dúplex Center, Luxury Busto y House
  Sevillana dieron `hotel_names_no_availability` para 03-05/03-06 oct (misma ventana fija que ayer,
  mismo motivo: pisos ocupados esas fechas, no fallo del conector). 2 anuncios propios (HOUSE
  SEVILLANA 6 habitaciones) aparecieron en comparables de aforo 12 (27-29 dic y 28-30 dic) y se
  descartaron antes de escribir. Latido `ok:false` por el escaparate en blanco. Es la 2ª pasada
  seguida (25 y 26/09) con escaparate 0/4 por la misma ventana fija ocupada → aviso Telegram enviado
  per regla del SKILL.md (messageId 5321), proponiendo que el plan rote la ventana de escaparate a
  fechas libres cuando la fija está ocupada. dudas: —; fallos: escaparate sin medir 2 días seguidos
  (ver arriba); PRs/commits: — (solo BD vía `/api/sivra/mercado/ingest` + latido + Telegram).
- **2026-09-26 · facturas-correo** · hizo: pasada disparada por el trigger diario. Preflight canal
  200 OK. Paso 0: Vía B sana (copia más reciente en `_buzon_pdf` de ayer 25/09, 1 día caída);
  `PDF-pendiente`/`Extraccion-fallida`/`Luz pendiente 2026` sin backlog (verificado por
  `search_threads`, no por `list_labels`). **Paso 4.0:** `v_facturas_sin_cargo` sigue con las mismas
  20 filas, todas `revisada_sin_cargo` — nada nuevo que barrer. **Paso 1:** sin candidatos deducibles
  nuevos (Booking = mensajes operativos de huéspedes; Global2 = documentación de un siniestro de
  tercero remitida por su gestión, no factura de Alberto; Convocatoria Junta Monte Carmelo = no es
  gasto) — los 7 hilos de ruido quedaron `Facturas/Procesada` para no reaparecer. `_subir_aqui` y
  raíz `2026` sin PDFs nuevos. **Sigue abierto (2º día consecutivo, sin cambios):** la factura ASECON
  nº 1-001804 (06/07/2026, "ESTUDIO-PREPARACION-PRESENTACION RENTA", 181,50€) — comprobado de nuevo
  contra el banco (cuenta de Alberto, jul-sep) y sigue sin cargo a Sabadell/Asecon; deducibilidad
  ambigua (gestoría de la actividad de alquiler vs. gasto personal de la Renta) pendiente de decisión
  de Alberto desde julio. Aviso push enviado (no consta que la pasada de ayer lo hiciera llegar al
  móvil). `agente_salud` actualizado (ok=true, dias_caido=1). dudas: si Asecon-Renta es deducible
  (repetido); fallos: —; PRs/commits: — (solo bitácora + BD + Gmail).
- **2026-09-25 · trading-analista** · hizo: pasada 20:15 normal (paso 0 sin huella de hoy, no
  repesca). Preflight 200 OK, IBKR conectado. NAV 33.504,94€ empujado (sin salto), cartera real
  (CVX+VWCE) y libro de operaciones (0 nuevas) empujados con latido. Analizó 23/24 símbolos:
  `/analizar` vetó **META** por `detectarSuplantaciones` (precio no cuadraba con su referencia
  pero sí con QQQ) — error de transcripción MÍO al copiar velas de `get_price_history` en
  paralelo (el landmine del protocolo, ver skill), cazado correctamente por el guardián del
  servidor sin llegar a contaminar nada. Compras paper nuevas: BKNG, ORCL, SQM. `/puntuar`: 92
  tesis, 1 cerrada por vencimiento de ventana. Telegram enviado (messageId 5295). dudas: para
  9 símbolos de capa C usé solo 21 velas (`ONE_MONTH`) en vez de ~63-120 por ahorrar volumen de
  transcripción manual — `stopViable` salió `null` en BKNG/ORCL por falta de historia, declarado
  como tal en el aviso, no como "riesgo bajo"; el contraste de 2ª fuente (paso 5-ter) no se hizo,
  el conector de datos financieros no está disponible en esta sesión; fallos: la primera pasada
  de fetch en paralelo de 10 símbolos (NFLX/NVDA/NVO/RBLX/SPOT) mezcló los datos entre sí al
  transcribirlos — detectado ANTES de mandar nada (comparando contra refetches individuales) y
  corregido rehaciendo esos 5 uno a uno; ninguna tesis llegó a construirse con datos cruzados.
  PRs/commits: — (solo bitácora + Supabase/Telegram, sin tocar código).
- **2026-09-25 · ialimp-client-health** · hizo: pasada semanal sobre Sique Brilla SL
  (`05edacff-ea49-42fe-8997-f9369613a845`). Preflight canal 200 OK. PMS sync: `pms_connections`
  activa, sin `sync_error`, `last_sync_at` hoy 15:00 UTC; `cleaning_sessions` 75 en 24h / 80 en 7d
  (sano, corre solo — recordatorio del propio SKILL.md: el silencio del cliente en la app no es
  señal aquí, se le retiró el acceso el 01/09). Programaciones sin asignar: 0. Impagos activos:
  0. Todo verde, sin aviso Telegram (nada que reportar). dudas: —; fallos: —; PRs/commits: —
  (solo bitácora, pasada de solo lectura).
- **2026-09-25 · facturas-correo** · hizo: pasada disparada por el trigger diario. Preflight canal 200
  OK. Paso 0: Vía B sana (copia más reciente en `_buzon_pdf` de ayer 24/09, 1 día caída);
  `PDF-pendiente`/`Revisar`/`Extraccion-fallida` sin backlog real (verificado por `search_threads`,
  no por `list_labels`). **Paso 4.0:** las 20 filas de `v_facturas_sin_cargo` siguen todas
  `revisada_sin_cargo`, 0 `sin_revisar` — nada que barrer. **Paso 1** (8 hilos de 2 días): 1 candidato
  real — reaparece la factura ASECON nº 1-001804 (06/07/2026, "ESTUDIO-PREPARACION-PRESENTACION
  RENTA", 181,50€ con IVA) vía un recordatorio de impago del 24/09 ("tenemos la factura pendiente de
  abonar"); nunca se archivó ni concilió en 2,5 meses (`facturas_drive` sin ninguna fila `asecon`,
  pagadera por transferencia a Sabadell, cuenta fuera del feed). Deducibilidad ambigua (¿gestoría de
  la actividad de alquiler o gasto personal de la Renta?) — llevaba ya "Para tu decisión" en pasadas
  de julio sin resolverse nunca; NO archivada, hilo etiquetado `Facturas/Revisar` para que sobreviva.
  Resto del Paso 1: Booking (mensajes operativos de huéspedes, no recibo), Global2/PACTREBOL
  (documentación de terceros/informativa, no factura de Alberto). `_subir_aqui` y raíz `2026` sin
  PDFs nuevos. `agente_salud` actualizado. dudas: si Asecon-Renta es deducible (pendiente de Alberto,
  repetido desde julio); fallos: —; PRs/commits: — (solo bitácora + BD + Gmail).
- **2026-09-25 · mercado-booking** · hizo: pasada de 24 ventanas (max=24, tope dejó fuera 488 de 512
  candidatas; casi todas rondas de profundidad 2-3) → 239 comps reales escritos (mes 27-nov, evento
  confirmado nov-dic-abr, ronda 1). Escaparate propio: 0/4 medido — Busto Reform, Dúplex Center,
  Luxury Busto y House Sevillana dieron `hotel_names_no_availability` para 2026-10-02 (pisos
  ocupados esa ventana, no fallo del conector). 1 anuncio propio (HOUSE SEVILLANA 6 habitaciones)
  apareció en comparables de aforo 12 (25-oct) y se descartó antes de escribir. Latido `ok:false`
  por el escaparate en blanco, per regla del propio SKILL.md. dudas: —; fallos: escaparate sin
  medir esta pasada (ver PSD2/próxima pasada si se repite); PRs/commits: — (solo BD vía
  `/api/sivra/mercado/ingest` + latido).
- **2026-09-24 · trading-analista** · hizo: repesca 23:15 UTC (la de las 20:15 abortó por IBKR caído,
  ver entrada anterior). PASO 0: sin huella de hoy → pasada completa. NAV 33.370,60€ empujado a
  /banca+/trading; cartera real (CVX 6, VWCE 188) y libro (0 nuevas, DAYS_7) empujados con latido.
  Watchlist 24 símbolos, velas 1 a 1 (protocolo anti-barajado respetado) → `/analizar` 23/24 (META
  vetada por suplantación de precio, contraste desfasado normal tras cierre) → `/puntuar` 88 tesis,
  1 cerrada por vencimiento de ventana. Top 5 ideas, ninguna operada (concentración/SMA50/posición ya
  abierta). Telegram enviado (messageId 5231). dudas: —; fallos: META suplantada (no analizada, ya
  cantada); PRs/commits: — (solo BD/Telegram vía canal-aviso).
- **2026-09-24 · trading-analista** · hizo: PASO 0 sin huella (saldo refrescado hace ~24h, sin fila en
  `trading_pasadas` de hoy) → siguió con la pasada de las 20:15 UTC. Preflight `/api/internal/alerta`
  200 OK. Conector IBKR caído: `get_account_summary`/`get_account_positions`/`get_account_trades`
  devolvieron `-32400 "An error occurred. Please try again later."` (reintentado una vez, mismo
  error). Regla de oro respetada: no se inventó NAV ni cifras, no se llamó a `/analizar` ni
  `/puntuar`, no se empujó nada a plataforma. Avisó por Telegram (messageId 5226) y dejó latido
  `trading_operaciones` con `ok:false`. dudas: —; fallos: conector IBKR no disponible en toda la
  pasada; PRs/commits: — (solo BD/Telegram vía canal-aviso).
- **2026-09-24 · mercado-booking** · hizo: pasada de 24 ventanas (max=24, tope dejó fuera 488 de 512
  candidatas totales, casi todas rondas de profundidad 2-3) → 238 comps reales escritos (evento
  confirmado nov-dic, ronda 1). Escaparate propio: 1/4 medido (Busto Reform, 237,31€/2n 1-oct);
  Dúplex Center, Luxury Busto y House Sevillana sin disponibilidad en el portal para esa ventana =
  hueco, no dato. 2 anuncios propios (HOUSE SEVILLANA 6 habitaciones) aparecieron en resultados de
  aforo 12 y se descartaron del corpus de comparables (18-nov, 25-nov). dudas: —; fallos: —;
  PRs/commits: — (solo BD vía `/api/sivra/mercado/ingest` + latido).
- **2026-09-24 · facturas-correo** · hizo: pasada disparada por el trigger diario. Paso 0: Vía B sana
  (copia más reciente en `_buzon_pdf` de hoy, 0 días caída); `Facturas/Extraccion-fallida` mostraba
  `messagesTotal:1` en `list_labels` pero `search_threads` dio 0 hilos — el gotcha ya documentado (el
  contador de esa etiqueta queda desincronizado), no backlog real. **Paso 4.0:** las 20 filas de
  `v_facturas_sin_cargo` están todas `revisada_sin_cargo`, 0 `sin_revisar` — nada que barrer. Los 2
  hilos en `Facturas/PDF-pendiente` (Endesa Socorro, contrato 130139486193) siguen igual que ayer:
  P26CON034910794 (19/08, 36 días) ya conciliado por banco -37,87€, solo falta el PDF que Endesa nunca
  adjunta; P26CON039980996 (22/09, 2 días) sin cargo bancario todavía (no ha entrado en Kutxa). **Paso
  1** (12 hilos de 2 días): ningún candidato nuevo — Global2 (factura de un tercero, AVANZASI SL, por
  un siniestro de correduría, no gasto de Alberto), PACTREBOL/APROMES/colegio (informativos, no
  factura), Booking (mensajes operativos de huéspedes, no recibo), herencia (documentación de póliza,
  no compra). **Paso 1-bis:** `_subir_aqui` vacío; 3 PDFs sueltos en la raíz 2026 (2×"FACTURA JULIO
  SOCORRO" = SIQUE julio, "FACTURA 055 Castuera", Endesa Bustos Luxury feb-mar) ya tenían aviso en
  `_DUPLICADOS_BORRAR` de pasadas anteriores — nada que registrar de nuevo. dudas: —; fallos: —.
  PRs/commits: (este commit).

- **2026-09-23 · facturas-correo** · hizo: pasada disparada por el trigger diario. Paso 0: Vía B sana
  (`_buzon_pdf` con copia de hoy), `PDF-pendiente`/`Revisar` vacíos antes de empezar. **Paso 4.0
  (backlog `facturas_drive` sin cargo, obligatorio):** de 20 filas en `v_facturas_sin_cargo` solo 1
  estaba `sin_revisar` (Anthropic 76,50€ del 08/09) — casaba exacto por `fecha_valor` (no
  `fecha_operacion`) con un movimiento BBVA marcado `duplicado_estado='ignorado'` por un falso
  positivo del auto-dedup (mismo importe+concepto que otro cargo real de fecha distinta, `referencia`/
  `dedupe_hash` diferentes) → conciliado y limpiado el `duplicado_estado`. Al revisar Endesa Socorro
  apareció un GAP que el barrido normal no cubre (mira `facturas_drive`→banco, no al revés): un cargo
  de -37,87€ (24/08, contrato 130139486193) llevaba `Facturas/Procesada` puesto pero nunca se concilió
  ni se archivó PDF (Endesa no manda adjunto, solo enlace externo) → conciliación inversa por banco
  (importe del banco como bueno, `propiedad_id='prop_house_sevillana'`), hilo re-etiquetado también
  `PDF-pendiente` para no perder el archivo cuando alguna vía lo permita. **Paso 1** (2 días): 2
  candidatos reales de 14 hilos — factura Anthropic Ireland/Stripe nueva (recibo 2242-5411, 170,00€,
  22/09, seguros/correduría) archivada en `09-Septiembre-2026`, sin cargo casado (mismo patrón que 4
  hermanas previas: la Mastercard ****5332 no está dada de alta en `cuentas_bancarias` →
  `sin_cargo_motivo='fuera_del_feed'`); y una factura de luz Endesa Socorro nueva (ref. P26CON039980996,
  periodo 31/07-13/09) sin importe ni PDF en el correo (solo enlace) y sin cargo bancario todavía →
  etiquetada `PDF-pendiente`. dudas: si la Mastercard ****5332 de los créditos prepago de Anthropic
  conviene darla de alta en `cuentas_bancarias`/PSD2 para poder conciliar esa serie; fallos: —.
  PRs/commits: (este commit).

- **2026-09-23 · mercado-booking** · hizo: pasada completa de las 24 ventanas pedidas por el plan
  (`?max=24`, sin recorte de filtro — quedaron 488 fuera del tope, esperado) → 223 comps reales
  escritos vía `booking_mcp` (aforo 2/4/5/12, línea sep-2026 + evento 26-29 dic). Paso 2-bis
  (escaparate propio, 4 ventanas de refresco) → 0/4 medidas: los 4 pisos salieron SIN
  disponibilidad en Booking para 24-26 sep con su propio `hotel_names` (coherente con que
  House Sevillana tampoco apareciera como comparable en las búsquedas de mercado de esas mismas
  fechas — está ocupada, no es un fallo del conector). 1 anuncio propio descartado como
  comparable (House Sevillana, ventana 23-25 sep aforo 12). Latido `ok:false` por el
  escaparate sin medir (regla de la skill), aunque el mercado fue perfecto. dudas: si el plan
  debería reintentar el escaparate en fechas distintas cuando las pedidas salen ocupadas, en vez
  de darlas por `escaparateSinRespuesta` sin más; fallos: —. PRs/commits: (este commit).

- **2026-09-23 · psd2-health-check** · hizo: consulta de frescura agregada OK (último mov hoy, sin
  caída de volumen, 0 filas sin fecha), pero al desglosar por banco encontró BBVA sin movimientos
  desde 2026-09-10 (13 días) con sesión Enable Banking CLOSED — la agregación lo tapaba porque
  Kutxabank sigue fresco. Alertó por Telegram y anotó en CONTEXTO-SESIONES.md. dudas: si conviene
  desglosar por banco en la propia consulta del Paso 1 de la skill, no solo en la agregada; fallos: —;
  PRs/commits: commit directo a main (memoria + bitácora).

- **2026-09-22 · facturas-correo** · hizo: pasada tras 3 días sin correr (última 19/09). Paso 0: Vía B
  sana (`_buzon_pdf` con copia de hoy), sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`
  (verificado por `search_threads`, no por `list_labels`). Paso 1 (ventana `newer_than:4d` por el hueco
  de 3 días): 0 facturas deducibles nuevas — Endesa Bustos Reform es solo notificación sin PDF adjunto
  (Endesa no manda PDF de Bustos por email, ya documentado; se imputará por contrato cuando entre el
  cargo), Digimobil/Allianz eran marketing y el PDF de Mapfre de hoy era un folleto ya en Trash de
  Alberto — los 3 hilos reales etiquetados `Facturas/Procesada`. Paso 4.0 (barrido backlog): de 19
  facturas en `v_facturas_sin_cargo`, 18 ya `revisada_sin_cargo` (sin cambios) y 1 `sin_revisar`
  (`anthropic-credit-2791`, 76,50€, 08/09) que dejo SIN conciliar: hay 2 cargos banco de -76,50€
  candidatos (07/09 y 10/09) pero los DOS tienen `duplicado_estado='ignorado'` — ambiguo y con un patrón
  raro (normalmente solo uno de un par queda `ignorado`), así que no auto-confirmo. `agente_salud` y
  latido `facturas_correo` actualizados (ok:true). dudas: por qué los 2 cargos ANTHROPIC IRELAND de
  76,50€ están ambos `ignorado` en vez de uno real+uno duplicado — revisar el import PSD2 de esa
  ventana; fallos: —. PRs/commits: (este commit).

- **2026-09-21 · trading-analista** · hizo: pasada PARCIAL 20:15 UTC (sin huella de hoy en Supabase,
  no era repesca). Completado con éxito: NAV IBKR (33.450,64€) → `/api/trading/saldo`; cartera real
  (CVX+VWCE) → `/api/trading/cartera`; `get_account_trades` 0 nuevas + latido `trading_operaciones` OK.
  NO ejecutado `/analizar`/`/puntuar`: montar el payload de 24 símbolos exige transcribir a mano
  ~121 velas OHLCV/símbolo desde el resultado de `get_price_history` (el MCP no permite volcar a
  fichero ni hay script en el repo que lo automatice) — es el riesgo que el landmine de la skill
  prohíbe explícitamente (transcripción manual envenenando EMA/MACD/RSI/ADX). Al intentarlo detecté
  una transcripción ya incompleta (perdí la vela de hoy de IWM), así que corté antes de mandar
  datos sucios al modelo, en vez de forzar el paso. dudas: si vale la pena escribir un pequeño
  helper en `apps/plataforma` (o un endpoint) que reciba el JSON crudo de `get_price_history` por
  símbolo y arme el payload de `/analizar` server-side, para que la sesión no tenga que transcribir;
  fallos: transcripción manual de OHLCV demostrada poco fiable en este canal — no repetir el intento
  sin ese helper. PRs/commits: — (solo Telegram + esta entrada).

- **2026-09-21 · buscador-ia** · hizo: watch semanal; 🔴 hallazgo crítico — Groq retiró el gratis a
  `openai/gpt-oss-120b` el 11/09/2026 ($0,15/$0,60 por M, 5 fuentes independientes), y es el ÚNICO
  eslabón de la cadena sin presupuesto ni tarifa cargada (con NIM apagado, es el fallback gratis
  real); sin PR (decisión de Alberto), Telegram enviado con recomendación (verificar con llamada
  real o promover Cerebras). Resto de la cadena vivo sin novedad crítica; anotado que
  `gemini-2.5-flash` (1er preferido de `PREFERIDOS.contexto` del Director) se deprecará 16/10/2026,
  aún vivo. dudas: sin `GROQ_API_KEY`/`NVIDIA_API_KEY`/`OPENROUTER_API_KEY` en sesión, hallazgo de
  Groq solo por WebSearch (console.groq.com bloqueado por el proxy, igual que pasadas anteriores) —
  pendiente confirmar con llamada real; fallos: —; PRs/commits: — (solo doc + Telegram, sin código).

- **2026-09-14 · buscador-ia** · hizo: watch semanal; detectó que DeepSeek retiró
  `deepseek/deepseek-v4-flash` (10/09/2026) — enrutaba a v4.1-flash a casi el doble de precio,
  silencioso, en el default de `core-ai`/Director/cron; swap directo a `deepseek/deepseek-v4.1-flash`
  en las 4 referencias + test actualizado, verificado (`pnpm test` core-ai 45/45, `tsc` plataforma
  limpio); anotó riesgo ABIERTO (no descartado) de EOL de la visión NIM y candidato Qwen3.7 Flash
  para próxima pasada; dudas: sin `NVIDIA_API_KEY`/`OPENROUTER_API_KEY` en sesión, todo por
  WebSearch/catálogo público, sin mini-eval en vivo; fallos: —; PRs/commits: PR de esta pasada
  (`claude/buscador-ia-2026-09-14`).

## Entradas pendientes de procesar (lo más reciente arriba)
- **2026-09-24 · mercado-booking** · hizo: pasada diaria completa — 24 ventanas de mercado (todas
  las pedidas por el plan, tope max=24 de 512 candidatas/488 recortadas), 240 comps reales
  escritos con `number_of_adults`=aforo por ventana, 0 sin respuesta, 0 anuncios propios
  detectados entre los resultados de mercado; 0/4 ventanas de escaparate propio medidas (busto_reform,
  duplex_center, luxury_busto, house_sevillana) — las 4 devolvieron `hotel_names_no_availability`
  del conector para 2026-09-25→27, contado como hueco genuino, no como fallo de la rutina; latido
  `ok:false` a propósito (regla del SKILL: escaparate sin medir siempre baja el latido, aunque el
  mercado saliera perfecto). Avisos que trae el plan y no corresponde arreglar aquí (solo mido): 1
  mes sin bucket elegible (2026-09, <3 fechas medidas) y 31 fechas de evento confirmado con corpus
  caducado por antelación. dudas: si Booking sigue sin disponibilidad para esas fechas varios días
  seguidos, el ajuste de channel_markup/cuota_fija se queda con parámetros viejos indefinidamente —
  para tu decisión si hace falta revisar el `nombre_portal` o las fechas de refresco del
  escaparate; fallos: —; PRs/commits: — (solo escritura en `market_rates` vía API, sin cambio de
  código).
- **2026-09-22 · mercado-booking** · hizo: pasada diaria completa — 24 ventanas de mercado (todas
  las pedidas por el plan, tope max=24 de 516 candidatas/492 recortadas), 232 comps reales
  escritos con `number_of_adults`=aforo por ventana; 3/4 ventanas de escaparate propio medidas
  (busto_reform, luxury_busto, house_sevillana) para el ajuste de canal — Dúplex center sin
  disponibilidad en Booking para esas fechas (`hotel_names_no_availability`), contado como hueco,
  no como fallo; 2 anuncios propios descartados de los resultados de mercado (HOUSE SEVILLANA
  ×2, ventanas 11-oct/12pax y 22-sep/12pax) — no contaminaron el corpus; 0 ventanas sin respuesta
  del conector; latido `ok:true`. Avisos que trae el plan y no corresponde arreglar aquí (solo
  mido): 1 mes sin bucket elegible (2026-09, <3 fechas medidas) y 77 fechas de evento confirmado
  con corpus caducado (>7d, el motor las tarifica por canal en vez de por mercado medido) —
  quedan para que la propia acumulación diaria las vaya cubriendo. dudas: —; fallos: —;
  PRs/commits: — (solo escritura en `market_rates`/`pricing_escaparate` vía API, sin cambio de
  código).
- **2026-09-21 · facturas-correo** · hizo: pasada diaria completa (Paso 0→5). Preflight canal
  200 OK. Paso 0: Vía B sana (`dias_caido=3` — fin de semana sin PDFs nuevos desde el viernes
  18/09, dentro de lo normal; `list_labels` marcaba 1 en Extraccion-fallida pero `search_threads`
  a 0, quirk conocido); sin backlog en `PDF-pendiente`/`Revisar`. Paso 1: 5 candidatos Gmail, los
  5 mensajes de huéspedes de Booking (descartados, no factura). Paso 1-bis: sin subidas nuevas en
  `_subir_aqui` ni en la raíz `2026`. Paso 4.0 (barrido obligatorio): 1 `sin_revisar` en
  `v_facturas_sin_cargo` — `anthropic-credit-2791` (76,50€, 08/09) sigue sin cargo casado: los dos
  candidatos bancarios (07/09 y 10/09, mismo importe/concepto) siguen ambos con
  `duplicado_estado='ignorado'`, ambiguo, sin cambios desde la pasada de ayer. Nada que conciliar
  ni archivar hoy; dudas: cuál de los dos cargos Anthropic del 07/09 o 10/09 (si alguno) corresponde
  a esta factura — para tu decisión; fallos: —; PRs/commits: solo esta entrada (sin cambios de
  código ni escritura en `movimientos_bancarios`).
- **2026-09-21 · mercado-booking** · hizo: pasada diaria completa — 24 ventanas de mercado
  (todas las pedidas por el plan, tope max=24 de 520 candidatas/496 recortadas), 233 comps
  reales escritos con `número_of_adults`=aforo por ventana; 4/4 ventanas de escaparate propio
  medidas (busto_reform, duplex_center, house_sevillana, luxury_busto) para el ajuste de canal;
  4 anuncios propios descartados de los resultados de mercado (Busto Reform, Dúplex center,
  HOUSE SEVILLANA ×2) — no contaminaron el corpus; 0 ventanas sin respuesta del conector; latido
  `ok:true`. Avisos que trae el plan y no corresponde arreglar aquí (solo mido): 1 mes sin
  bucket elegible (2026-09, <3 fechas medidas) y 78 fechas de evento confirmado con corpus
  caducado (>7d, el motor las tarifica por canal en vez de por mercado medido) — quedan para que
  la propia acumulación diaria las vaya cubriendo. dudas: —; fallos: —; PRs/commits: — (solo
  escritura en `market_rates`/`pricing_escaparate` vía API, sin cambio de código).
- **2026-09-21 · pricing-agente** · hizo: ciclo semanal completo, los 4 pisos, delegado a 4
  agentes en paralelo (Booking+Trivago±Tripadvisor, 12 ventanas: 10 meses + Semana Santa +
  Feria + Karol G). Comps nuevos verificados con SQL directo: house=117, busto=119,
  luxury=178, duplex=149 (ninguno a 0). Confirmó restaurada la conectividad del Paso 4 (el
  401 de Smoobu /api/rates de los ciclos 14-15/09 ya no está) y el motor despausado; cerró el
  "evento sin identificar" del 11-jun-2027 del ciclo anterior — es Karol G, ya conocido desde
  agosto. 48 propuestas (p50 de mercado) enviadas a `aplicar-propuesta` en dry-run forzado,
  circuit-breaker sano, 48/48 trazadas en `pricing_decisiones`. Aprendizaje escrito
  (`pricing_aprendizaje` id ciclo_21_09_2026) y aviso Telegram enviado (messageId 4906);
  dudas: Paso 1 (medir ciclo anterior) con muestra muy pequeña — los ciclos 14/09 y 15/09 no
  escribieron decisiones reales por los bloqueos, así que solo hay 4 fechas cruzables con
  incomes; fallos: —; PRs/commits: memoria de esta pasada (sin cambio de código).
- **2026-09-20 · agente-correduria** (1ª pasada — sin entrada previa en bitácora, sin baseline
  para delta) · hizo: cartera viva por SQL directo (`seguros.polizas`, criterio
  `esCarteraViva`): 157 pólizas/100 clientes vivas, 110 pólizas/72 clientes EN VIGOR (47 vivas
  canceladas); por compañía Mapfre 30/64 · Occident 46/51 · Allianz 20/27 · Generali 13/14 ·
  Reale 1/1; detectó 18 pólizas 'vigente' con vencimiento ya pasado (CIMA no las ha
  actualizado); 7 vencimientos accionables (ventana −30d, art. 22 LCS) con cliente+objeto+
  fecha; confirmó ingesta CIMA viva (último fichero 18/09, 10 en 7 días); 3 titulares DGSFP
  (4 criterios interpretativos 19/09, prioridades supervisión 2026-2028, plazo Atención al
  Cliente 28/12/2026) vía WebSearch; informe enviado por Telegram (`/api/internal/alerta`,
  messageId 4872); dudas: sin baseline previo no hay delta de altas/bajas real esta pasada;
  fallos: —; PRs/commits: — (Telegram + esta entrada; sin cambio de código).
- **2026-09-20 · facturas-correo** · hizo: pasada diaria completa. Salud Vía B OK (`dias_caido=2`,
  sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida` — `search_threads` a 0 pese a que
  `list_labels` mostraba 1 en Extraccion-fallida, quirk conocido). Barrido 4.0: 1 `sin_revisar` en
  `v_facturas_sin_cargo` (anthropic-credit-2791, 76,50€) — dos candidatos bancarios (09-07 y 09-10)
  ambos `duplicado_estado='ignorado'`, ambiguo, no auto-concilio. Candidato Gmail nuevo: aviso Endesa
  Dúplex (PJ Francisco Molina 4 1C, Ref. P26CON039531100, periodo 07/08-08/09/2026) — SIN PDF
  adjunto (solo enlace al portal); etiquetado Procesada, sin cargo bancario aún (se espera ~24-27/09).
  De paso, conciliación inversa de un cargo Dúplex antiguo huérfano (-86,62€, 24/08, `ADEUDO DE
  ENDESA`): encontré su email (Ref. P26CON034750472, periodo 10/07-07/08/2026, ya Procesada de una
  pasada anterior) y lo concilié (`conciliado=true`, `propiedad_id=prop_duplex_center`,
  `factura_ref` con el periodo). Resto de candidatos Gmail (6) eran mensajes de huéspedes de
  Booking/ticket Smoobu, descartados (no factura). `_subir_aqui` y raíz `2026` sin subidas manuales
  nuevas. Etiqueta `Luz pendiente 2026` con 4 hilos TotalEnergies (abr-jun/2026, contratos viejos SL)
  sin resolver — backlog preexistente de Alberto, no tocado hoy; dudas: el par de cargos Anthropic
  76,50€ (para tu decisión — ver arriba); fallos: —; PRs/commits: solo escritura directa en Supabase
  (`movimientos_bancarios`) + esta entrada, sin PR de código.
- **2026-09-20 · mercado-booking** (2ª pasada del día — otra sesión en paralelo ya había medido
  jun/sep-2027 antes) · hizo: comprobó el plan fresco antes de medir (no duplicó fechas), salió
  rondas 2-3 de profundidad sobre 6 fechas nuevas × 4 aforos (03-05/04/2027, 27-29/10/2026,
  24-26/11/2026, 22-24/12/2026, 26-28/01/2027, 16-18/02/2027), `?max=24` sobre `plan_total 524`
  (candidatas 524, recortadas 500 — el tope sigue sin agotar lo pedido). 237 comps `booking_mcp`
  escritos, 0 ventanas sin respuesta. Paso 2-bis: 4/4 escaparate medidos (Busto Reform, Dúplex
  center, Luxury Busto, House Sevillana — sin huecos hoy). House Sevillana salió como comparable
  de sí misma en las 3 ventanas de aforo 12 con checkin 27/10, 26/01 y 16/02 — descartada del
  corpus en las 3 (ver «No romper»); en la ventana de abril y diciembre no apareció. Avisos del
  plan arrastrados sin cambios: mes 2026-09 sin bucket elegible y 82 fechas de evento confirmado
  con corpus caducado (>7d) que el motor tariﬁca por canal, no por mercado medido — el mismo
  aviso que ya traía la 1ª pasada de hoy; dudas: —; fallos: —; PRs/commits: sin PR — solo
  escritura en `market_rates`/`pricing_escaparate` vía API, este commit solo toca la bitácora.
- **2026-09-20 · mercado-booking** · hizo: pasada completa, 24/24 ventanas de mercado pedidas
  (`?max=24`, plan_total 524, candidatas 524, recortadas 500 — evento KAROL G 13-jun-2027 aforo 12
  + ronda 0 mes-corto y rondas 2/3 profundidad, jun/sep-2027, aforos 2/4/5/12), 240 comps
  `booking_mcp` escritos, 0 ventanas sin respuesta. Paso 2-bis: 3/4 escaparate medidos (Busto
  Reform, Dúplex center, House Sevillana — los 3 detectados y filtrados por el endpoint como
  `propios`); Luxury Busto sin disponibilidad en Booking para 03-05/09/2027
  (`escaparateSinRespuesta`, hueco real no relleno, mismo piso que ya falló el 19/09). House
  Sevillana salió además como comparable de sí misma en la ventana aforo-12 del 19-21/06/2027 —
  descartada del corpus (9/10 comps escritos, ver «No romper»). Avisos del plan arrastrados: 3
  meses sin bucket elegible (2026-09, 2027-06, 2027-09) y 82 fechas de evento confirmado con
  corpus caducado (>7d) que el motor está tarificando por canal, no por mercado medido; dudas: —;
  fallos: 1 timeout SSL puntual en el POST de la ventana 2027-06-22/24 aforo 5 (reintentado con
  éxito, sin pérdida de datos por idempotencia); PRs/commits: sin PR — solo escritura en
  `market_rates`/`pricing_escaparate` vía API, este commit solo toca la bitácora.
- **2026-09-19 · facturas-correo** (2ª pasada del día — otra sesión en paralelo ya había abierto
  #3100 con la primera) · hizo: comprobó PRs abiertos antes de duplicar trabajo (regla global);
  Paso 0 sano (Vía B copió hoy, sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`,
  `agente_salud` refrescado); Paso 1/1-bis sin candidatos nuevos (Gmail 2d y `_subir_aqui`
  vacíos). Paso 4.0: el barrido de #3100 dejó 5 facturas de septiembre (openrouter 25,64$,
  ionos 1,21€, ionos-servidor 5,69€, pricelabs 34,98$, vercel 106,76$) sin motivo — comprobado
  contra el banco (Kutxa+BBVA, sin filtro de importe) que NINGUNA tiene cargo en septiembre →
  marcadas `fuera_del_feed`, mismo patrón que los 4 recibos Anthropic de #3100. Con esto son ya
  **~680-855€/mes en SaaS de negocio invisibles en `/finanzas`** por la tarjeta "...5332" sin
  conectar al feed PSD2. dudas: el recibo Anthropic-credit 76,50€ (08/09) sigue con DOS cargos
  candidatos idénticos (-76,50€ el 07/09 y el 10/09) — no se auto-confirma (regla de varios
  candidatos), pendiente de que Alberto diga a cuál corresponde o si falta un recibo; fallos: —;
  PRs/commits: este commit (complementa #3100, sin tocar sus archivos).
- **2026-09-19 · mercado-booking** · hizo: pasada completa, 24/24 ventanas de mercado pedidas
  (`?max=24`, plan_total 528, candidatas 528, recortadas 504 — ronda 0 mes-corto 07-may-2027 +
  ronda 1 eventos 18-abr a 13-jun-2027, aforos 2/4/5/12), 237 comps `booking_mcp` escritos, 0
  ventanas sin respuesta. Paso 2-bis: 3/4 escaparate medidos (Busto Reform, Dúplex center, House
  Sevillana — los 3 detectados y filtrados por el endpoint como `propios`); Luxury Busto sin
  disponibilidad en Booking para 03-05/09/2027 (`escaparateSinRespuesta`, hueco real no relleno).
  House Sevillana salió además como comparable de sí misma en la ventana aforo-12 del 07-may
  (`propios`, descartada, 9 comps válidos de 10). Latido `ok:true`. dudas: el plan trae 83 fechas
  de evento CONFIRMADO con corpus caducado (>7 días, el motor las tarifica genérico) — no se ha
  medido si el ritmo de 24/día está bajando ese backlog o solo conteniéndolo; fallos: —;
  PRs/commits: — (solo bitácora + BD).
- **2026-09-15 · pricing-agente** · hizo: ciclo semanal completo, 4 pisos (sesión interactiva,
  continuó el 14/09 interrumpido). Cerró Hallazgo 1 del 14/09 (Sentinel) con `canal-aviso.sh`.
  Afinó Hallazgo 2: confirmado en vivo que `/api/rates` de Smoobu 401 en LOS 4 PISOS, no solo
  Busto — `smoobu_sync` (mismo credencial, /api/reservations) funcionó igual de hoy, así que no
  es credencial rota sino scope "Rates" ausente en la key. Corrigió dirección de House Sevillana
  en `pricing_piso_zona` (Bustos Tavera → Calle Socorro 24, landmine ya documentada en CLAUDE.md).
  Paso 2: 4 agentes en paralelo, comps house=143/busto=229/luxury=212/duplex=293, ningún piso a 0.
  Paso 4: 48 propuestas (p50 mercado) enviadas a `aplicar-propuesta`, confirmado bloqueo Smoobu 401
  en los 4 pisos, 0 filas en `pricing_decisiones` (nada fabricado a mano). Paso 5/6 completos
  (`pricing_aprendizaje` id 80, Telegram enviado). dudas: pico sin explicar en 2027-06-11 en los
  4 pisos (2-5x temporada normal, más caro que Semana Santa en 3/4) — preguntado a Alberto si hay
  evento esa semana; fallos: Paso 4 bloqueado 2 ciclos seguidos (14/09 Sentinel, 15/09 Smoobu 401,
  aviso Telegram enviado por umbral del skill); PRs/commits: este commit.
- **2026-09-14 · facturas-correo** · hizo: pasada diaria. Paso 0: Vía B sana (`_buzon_pdf` copió
  12/09, `dias_caido=2`); `PDF-pendiente`/`Revisar`/`Extraccion-fallida` vacías (confirmado por
  `search_threads`); `agente_salud` actualizado ok=true (vía Supabase MCP, sin curl). Paso 4.0:
  11 filas `facturas_drive` ya `revisada_sin_cargo` (sin tocar), 1 `sin_revisar` (OpenRouter
  25,64$, archivada 12/09) sin cargo aún — normal a 2 días. Paso 1: ventana de 2 días solo trajo
  2 hilos no-factura; ampliando a mano hasta 05/09 encontré HUECO real: 4 recibos Anthropic
  ("Prepaid extra usage" 76,50€ 08/09 · 170€×2 09/09 · 170€ 11/09), factura IONOS (1,21€ 09/09,
  vía PayPal) y PriceLabs (34,98$ 08/09, disputa de Alberto por cobro con piso desactivado ya
  resuelta por soporte — cargo correcto, factura por sincronización activa en el ciclo) tenían el
  PDF en `_buzon_pdf` y el hilo YA `Facturas/Procesada` de una pasada anterior, pero nunca se
  archivaron en Drive ni se registraron en `facturas_drive` — archivados ahora en
  `09-Septiembre-2026` + 6 filas nuevas insertadas. Ningún cargo bancario casa exacto (búsqueda
  amplia ±7 días): las 6 quedan pendientes de que entre el movimiento, salvo el recibo de 76,50€
  que tiene DOS candidatos ambiguos sin conciliar en banco (07/09 y 10/09) — no auto-confirmado.
  IKEA reenviado por Pilar (9,46€, KALAS/SKUBB/PRUTA) ya estaba `Procesada` sin archivar de antes
  (correcto: pinta a hogar/niños, ambiguo, no se auto-clasifica). dudas: recibo Anthropic 76,50€
  — qué cargo de los dos le corresponde (falta un recibo que explique el otro). fallos: **(1)
  MISMO bloqueo que `pricing-agente` hoy mismo** — `.claude/mcp-sentinel/` deniega en sombra
  cualquier Bash/curl con `Authorization: Bearer ${ALERTA_TOKEN}` en sesión desatendida →
  preflight del canal de aviso y el latido final (`/api/internal/latido`) INEJECUTABLES; no se
  intentó rodear (confirma que el bloqueo es transversal a toda rutina con el protocolo "Canal de
  aviso"). **(2) gap de proceso**: varios hilos con gasto real llevaban `Facturas/Procesada` sin
  archivar+registrar — el label no garantiza archivo hecho, y el barrido 4.0 no lo detecta porque
  el hilo nunca llegó a `facturas_drive`; para `agentes-entrenador`: quizá convenga que Paso 1
  también barra `label:Facturas/Procesada` reciente contra `_buzon_pdf` sin fila en
  `facturas_drive`, no solo lo no-procesado. PRs/commits: — (solo bitácora + Drive + Supabase, sin
  tocar código).
- **2026-09-14 · pricing-agente** · hizo: Paso 0/1 OK (fundación sana, ciclo anterior 07/09 cruzado
  con incomes, 0/48 fechas muestreadas con income aún — normal). Paso 2 (mercado) completo vía 4
  agentes en paralelo + Supabase directo (fallback de la skill): 120/120/120/114 comps nuevos
  (busto/duplex/luxury/house), 12/12 ventanas cada uno, ningún piso a 0. Paso 3/4/6 NO ejecutados.
  dudas: —; fallos: **(1) BLOQUEO NUEVO Y GRAVE** — el hook `.claude/mcp-sentinel/` deniega en modo
  sombra cualquier Bash/curl con `Authorization: Bearer ${ALERTA_TOKEN}` en sesión desatendida
  (`sensitive_env`, crítico) → Paso 4 (aplicar-propuesta) y Paso 6 (Telegram) inejecutables. Afecta
  a TODA rutina programada que siga el protocolo "Canal de aviso" de `CLAUDE.md` (psd2-health-check,
  ialimp-client-health, etc.), no solo a este agente. No se intentó rodear. **(2) hallazgo aparte**:
  `sivra_rates_snapshot` falla HTTP 401 en los 4 pisos desde 12-13/09 (`agente_latidos`), `sivra_pilot_track`
  ok:false por snapshot viejo, `sivra_pricing_apply` escribió 0 noches en su última pasada (13/09
  23:22 UTC) — repricing en vivo de Busto Reform parado ~3 días. No diagnosticado del todo (logs
  Vercel Pro solo 1 día, no se pudo probar el endpoint por (1)). Avisado a Alberto por PushNotification
  (no Telegram, por (1)). PRs/commits: — (solo bitácora + `pricing_aprendizaje` + memoria).
- **2026-09-12 · facturas-correo** · hizo: pasada diaria completa. Preflight canal 200 OK. Paso 0:
  Vía B sana (`_buzon_pdf` copió hoy mismo, `dias_caido=0`); sin backlog en
  `PDF-pendiente`/`Revisar`/`Extraccion-fallida` (confirmado por `search_threads`, `agente_salud`
  actualizado ok=true). Candidatos Gmail: recibo OpenRouter 25,64$ (21,19$+IVA) → clasificado
  `seguros` (SaaS IA, mismo criterio que Anthropic/FAL.ai), archivado en `09-Septiembre-2026` y
  registrado en `facturas_drive` (aún sin cargo bancario, normal a 0 días); 2 correos IONOS
  "información sobre tu pedido" (dominios grupoasegura.es/.com) descartados — sin importe ni PDF,
  solo confirmación de registro, etiquetados Procesada. Paso 4.0 (`v_facturas_sin_cargo`): 1
  `sin_revisar` (Anthropic 180€, archivada 05/09) reconciliado contra el cargo único del 07/09 (FK
  `facturas_drive.movimiento_id` + `factura_ref`); 9 `revisada_sin_cargo` sin cambios (motivo ya
  fijado, no reabiertas). `_subir_aqui` y raíz `FACTURAS Apartamentos/2026` sin subidas nuevas.
  Papelera `_DUPLICADOS_BORRAR`: 23 avisos pendientes; muestreados los 5 más recientes
  (Petroprix ago., Leroy Merlin, SiQueBrilla julio, 2ª copia FACTURA JULIO SOCORRO, DIGI julio) —
  los 5 ficheros a borrar siguen existiendo, ninguno zombi. dudas: —; fallos: —; PRs/commits: —.
- **2026-09-11 · ialimp-client-health** · hizo: pasada semanal Sique Brilla completa. Preflight canal
  200 OK. `pms_connections`: `sync_error` = "Smoobu API 401" en el intento más reciente
  (`last_sync_at` 11/09 15:00 UTC), pero `cleaning_sessions` sigue moviéndose (51 en 24h / 54 en 7d,
  última 09:50 UTC) — el fallo es del último intento, no un corte total todavía. Programaciones sin
  cubrir: 0. Impagos activos: 0. Aviso ⚠️ enviado por Telegram (messageId 4405) recomendando revisar
  el token/API key de Smoobu antes de que corte la sync entera. dudas: —; fallos: —; PRs/commits: —.
- **2026-09-07 · facturas-correo** · hizo: pasada diaria completa. Preflight canal 200 OK. Paso 0:
  Vía B sana (última copia `_buzon_pdf` 05/09, `dias_caido=2`); sin backlog en
  `PDF-pendiente`/`Revisar`/`Extraccion-fallida` (confirmado por `search_threads`, no por el contador
  de `list_labels`). Paso 4.0 (`v_facturas_sin_cargo`): 9 filas `revisada_sin_cargo` sin cambios + 1
  `sin_revisar` (Anthropic 180€, archivada ayer, sin cargo bancario aún — solo 2 días, no se busca
  aún el motivo). Candidato único del correo: aviso de PriceLabs de próximo cobro 34,98 USD (cargo el
  8/09, periodo 7/08-6/09) — sin PDF adjunto y sin cargo bancario todavía, nada que archivar hoy.
  dudas: PriceLabs seguía facturando 4 semanas después de la baja del 09/08/2026 (se esperaba «como
  mucho una última, de agosto») — a vigilar si vuelve a facturar el mes que viene. `_subir_aqui` y
  raíz de `FACTURAS Apartamentos/2026` sin novedades (mismo backlog de pasadas previas, sin PDFs
  nuevos). fallos: —; PRs/commits: —.
- **2026-09-07 · buscador-ia** · hizo: pasada semanal completa (preflight Telegram 200 OK) + un
  segundo tramo en vivo tras la respuesta de Alberto. 🔴 Hallazgo crítico: `text-embedding-004`
  (embeddings de `ia-cache`) retirado por Google desde el 14/01/2026 — 1ª comprobación real de ese
  eslabón desde que se añadió al watch el 31/08. Impacto real bajo (caché OFF por defecto +
  fail-open). Aviso por Telegram con el hallazgo; Alberto preguntó «solución? openrouter?» →
  investigado que OpenRouter ya tiene endpoint `/embeddings` (`openai/text-embedding-3-small`,
  $0,02/M, `dimensions` configurable) y encaja con la regla permanente OpenRouter-primero
  (24/08) → implementado (`openrouterEmbed` en `packages/core-ai/src/openrouter.ts`, 11 tests;
  `geminiEmbed`/`embeddings.ts` eliminados, sin otro consumidor), testeado (`pnpm test` 639/639,
  `tsc` limpio en plataforma e ia-rest) y mergeado el mismo día. Como la caché nunca sirvió un hit
  real, no hizo falta re-indexar nada. Resto de la cadena (OpenRouter texto, Groq, Cerebras, Kimi,
  visión NIM) confirmado vivo por WebSearch, sin key de proveedor en sesión. Sin candidatos de
  descubrimiento que crucen el listón calidad/precio esta semana.
  dudas: —; fallos: —; PRs/commits: #2459 (mergeado).

- **2026-09-07 · pricing-agente** · hizo: ciclo semanal completo, 4 pisos (obligatorio, no solo los
  EN VIVO). Paso 1: 10/48 fechas del ciclo 31/08 vendidas con income confirmado, sin anomalías
  "sin income" (Feria House 1767€ == propuesta exacta). Paso 2: 4 agentes en paralelo barrieron
  Booking en 12 ventanas/piso (10 meses + Semana Santa + Feria); comps escritos hoy: busto=120,
  duplex=120, luxury=120, house=140 (120+20 Expedia). Paso 4: 48 propuestas a `aplicar-propuesta`
  en dry-run forzado, circuit-breaker sano (36 fechas con cambio, 52,8% medio). dudas: —;
  fallos: 3 de 4 agentes ingestaron comps de Expedia en USD etiquetados como EUR (50 filas
  contaminando Semana Santa/Feria de busto/duplex/luxury) — detectado y BORRADO antes de decidir
  precio, y documentado el landmine en `references/ciclo.md` para que no se repita; PRs/commits:
  ver commit de esta misma pasada.
- **2026-09-06 · facturas-correo** · hizo: pasada diaria completa. Salud Vía B OK (última copia
  2026-09-05, 1 día); sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`. Paso 4.0
  (barrido `v_facturas_sin_cargo`): las 9 filas siguen `revisada_sin_cargo` (Petroprix ago,
  Pepephone ene-jun, CREATE-Socorro dup, Giraldillo may) — nada nuevo que investigar. Candidato
  único del correo: recibo Anthropic Ireland (Max plan, 180,00€, pagado 05/09) → `seguros`
  (correduría, regla ya sembrada) → archivado en Drive `09-Septiembre-2026/2026-09-05_anthropic_180.00EUR.pdf`
  (creada la carpeta del mes, no existía) + fila en `facturas_drive`; cargo bancario aún sin entrar
  (`movimiento_id` NULL, pendiente próxima pasada). Hilo etiquetado `Facturas/Procesada`. Resto de
  candidatos del query eran mensajes de huéspedes de Booking y un ticket de soporte Smoobu, no
  facturas → descartados sin tocar. `agente_salud` actualizado (`ok=true`, `dias_caido=1`).
  dudas: —; fallos: —; PRs/commits: —.

- **2026-09-05 · conectores-vigia** · hizo: primera pasada real (antes solo sembrado a mano);
  confirmó que la rutina corre sin ningún conector adjunto (`enabledInChat:false` en los ~30 de la
  cuenta) → el Paso 3 (canario) es estructuralmente imposible desde aquí, documentado en
  `VIGIA-CONECTORES.md` y `RUTINAS-PROGRAMADAS.md`; higiene de cuenta: Expedia en `needs_reconnect`
  rompe una fuente de `pricing-agente` (degrada, no corta, por diseño resiliente); sin candidatos
  nuevos para H1/H3. dudas: si Alberto quiere pagar la superficie de adjuntar Booking+IBKR
  solo-lectura para poder cumplir el Paso 3 algún mes; fallos: —; PRs/commits: rama
  `claude/vigilant-euler-kgm3ia`.

- **2026-09-05 · mercado-booking** · hizo: 3ª pasada ACOTADA consecutiva por prioridad temporal
  (ídem 03/09 y 04/09), `?desde=2027-07-01&hasta=2027-08-31&max=24`. 24 ventanas de mercado
  medidas (6 fechas × 4 pisos, aforo correcto, incluye evento Campeonato Mundo Remo 01-08) → 240
  comps `booking_mcp`, 0 sin respuesta, 0 propios colados (verificado con sonda dummy). 📐
  escaparate: 1/4 medido (`prop_busto_reform`, 78,09€/noche) — los otros 3 devolvieron
  `hotel_names_no_availability` (hueco de disponibilidad del conector, no fallo). Cupo diario
  agotado en la pasada de prioridad → sin cupo para pasada normal hoy.
  **Confirmado por TERCERA vez: el objetivo YA estaba cumplido antes de esta pasada** (`plan` no
  lista 2027-07 ni 2027-08 en `meses_sin_bucket`, ni antes de medir nada hoy). Las entradas del
  03/09 y 04/09 ya lo declararon y recomendaron quitar la línea `PRIORIDAD TEMPORAL` del
  disparador — sigue sin quitarse porque **no hay herramienta desde esta sesión para editar el
  prompt de un trigger programado del account** (solo cron in-memory de esta sesión, que no es el
  mecanismo real); hace falta que Alberto la quite a mano desde la UI del trigger. Van 3 pasadas
  seguidas gastando el cupo entero de 24 ventanas en repetir una comprobación ya cerrada.
  dudas: —; fallos: — (la disponibilidad 1/4 del escaparate es del conector); PRs/commits: —
  (solo bitácora y BD vía endpoints, sin tocar código).

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
- **2026-09-02 · patrimonio-cfo** · hizo: 1ª pasada ordinaria del ciclo mensual (día 2). Preflight
  Telegram OK. Foto patrimonial con doble lectura de neto (1.772.557€ comparable AVM, casi plano
  vs 24/08; 1.983.706€ "vigente sistema", inflado por un artefacto de método — m2zona superó al
  AVM en House y Monte Carmelo el mismo día, recomendado pedir tasación real). Yields + tabla
  "modelo Socorro" recalculados con P&L 12m fresco (Socorro 11,1%/7,6%, Dúplex 6,5%/6,5%, 4,3x
  menos €/reserva). Contexto nuevo añadido a la reco #4 (euríbor subiendo, BCE probable +25pb
  10/09, encarece la vía "no vender, hipotecar"). Hipoteca: cuota conciliada con el banco, sin
  cambios. Sin recomendaciones nuevas registradas (las #2/#3/#4 siguen abiertas sin decisión).
  Telegram enviado (messageId 3926); `docs/PATRIMONIO-CFO.md` actualizado. ⚠️ Este PR se quedó
  cerrado sin mergear 22 días (hasta el 24/09) — la foto y las cifras de esta entrada son del
  02/09, ya superadas por lo que haya pasado desde entonces; el estado VIVO de `PATRIMONIO-CFO.md`
  lo da la próxima pasada ordinaria, no esta.
  dudas: —; fallos: conector `gmail-adjuntos` no conectó esta sesión (`CONNECTION_CLOSED`) —
  bloqueó abrir el PDF de gastos de adquisición de Monte Carmelo, ya localizado; reintentar
  próxima pasada. PRs/commits: PR #2016.
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
