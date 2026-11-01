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

- **2026-11-01 · radar-espana** · hizo: valoración Monte Carmelo 540.175€ (−8,2%, ruido del p50 municipal); casco-antiguo sin refrescar desde 29/08 → Socorro/Dúplex no revaluados; regulación VUT sin novedades; dudas: p50 municipal inestable (muestra ~25) sugiere no usarlo como proxy; fallos: —; PRs/commits: doc estado

- **2026-10-31 · facturas-correo** · hizo: Paso 0 salud (Vía B sana, última copia 30/10), candidatos Gmail 2d (6, ninguno factura recibida), 4.0 backlog (1 `sin_revisar`: IONOS 10,90€ 28/10, aún sin cargo; último mov banco 30/10); dudas: —; fallos: pasada PARCIAL — no reintenté 0.b (7 hilos en `PDF-pendiente`/`Revisar`: 5 Endesa, Asecon, Pilar «Cobros septiembre»); latido enviado `ok:false` y respondió `registrado:false`; PRs/commits: —

- **2026-10-29 · trading-analista** · hizo: pasada 20:19 UTC (sin huella previa; NAV 33.827,70€→/saldo sin salto), cartera real (VWCE+CVX)→/cartera, operaciones 0 nuevas + latido, 24 símbolos (80 velas, secuencial, payload 197 KB enviado desde fichero porque el arg de canal-aviso.sh no admite >128 KB) → /analizar (0 compras paper: CHT/CVX por concentración, LLY/RBLX por earnings) y /puntuar (96 puntuadas, 0 cerradas), Telegram enviado (campo `text`, no `mensaje`); dudas: contraste 2ª fuente 'desfasado' en los 24 (solo llega al 28/10, mi serie incluye la vela del 29/10) → sin juzgar; vela del 29/10 con volumen parcial (RVOL bajos); fallos: 3 velas con cierre fuera de [bajo,alto] por 0,03-0,3 en el dato de IBKR (CVX 30/09, LLY 10/08, SPOT 22/07), enviadas tal cual; PRs/commits: —

- **2026-10-29 · facturas-correo** · hizo: Vía B sana; 0 candidatos nuevos por archivar (IONOS 28/10, Digi 27/10 ya en Drive); barrido 4.0: conciliada Digi 76€ (mov. 29/10, FK escrita); dudas: SIQUE 1.128,48€ (transf. 27/10 "factura septiembre" vs factura 03/10, fuera de ±7d, destino=personal) sin tocar; anthropic 180€ e ionos 10,90€ sin cargo aún; fallos: gmail-adjuntos (Vía A) caído; PRs/commits: —

- **2026-10-28 · trading-analista** · hizo: pasada 20:15 UTC (sin huella previa): NAV 33.989,27€→/saldo, cartera real (VWCE+CVX)→/cartera (track ok), operaciones 0 nuevas + latido, 24 símbolos (70 velas, secuencial) → /analizar (23 analizados, 0 compras paper) y /puntuar (0 puntuadas); Telegram enviado; dudas: ORCL vetado como «suplantado» por BKNG pero el cierre 144,31 (+10,5%) es REAL según IBKR → falso positivo de la guardia ante un salto grande; contraste 2ª fuente desfasado (solo cierre 27/10) → todo «sinJuzgar»; fallos: canal-aviso.sh no admite cuerpos grandes (Argument list too long) → usé copia en scratchpad con @fichero; PRs/commits: —
- **2026-10-28 · mercado-booking** · hizo: 24/24 ventanas medidas (plan_total 572, 548 recortadas por tope; rondas 1-3: 24/11/26 evento ASEICA, 10/11/26, 25/05/27, 11-13 y 28-30/09/27, 16/04/27, 27/04/27), 237 comps `booking_mcp` (House: Sevillana propia descartada en 3 ventanas, 9 en vez de 10); escaparate 3/4 (Dúplex center 107€/n, Luxury Busto 103€/n, House 455€/n); dudas: —; fallos: escaparate Busto Reform 24-26/08/27 sin disponibilidad (hueco); el latido dijo 240 comps (real 237); PRs/commits: —

- **2026-10-28 · facturas-correo** · hizo: Vía B sana (última copia 28/10); archivadas en `10-Octubre-2026` IONOS 10,90€ (fra 311101334945, cargo PayPal pendiente) y Digi 76,00€ (cargo 29/10 pendiente) + filas `facturas_drive` (IONOS como `ionos-contrato-111849515` por el unique proveedor/año/mes), etiquetadas Procesada; dudas: backlog `sin_revisar` = SiQue 1.128,48€ (03/10) y Anthropic 180€ (05/10) sin cargo en 54 movimientos de octubre, no marcados; 4 hilos Endesa en `PDF-pendiente` sin tocar; fallos: —; PRs/commits: —
- **2026-10-28 · mercado-booking** · hizo: 24 ventanas de mercado (eventos 31/10, 01/11, 13/11, 18-19/11, 24/11 en aforos 2/4/5/12 + Betis 10/01/27) = 239 comps booking_mcp, 0 sin respuesta; escaparate 3/4 (Luxury Busto 217,82€/2n, House Sevillana 1.761€/4n, Dúplex center 1.206,37€/4n); dudas: —; fallos: escaparate Busto Reform 24-26/08/2027 sin disponibilidad (hueco); 1 propio descartado (HOUSE SEVILLANA en ventana 18-20/11 aforo 12, desviado a escaparate por el ingest); latido ok; plan: 548 de 572 ventanas recortadas por el tope; PRs/commits: —
- **2026-10-27 · trading-analista** · hizo: pasada 20:15 UTC completa (NAV 33.935,23€, cartera, 0 ops nuevas, 24 símbolos /analizar + /puntuar, Telegram); dudas: última vela IBKR con ~½ volumen (RVOL 0,3-0,6, posible barra parcial), 2ª fuente un día atrasada (24 sin juzgar), sin índice SPY 200d (régimen risk-on por defecto); fallos: transcripción manual de velas (un array de volumen cruzado, detectado y corregido antes de enviar); PRs/commits: —
- **2026-10-27 · facturas-correo** · hizo: 11 candidatos (casi todo ruido: Booking, ASISA, cole); Endesa Socorro 24 P26FRR000024041 (jul-2026, sin PDF en `_buzon_pdf`) → `PDF-pendiente`; DIGI oct 76,00€ sin PDF aún (cargo 29/10), no etiquetado; Vía B sana (última copia 26/10); 4.0: persisten 2 `sin_revisar` sin cargo en Kutxa/BBVA hasta 26/10 (SiQue 1.128,48€ del 03/10 y Anthropic 180,00€ del 05/10; solo hay 2 cargos de 170€); dudas: ¿SiQue pagada desde otra cuenta o sin pagar?; fallos: gmail-adjuntos (Vía A) CONNECTION_CLOSED; PRs/commits: —
- **2026-10-26 · trading-analista** · hizo: repesca 23:15 UTC (la de 20:15 empujó el saldo pero no llegó a /analizar; trading_pasadas sin fila); NAV 33.621,33€, cartera real (2 pos.), operaciones (0) y latido; /analizar 24 símbolos (0 vetos, 0 compras nuevas) y /puntuar (288, 4 cierres por ventana); Telegram enviado; dudas: velas de 60 sesiones (no 120) y payload por Python por límite de argv del canal-aviso (148 KB); contraste 2ª fuente un día atrasado → 24 «sin juzgar»; snapshot trading_ranking de hoy (lunes) ausente; fallos: primer envío Telegram con campo `mensaje` (400), el campo es `text`; PRs/commits: —
- **2026-10-26 · facturas-correo** · hizo: 1 candidato real (Endesa Socorro 24 P26CON044354751, PDF aún no en `_buzon_pdf`; sin archivar ni etiquetar); 4.0: 2 `sin_revisar` (SiQue 1.128,48€ y Anthropic 180€) sin cargo localizable; dudas: —; fallos: la cuenta Kutxa (`b8c4376f`) no tiene movimientos desde el 28/09 (sync PSD2 parado) → por eso no casan; Vía B última copia 23/10 (fin de semana, no corte); `gmail-adjuntos` no conectó; PRs/commits: —

- **2026-10-26 · buscador-ia** · hizo: pasada semanal por WebSearch (Gemini 2.5, Groq, OpenRouter, visión NIM, descubrimiento); sin hallazgos nuevos, doc actualizado; dudas: precio/free tier de Groq sigue contradictorio sin key; fallos: — (WebFetch a catálogos no usado, sin keys); PRs/commits: PR draft solo con docs
- **2026-10-25 · mercado-booking** · hizo: 24/568 ventanas de mercado (25-nov, 5-8 dic, 20-dic, 24-dic; aforos 2/4/5/12) → 237 comps `booking_mcp` + 4/4 ventanas de escaparate propio (Busto Reform 178,52€/2n · Dúplex 358,14€/3n · House 1959€/4n · Luxury Busto 478,64€/3n). 0 sin respuesta; 3 anuncios propios (House Sevillana, aforo 12) mandados al ingest y apartados a escaparate. Mediana/noche aforo 12: 25-nov ~270€, 6-dic ~680€, 20-dic ~340€. Latido ok:true. Pendiente: el tope dejó fuera 544 ventanas; mes 2026-10 sin bucket; eventos 7-nov y 16-nov y 25-dic sin medir 8-15 días.

- **2026-10-25 · facturas-correo** · hizo: Vía B sana (última copia 23/10); archivado recibo GitHub 8,36 USD en 10-Octubre + fila facturas_drive (fuera_del_feed); Endesa Socorro 24/10 (P26CON044354751) → PDF-pendiente (solo enlace, cargo aún no en banco, último mov 23/10); descartados Vercel Oct-23 (reemisiones de facturas de agosto + abonos de céntimos) e ITV (cita, no gasto); dudas: Anthropic 180€ (05/10) y Sique Brilla 1.128,48€ (03/10) sin cargo en banco; fallos: —; PRs/commits: —

- **2026-10-25 · agentes-entrenador** · hizo: pasada semanal (rango 18/10→25/10, 16 entradas podadas: mercado-booking ×6, facturas-correo ×6, trading-analista ×3, pricing-agente ×1); preflight canal 200; 0 PRs de prompt, 0 carril-1. Sin patrón de PROMPT: (1) facturas-correo: Anthropic 180€ vs 2×170€ y Si Que Brilla 1.128,48€ sin cargo siguen `sin_revisar` → decisión de Alberto; (2) `gmail-adjuntos` CONNECTION_CLOSED de nuevo (Vía B cubre); (3) trading-analista: 2ª fuente de precios solo llega al 20/10 (dato/infra, no prompt); `canal-aviso.sh` >128 KB sin arreglar de código (ya 4 pasadas). Backlog PRs `claude/*` abiertos: 13 (era 11); 2+ semanas: 7, el más antiguo #3755 (27/09), todos docs-only salvo #4493 (histéresis pricing, dinero real, sin mergear desde 11/10) y #4723 (blog asegura, no draft). dudas: —; fallos: —; PRs/commits: este PR

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

2026-10-25 · pasada semanal (rango 18/10→25/10; 16 entradas procesadas y podadas). Preflight canal 200 OK. Sin cambios de prompt.

2026-10-18 · pasada semanal (rango 11/10→18/10; 25 entradas procesadas y podadas: mercado-booking ×7, facturas-correo ×6, trading-analista ×3, psd2-health-check, pricing-agente, buscador-ia y resto). Preflight canal 200 OK. Sin cambios de prompt (ver entrada del entrenador).

2026-10-11 · pasada semanal (rango 04/10→11/10; ~25 entradas procesadas y podadas, incl. las de 27-28/09 que seguían en `main`). Preflight canal 200 OK. Sin cambios de prompt: los patrones (veto de suplantación SPCX/VST, `canal-aviso.sh` con payloads grandes) son de código/script, no del prompt.

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

## 12/10/2026 — sivra_mercado_booking
24 ventanas de mercado (ene-feb 2027 eventos + 5/6/2027) = 235 comps booking_mcp; 4/4 escaparates propios medidos (House 2536€/4n, Busto Reform 358€/4n, Dúplex 288€/2n, Luxury Busto 296€/2n). 0 sin respuesta. Propio descartado: House Sevillana (5 ventanas). Tope max=24 dejó 516 ventanas fuera. Pico 19-22/02/2027 (aforo 12: 2,2-3,6k€/2n).

## 15/10/2026 — sivra_mercado_booking
23/24 ventanas de mercado (17-23 oct, 6 y 28-nov-2026, 22-ene-2027; aforos 2/4/5/12) = 227 comps booking_mcp; 1 sin respuesta (17-oct aforo 12, not_found). Escaparate propio 4/4 (Dúplex 4n 649,59€, Luxury Busto 2n 244,31€, House 2n 939€, Busto Reform 3n 244,76€). 3 anuncios propios (House Sevillana) descartados del corpus. Plan: 532 ventanas recortadas por tope.

## 19/10/2026 — sivra_mercado_booking
24/24 ventanas de mercado (18-nov y 13-dic-2026; 27-mar, 2-abr, 17-abr, 6-may y 16-may-2027; aforos 2/4/5/12) = 238 comps booking_mcp; 0 sin respuesta. Escaparate propio 4/4 (Luxury Busto 3n 467,87€, Dúplex 4n 480,10€, House 4n 6.504€ [abr-2027, Feria], Busto Reform 4n 1.259,06€). 2 anuncios propios (House Sevillana) descartados en ventanas aforo 12. Plan: 552 candidatas, el tope dejó fuera 528.

## 29/10/2026 — sivra_mercado_booking
24/24 ventanas de mercado (10, 20 y 28-nov; 9, 17 y 19-dic-2026; aforos 2/4/5/12) = 238 comps booking_mcp; 0 sin respuesta. Escaparate propio 4/4 (Busto Reform 2n 171,07€, Luxury Busto 2n 267,50€, House Sevillana 3n 1.420€, Dúplex 3n 1.308,54€ en abr-2027). 2 anuncios propios descartados del corpus (House Sevillana en aforo 12, 17 y 19-dic). Plan: tope 24 dejó fuera 556 de 580; 4 ventanas nunca medidas; meses sin bucket 2026-10/11. Latido ok (1er intento: connection reset, 2º ok).

- (29/10/2026) `sivra_mercado_booking`: 24/24 ventanas de mercado (22/11, 10/11, 11/12, 15/12, 31/01, 07/02, 16/04) = 237 comps reales (el latido dice 228 por error de cuenta) · 📐 4/4 escaparate propio (Dúplex 303€/3n, Busto Reform 171€/2n, Luxury 576€/4n, House 984€/2n) · 0 sin respuesta · 🪞 propio descartado de comparables en House 12 pax (15/12, 31/01, 07/02). Aforo 12: 22/11 ≈300€/n, 15/12 ≈270€/n, 11/12 ≈600€/n, 16/04/27 ≈1.200€/n+. Tope max=24 dejó 556 ventanas fuera.
