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

- **2026-10-10 · mercado-booking** · hizo: 24/24 ventanas de mercado (8/11, 19-21/11, 25/11, 4-8/12; aforos 2/4/5/12; 10 comps c/u = 240) + 5/5 escaparate propio (Dúplex 12-16/10 y 18-20/10, Busto Reform, House Sevillana, Luxury Busto abr-27); medianas guest/noche aprox.: aforo 12 → 8/11 ≈296, 21/11 ≈520, 4/12 ≈650; aforo 2 → 8/11 ≈105, 21/11 ≈103, 6/12 ≈190; dudas: 524 ventanas del plan quedan fuera del tope (13 fechas de evento con corpus viejo); fallos: — (0 propios en mercado, 0 sin respuesta); PRs/commits: —
- **2026-10-08 · facturas-correo** · hizo: Vía B sana (copia 07/10); 13 hilos candidatos revisados, 0 facturas nuevas (Allianz emisión, Booking Finance Overview, Airbnb docs 2024 para Asecon, acta Monte Carmelo = no gasto); barrido 4.0: 3 `sin_revisar` de oct (Sique 1.128,48€, Supabase 25USD, Anthropic 180€) sin cargo exacto aún; PDF-pendiente/Revisar/Extraccion-fallida vacías; latido ok:true; dudas: Anthropic 180€ vs dos cargos de 170€ (01 y 02/10) no cuadran exacto, no auto-confirmado; fallos: —; PRs/commits: —
- **2026-10-07 · trading-analista** · hizo: REPESCA 23:15 UTC (la de 20:15 no arrancó); NAV 34.042,18€→/saldo, cartera (2 pos.)→/cartera, libro 0 nuevas + latido; 24 símbolos de velas (80) uno a uno; /analizar en 2 tandas de 12 (payload >128 KB; PLTR abre paper, MSFT no por concentración); /puntuar 0 puntuadas/0 cerradas; Telegram enviado; dudas: SPCX y VST vetados otra vez como «suplantación» por ABNB, VERIFICADOS contra IBKR (VST 166,25$, SPCX 168,50$): falso positivo de la guardia con saltos reales (propuesta: tolerar si el precio vivo de IBKR lo confirma); fallos: `canal-aviso.sh` no admite payloads >128 KB (limite arg) y un POST por fichero fue denegado por MCP Sentinel (falso positivo exfiltración) → hace falta un `canal-aviso.sh` con `@fichero`; PRs/commits: —
- **2026-10-07 · facturas-correo** · hizo: Vía B sana (copia 06/10); 11 candidatos Gmail, sin archivar nada nuevo (Sique 1.128,48€, Supabase 25USD y Anthropic 180€ ya en `facturas_drive`, cargo aún sin entrar → siguen `sin_revisar`); leídos Giraldillo AFV-11808 (72,60€, 31/07, Socorro, forma pago PENDIENTE, sin cargo ni fila en `facturas_drive`) y Booking 1664562699 (117,76€, se deduce del pago de Booking → no auto-conciliar); PDF-pendiente Endesa Socorro (P26CON034910794 y P26CON039980996) ya cuadrados por banco (−37,87 / −159,00, conciliados), solo falta PDF; dudas: cargo −56,52€ 25/09 «Adeudo de endesa» sin `propiedad_id` ni conciliar (¿Dúplex?), Giraldillo 72,60€ sin archivar; fallos: gmail-adjuntos (Vía A) CONNECT_TIMEOUT (sigue sin provisionar); PRs/commits: —
- **2026-10-06 · trading-analista** · hizo: NAV 34.084,54€→/saldo, cartera (2 pos.)→/cartera, libro 0 nuevas + latido; 24 símbolos de velas (70) por 5 subagentes uno a uno; /analizar 22 analizados, 0 compras; /puntuar 1 cerrada; Telegram enviado; dudas: SPCX y VST vetados como «suplantación» (cierre +15%/+11% frente a su referencia vieja, parecen movimientos reales, no verificado); vela de hoy con volumen parcial y 2ª fuente un día atrasada a las 20:15 UTC; fallos: `canal-aviso.sh` no admite payloads grandes (arg demasiado largo) → usé un POST por fichero desde el scratchpad; PRs/commits: —
- **2026-10-06 · facturas-correo** · hizo: Vía B sana (copia 05/10); 26 candidatos Gmail revisados, archivado Anthropic Receipt 2594-3325 (180€, seguros) en 10-Octubre-2026 + fila `facturas_drive` + etiqueta Procesada; barrido 4.0: Si Que Brilla 1.128,48€ y Supabase 25USD siguen `sin_revisar` (cargo aún no entra, banco hasta 05/10); dudas: ticket bp 06/10 (¿correduría o personal?), cargos Anthropic 170€ del 01 y 02/10 sin factura en `facturas_drive` ni conciliar; fallos: —; PRs/commits: —

- **2026-10-06 · mercado-booking** · hizo: 24/24 ventanas medidas (de 556, 532 recortadas por tope), 224 comps `booking_mcp` escritos (10-oct, 29-oct-2026; 18/30-abr, 1/2-may, 6/14-ago-2027; aforos 2/4/5/12); propio HOUSE SEVILLANA 6 hab. guardado aparte (2 ventanas); dudas: —; fallos: escaparate 0/7 (todas `hotel_names_no_availability`: Busto/Dúplex/Luxury 9-oct y 17-oct, House 17-oct, Luxury 22-26 mar-27) = hueco, latido `ok:false`; PRs/commits: —

- **2026-10-05 · trading-analista** · hizo: REPESCA 23:15 (la de 20:15 solo refrescó saldo); saldo 34.061,68€, cartera real (2 pos.) y operaciones (0) empujadas, /analizar (24 símbolos) y /puntuar (340 puntuadas, 3 cerradas) OK, Telegram enviado; dudas: SPCX vetado como «suplantado» (171,09$ vs ref ABNB) pero su serie IBKR por contrato propio cuadra con su ref del 29/09 y subió +7,3%/+7,6% → falso positivo de la guardia (hueco: salto >14% en 3 sesiones coincide con la ref de otro símbolo); usé velas de 3 meses (63) en vez de ~120; fallos: `/api/internal/latido` no admite agente `trading_analista` (400), Telegram falló una vez por SSL y reenvié; PRs/commits: —

- **2026-10-05 · facturas-correo** · hizo: Vía B sana (copia 05/10), 0 candidatos Gmail nuevos sin procesar (Supabase y limpiezascruzz ya archivados), barrido 4.0: 2 facturas `sin_revisar` (Si Que Brilla 1.128,48€ 03/10; Supabase 25 USD 04/10) sin cargo aún en banco (feed al día 05/10) → se dejan en cola, no se marcan; dudas: —; fallos: —; PRs/commits: —

- **2026-10-05 · mercado-booking** · hizo: 24/24 ventanas medidas (de 556 candidatas, el tope dejó fuera 532), 239 comps `booking_mcp` escritos (2 noches; aforos 2/4/5/12; fechas 06-oct TIS y 09-oct remedidas tras caducar, 05-mar, 26-mar Semana Santa, 15-abr, 08-may, 11-dic); escaparate 2/5 medido (Dúplex 12-14 oct 400,9€; Busto Reform 15-19 abr 1.242,5€); latido ok; dudas: Casa 95 Sevilla 43.977€ (2 noches, aforo 12, 26-mar) omitido por implausible; fallos: 3 ventanas de escaparate sin disponibilidad (Dúplex 06-10 oct, House 12-15 oct, Luxury Busto 22-26 mar 2027) = hueco; 🪞 propio descartado: HOUSE SEVILLANA 6 habitaciones (guardado como escaparate); PRs/commits: —

- **2026-10-05 · pricing-agente** · hizo: ciclo completo 4 pisos con 4 agentes en paralelo; comps escritos (verificado por SQL) house=125, busto=129, luxury=129, duplex=130; 52 propuestas dry-run (13/piso, `agente_ciclo_05_10_2026`), breaker no saltó; medición ciclo 28/09 (vendidas busto 6/12, duplex 6/12, house 6/12, luxury 8/12, sin noches fantasma); aprendizaje `ciclo_05_10_2026`; Telegram enviado; dudas: 16-oct con p50 anómalo en los 4 (¿evento/puente sin catalogar?), `dryRunForzado` no leído en la respuesta del POST; fallos: —; PRs/commits: claude/sharp-wozniak-tskck1

- **2026-10-05 · buscador-ia** · hizo: preflight 200; pasada por WebSearch (sin keys, WebFetch a openrouter.ai/console.groq.com bloqueado); Telegram enviado (gemini-2.5-flash EOL 16/10 en listas contexto/registral, sucesor 3.6-flash $0,75/$3,75; corrección alerta Groq); dudas: Groq free vs pago, las fuentes se contradicen; fallos: —; PRs/commits: solo doc
- **2026-10-05 · conectores-vigia** · hizo: preflight canal 200, ListConnectors, higiene de cuenta, doc actualizado; dudas: Graphify conectado pese a estar retirado; fallos: canario (Paso 3) imposible, todos `enabledInChat:false`; Pasos 0-bis/1/2 no ejecutados en profundidad; PRs/commits: claude/vigilant-euler-7sitkm
- **2026-10-04 · mercado-booking** · hizo: plan max=24 (556 candidatas, 532 recortadas); 24/24 ventanas medidas = 239 comps `booking_mcp` (eventos 25/10 y 1/11 refrescados; meses ene/mar/abr-27). Medianas/noche aprox. aforo 12: 25/10 ≈ 780€, 1/11 ≈ 450€, 9/1/27 ≈ 310€, 13/3 ≈ 545€, 27/3 ≈ 1.000€ (Feria-Semana Santa), 17/4 ≈ 1.000€; escaparate 1/4 (House 11-14/10 = 2.024€ total); dudas: —; fallos: escaparate sin disponibilidad en Busto Reform, Dúplex y Luxury Busto (hueco, 3/4); 1 propio descartado (HOUSE SEVILLANA, aforo 12 25/10); PRs/commits: —
- **2026-10-04 · facturas-correo** · hizo: Vía B sana (última copia 04/10); 4.0 sin filas `sin_revisar` (todas revisada_sin_cargo); archivadas en `10-Octubre-2026` (carpeta creada, id 1uqbZzfYF1EXBzbsm3Vw4Vb-zJNsH_Ttl) SIQUE sept 1.128,48€ (cuadra ×1,21; `limpieza_facturas` ya existía; cargo aún no en banco) y Supabase 25,00 USD, ambas en `facturas_drive` y con `Procesada`; conciliados por contrato/ref 3 cargos Endesa 28/09 (Socorro −159,00, Luxury −108,44, Reform −81,63); Booking/Petroprix ya Procesada; ruido clickedu/checkqrpay/Occident descartado; dudas: destino de Supabase (no hay regla; archivado como SaaS de negocio), cargo Endesa −56,52 del 25/09 sin imputar (¿dúplex? sin email), Socorro P26CON039980996 sigue en PDF-pendiente (solo enlace Endesa, importe por banco); fallos: `gmail-adjuntos` CONNECTION_CLOSED (Vía A caída, no necesaria); Revisar: 1 hilo (Asecon), Extraccion-fallida: 0 por search_threads; PRs/commits: —
- **2026-09-28 · buscador-ia** · hizo: pasada semanal — watch de deprecación (texto/visión/
  embeddings), Paso 1.5 (OpenRouter) y descubrimiento. Hallazgo: `gemini-2.5-flash` (1er preferido
  de `contexto`/`registral` en `PREFERIDOS` del cron `ia-director-refresh`) deja de darse a keys
  nuevas de Google; curado anteponiendo `gemini-3.8-flash` (mismo id ya vivo en la cadena directa)
  en las dos listas, sin retirar el viejo. Groq de pago sin presupuesto sigue abierto (hallazgo del
  21/09, sin novedad esta semana, no se repite Telegram). dudas: —; fallos: —; PRs/commits: ver PR
  de esta rama (`apps/plataforma/app/api/cron/ia-director-refresh/route.ts` + `docs/BUSCADOR-IA.md`).
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

- **2026-10-04 · agentes-entrenador** · hizo: pasada semanal, 0 PRs de prompt (sin patrón repetido atribuible a un prompt), poda de la bitácora en PR propio docs-only; dudas: —; fallos: —; PRs/commits: este PR

## Última poda

2026-10-04 · pasada semanal (rango 27/09→04/10; 16 entradas procesadas y podadas: mercado-booking ×5, facturas-correo ×4, trading-analista ×2, pricing-agente ×1 y resto). Preflight canal 200 OK. Sin cambios de prompt: los patrones de la semana (mercado-booking ok=false por ventana de escaparate ocupada; trading-analista sin disparo desde 29/09; ASECON 181,50€ sin decidir) son de CÓDIGO/rutina o decisión de Alberto, no del prompt (arreglo en #4220).

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
- 29/09/2026 · mercado-booking · 228 comps booking_mcp en 24/24 ventanas (rondas 0-2, sep→abr; 532 en plan, 508 recortadas) · 0/4 escaparate propio: las 4 fichas sin disponibilidad 06-10/oct (latido ok:false) · 2 anuncios propios filtrados (House Sevillana, 12-oct y 8-ene) · 1 SSL transitorio reintentado ok · ojo outlier Mercer 6.400€/2n el 3-oct.
- 30/09/2026 · mercado-booking · 239 comps booking_mcp en 24/24 ventanas (oct→ene; 544 en plan, 520 recortadas) · 0/4 escaparate propio otra vez (sin disponibilidad 9-12/oct; 2º día seguido → alerta enviada) · 🪞 House Sevillana propia vista en 19 y 21-ene (1013€/2n, aforo 12) · 1 reintento HTTP 000 ok · latido ok:false.

### mercado-booking (04/10/2026)
24/24 ventanas de mercado medidas, 238 comps booking_mcp (ventanas 11-oct, 30-oct..3-nov-2026, 6/16/23-may-2027; aforos 2/4/5/12). Escaparate propio 1/4 (House 11-13 oct: 1433€); Busto Reform, Dúplex y Luxury Busto sin disponibilidad (hueco, no "canal cuadra"). 1 anuncio propio descartado (HOUSE SEVILLANA). Tope max=24 dejó 532 ventanas fuera. Latido ok:true (detalle dice 235 comps; real 238).

### 05/10/2026 · sivra_mercado_booking
24 ventanas de mercado (abr-13, may-14, jul-2, jul-27, ago-1, ago-6, ago-24 de 2027; aforos 2/4/5/12) → 238 comps booking_mcp, 0 sin respuesta. Propio House Sevillana descartado en jul-2 y jul-27 (aforo 12). Escaparate 1/5: solo Dúplex 12-15 oct (547,42€); los otros 4 sin disponibilidad (hueco). Latido ok. Quedan 532 ventanas por el tope.

### 10/10/2026 · sivra_mercado_booking
24/24 ventanas de mercado (6-8, 20, 24-25 dic-2026; 27-nov-2026; 13-sep-2027; aforos 2/4/5/12) → 227 comps booking_mcp, 0 sin respuesta. Escaparate propio 4/4 (Busto Reform 127€/n, Dúplex 176€/n, House 767€/n, Luxury Busto 159€/n). Propio House Sevillana en aforo 12 de 8 y 20 dic (apartado por el endpoint). Navidad: House 729€/n el 20-dic vs 420€/n el 8-dic. Quedaron fuera 524 ventanas por el tope.
