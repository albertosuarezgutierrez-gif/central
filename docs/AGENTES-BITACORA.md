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

- **2026-10-14 · trading-analista** · hizo: pasada completa 20:15 UTC (NAV 33.845,85€→saldo, cartera, operaciones 0 nuevas, latido, /analizar y /puntuar con 24/24 símbolos, Telegram enviado); dudas: contraste de 2ª fuente devolvió el cierre del 13/10 (24 desfasados, sin contrastar); fallos: ninguno HTTP; canal-aviso.sh no admite payloads >128 KB (analizar pesa ~335 KB, se usó copia con @fichero en scratchpad); PRs/commits: ninguno aparte de esta entrada
- **2026-10-14 · facturas-correo** · hizo: Vía B sana; 0 candidatos nuevos por archivar (IONOS ya lo registró el cron); barrido 4.0 → 3 `sin_revisar` de octubre sin cargo (Sique Brilla 1.128,48 sin transferencia aún; Supabase 25 USD sin cargo; Anthropic 180 € vs cargos de 170 € el 01 y 02/10, no casa), sin auto-confirmar; dudas: Anthropic 180 vs 170; fallos: —; PRs/commits: —

- **2026-10-14 · psd2-health-check** · hizo: frescura PSD2 → OK, último mov 2026-10-14 (hace 0 días), mov_30d 40 vs prev 43, psd2_sin_fecha 0; canal 200, latido enviado; dudas: —; fallos: —; PRs/commits: —

- **2026-10-13 · trading-analista** · hizo: pasada completa 20:15 UTC (tras cierre): NAV 34.079,70€→/saldo, cartera real (VWCE+CVX)→/cartera, trades DAYS_7 vacíos + latido ok; 24 símbolos (70-80 velas, verificadas por nivel contra `precio_ref` de ayer) → /analizar sin aperturas (MSFT excede concentración, PLTR ya abierta, APP bajo SMA50) y /puntuar 0 cerradas; Telegram enviado; dudas: contraste 2ª fuente `sinJuzgar` en los 24 (su último cierre es 12/10, desfasado 1 día); fallos: `canal-aviso.sh` no admite payload >128 KB (payload 176 KB), usé copia local que lee el cuerpo de fichero (ya anotado por el entrenador el 11/10: hace falta `@fichero`); /api/internal/alerta pide `text`, no `mensaje`; PRs/commits: —
- **2026-10-13 · mercado-booking** · hizo: 24/24 ventanas de mercado (12-dic, 13-feb, 28-feb, 6/7/19/21-mar; plan 540, 516 recortadas por tope) = 236 comps `booking_mcp`; 4/4 escaparate propio (Dúplex 119€/n, Reform 77€/n, House 517€/n, Luxury 182€/n); 2 anuncios propios (House) desviados; dudas: —; fallos: 1 HTTP 000 transitorio en ingest, reintentado OK; PRs/commits: —
- **2026-10-13 · facturas-correo** · hizo: pasada completa; Vía B sana (última copia 13/10); 9 hilos candidatos Gmail (Asecon docs 2024, DGT, baja Occident, mensajes Booking: 0 facturas), 0 archivados/conciliados; `_subir_aqui` vacío; barrido 4.0: 3 `sin_revisar` sin cargo casable (SiQueBrilla 1.128,48 · Supabase 25 USD · Anthropic 180 EUR; solo 2 cargos Anthropic de 170 el 01-02/10 y TRANSF 2100 de 208,32 el 28/09, no casan); dudas: —; fallos: gmail-adjuntos (Vía A) CONNECTION_CLOSED, no necesaria; PRs/commits: —
- **2026-10-13 · mercado-booking** · hizo: 24/24 ventanas de mercado (238 comps `booking_mcp`; cubre 16/10, 14/11, 12/12 y feria 21-28/feb) + 4/4 escaparate propio; latido ok:true; dudas: —; fallos: 1 SSL transitorio en un ingest (reintentado OK); House Sevillana salió 2 veces en aforo 12 (23/02 y 28/02), el ingest la apartó; plan dejó 516 ventanas fuera del tope; PRs/commits: —
- **2026-10-12 · facturas-correo** · hizo: pasada completa; 6 candidatos Gmail (ruido Booking, 0 facturas), 0 archivados/conciliados; Vía B sana (última copia 10/10); barrido 4.0: 3 `sin_revisar` sin cargo en banco aún (Siquebrilla 1.128,48 · Supabase 25 USD · Anthropic 180 EUR, cargos Anthropic de 170 no casan), no se tocaron; colas: PDF-pendiente 2 (Endesa Socorro ago/sep), Revisar 1 (Cobros septiembre guardería, Pilar); dudas: —; fallos: `gmail-adjuntos` (Vía A) CONNECTION_CLOSED; latido enviado ok:true; PRs/commits: —
- **2026-10-12 · mercado-booking** · hizo: plan max=24 (540 candidatas, 516 fuera por tope); 24/24 ventanas de mercado (eventos 25/10-3/11, 10 y 17/01/27, 5/06/27; aforos 2/4/5/12) = 239 comps `booking_mcp`; 4/4 escaparate propio (19/10-10/11) reconocidos como propios. Medianas/noche aprox. 2 pax: ~130-165€ en ene, ~145-190€ 25/10-3/11 (31/10 ~170-185€); 12 pax 30/10 ~750-820€/noche. 🪞 1 anuncio propio descartado por el raíl (HOUSE SEVILLANA, aforo 12, 25-27/10). dudas: —; fallos: —; latido ok:true; PRs/commits: —
- **2026-10-12 · buscador-ia** · hizo: pasada semanal por WebSearch (Gemini 2.5 Flash cierra 16/10, ya curado; Groq/OpenRouter/Kimi/Cerebras vivos); dudas: precio/free tier de Groq gpt-oss-120b y precio punta/valle V4.1 sin zanjar (sin keys); fallos: WebFetch a catálogos bloqueado; PRs/commits: solo docs

- **2026-10-12 · pricing-agente** · hizo: ciclo semanal 4 pisos, 13 fechas/piso vía 4 agentes en paralelo; comps escritos house=126, busto=130, luxury=130, duplex=130; medición ciclo 05/10 (vendidas 8/5/7/7 de 13); 52 propuestas dry-run, circuit-breaker no saltó; dudas: 16-oct-26 y 11-jun-27 sin evento identificado; fallos: —; PRs/commits: —
- **2026-10-11 · facturas-correo** · hizo: Vía B sana (última copia 10/10); 1 candidato Gmail (circular colegio, descartado); Giraldillo AFV-11808 72,60€ ya estaba en Drive (01/08), no re-archivado; barrido 4.0: 3 facturas `sin_revisar` sin cargo casable (SiQueBrilla 1.128,48 · Supabase 25 USD · Anthropic 180€), sin escribir nada por ser recientes; dudas: SiQueBrilla oct no casa con el TRANSF 208,32 del 28/09; fallos: —; PRs/commits: —
- **2026-10-11 · mercado-booking** · hizo: plan max=24 (544 candidatas, 520 fuera por tope); 24/24 ventanas
  de mercado medidas (rondas 1, 5-31 dic, aforos 2/4/5/12) = 240 comps `booking_mcp`; 4/4 escaparate
  propio (18-22/10) reconocidos como propios por el endpoint. Medianas/noche aprox.: Navidad 2 pax
  ~150-170€, 12 pax 28-30/12 ~800-900€ (picos ~1.870€/noche en 30/12). Sin fallos ni ventanas sin respuesta;
  latido ok:true. 2 comps sin score (sin reviews).

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



- **2026-10-11 · agentes-entrenador** · hizo: pasada semanal (rango 04/10→11/10, ~25 entradas podadas: mercado-booking, facturas-correo, trading-analista, pricing-agente, buscador-ia, conectores-vigia); preflight canal 200; 0 PRs de prompt. Patrones repetidos pero NO de prompt: (1) trading-analista, SPCX/VST vetados como «suplantación» 06 y 07/10 y verificados reales contra IBKR → lógica de `apps/plataforma/lib/trading/precios-guardia.ts` (tolerar si el precio vivo de IBKR lo confirma), decisión de código/Alberto; (2) `scripts/canal-aviso.sh` no admite payloads >128 KB (2 pasadas de trading), hace falta `@fichero`; (3) ASECON 181,50€ y cargo Endesa −56,52€ sin decidir (decisión de Alberto). Backlog PRs `claude/*` abiertos: 7 (más antiguo #3755, 27/09; sin crecimiento frente a la auditoría del 27/09 que cerró 44). dudas: —; fallos: —; PRs/commits: este PR

## Última poda

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
