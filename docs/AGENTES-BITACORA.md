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

- **2026-10-20 · trading-analista** · hizo: pasada completa 20:15 UTC tras el cierre (NAV 33.654,27€ → saldo; cartera 2 posiciones (VWCE+CVX) → panel; 0 operaciones nuevas + latido; /analizar 24 símbolos sin compras paper nuevas —LLY ya abierta, CHT por concentración, SNDK bajo SMA50—; /puntuar 1 cerrada por ventana; Telegram enviado); dudas: la 2ª fuente de precios (Stooq/Yahoo) devolvió el cierre del 19/10 para los 24 símbolos → `sinJuzgar` en el contraste (precios IBKR sin vetos); velas de 70 sesiones (no ~120) por coste de transcripción, SPY a 210 sesiones para el régimen; fallos: transcribí mal una vela de NVO y un par de volúmenes STX/SNDK, cazado por validación OHLC y cotejo antes de enviar; el canal-aviso.sh no admite cuerpos >128 KB por argumento (usé una copia que lee de fichero); PRs/commits: —
- **2026-10-20 · mercado-booking** · hizo: 24/24 ventanas de mercado (24-nov, 22-dic-26, 2/27-jul, 1/6/24-ago-27 × aforos 2/4/5/12) = ~240 comps `booking_mcp` (+1 extra: House 6-ago-27); 4/4 escaparate propio (Luxury Busto 340,36€/2n, Dúplex 370,81€/3n, House 1.022€/2n, Busto Reform 355,72€/4n). Descartados por el endpoint 8 anuncios propios (House x5, Luxury Busto x3, ninguno nuevo en la lista). Outlier: Mercer Residences 11.160€/2n aforo 12 el 1-ago-27 (ingerido tal cual; vigilar). Plan: 24 de 552, 528 recortadas; 2026-10 sin bucket elegible. Latido ok:true; dudas: —; fallos: —
- **2026-10-20 · facturas-correo** · hizo: preflight canal 200; Vía B sana (copias hoy); 11 candidatos Gmail 2d → 0 deducibles archivados (2 Amazon personales → Procesada; Endesa Dúplex P26CON043826944 08/09–12/10 sin importe en cuerpo y sin cargo aún → `Facturas/Revisar`); backlog 4.0: Supabase y Vercel oct → `fuera_del_feed`; quedan sin_revisar Anthropic 180€ (05/10) y SiQueBrilla 1.128,48€ (03/10), sin cargo en banco hasta 19/10; dudas: providencia de apremio tasa basura San Luis 9 (Punto y Coma SL) 26,40€ hasta 09/12/2026, en `_buzon_pdf` y ya hablada con Pilar — no es factura deducible, no archivada; `PDF-pendiente` sigue con 2 Endesa Socorro (19/08 y 22/09); fallos: gmail-adjuntos (Vía A) timeout; PRs/commits: —
- **2026-10-19 · trading-analista** · hizo: pasada completa 20:15 UTC (NAV 33.590,92€ → saldo; cartera 2 posiciones; 0 operaciones nuevas; /analizar 24 símbolos sin compras paper —CHT/CVX/MSFT por concentración, RBLX ya abierta—; /puntuar 268 tesis, 0 cerradas; Telegram enviado); dudas: payload recortado a 50 velas/símbolo porque `canal-aviso.sh` pasa el cuerpo por argv (tope ~128 KB) y 120 velas pesan 325 KB; contraste 2ª fuente solo hasta 16/10 (todo «sin juzgar»); fallos: 1ª lectura de IWM duplicó el OHLC de QQQ (repetida y verificada); PRs/commits: —
- **2026-10-19 · mercado-booking** · hizo: 24/24 ventanas de mercado (11-dic-26, 5/26-mar, 13/15-abr, 8/16/23-may-27 × aforos 2/4/5/12) = 233 comps `booking_mcp`; 4/4 escaparate propio (Luxury Busto 601,18€/4n, Dúplex 257,55€/2n, House 1.838€/4n, Busto Reform 203,36€/2n). Descartados 2 anuncios propios en mercado (House, 16 y 23-may aforo 12). Casa 95 Sevilla (12 plazas) descartada por precio absurdo (~35-44k€/2n en 26-mar y 13/15-abr). Falló: 1 ingest HTTP 000 (House 26-mar), reintento OK. Plan: 24 de 552, 528 recortadas; 2026-10 sin bucket elegible. Latido ok:true; dudas: —; fallos: —

- **2026-10-19 · facturas-correo** · hizo: Vía B sana (última copia 17/10), canal de aviso 200, sin candidatos nuevos deducibles en 2d (Amazon 18/10 rodilleras = personal, no archivado; Agoda 17/10 ya Procesada); barrido 4.0: 4 `sin_revisar` de octubre (Anthropic 180€, Supabase 25USD, Vercel 94,20USD, Sique Brilla 1.128,48€) sin cargo casable en el banco (feed al 19/10) → NO escritas, quedan en cola; dudas: Sique Brilla 03/10 aún sin transferencia `TRANSF. 2100` (¿impagada o pendiente?), Giraldillo AFV-11808 sigue reenviándose (ya archivada, en `Revisar`); fallos: `gmail-adjuntos` (Vía A) CONNECTION_CLOSED, no necesaria; PRs/commits: —

- **2026-10-19 · pricing-agente** · hizo: ciclo semanal completo, 4 pisos en paralelo (4 agentes), comps Booking house=127, busto=130, luxury=129, duplex=130 (13 fechas/piso); 52 propuestas dry-run por aplicar-propuesta (200, sin recortes); aprendizaje id 85; dudas: —; fallos: —; PRs/commits: —
- **2026-10-18 · mercado-booking (2ª pasada del día)** · hizo: 24/24 ventanas de mercado (26-sep, 1/9/26-oct 2027, 9-ene, 13-mar × aforos 2/4/5/12) = 239 comps `booking_mcp`; escaparate propio 3/4 medido (Luxury Busto 338,70€/2n, Dúplex 358,14€/3n, House 1.492€/3n). Descartado 1 anuncio propio en mercado (House, 9-ene aforo 12). Falló: escaparate Busto Reform 27-29/12/2026 sin disponibilidad (hueco, no «canal cuadra»); 1 HTTP 000 transitorio al ingerir (reintento OK). Plan: 24 de 552, 528 recortadas. Latido ok:true; dudas: el plan devuelve fechas de mercado en 2027 (sep-oct, ene, mar) pese a ser oct-2026; fallos: —

- **2026-10-18 · mercado-booking** · hizo: 24/24 ventanas de mercado (8-nov, 17-nov, 25-abr, 17-may, 17-jun, 6-jul × aforos 2/4/5/12) = 236 comps `booking_mcp`; 4/4 ventanas de escaparate propio (Luxury Busto 631,82€/4n, Dúplex 253,59€/2n, House 876€/2n, Busto Reform 185,98€/2n). Descartados 4 anuncios propios (House en aforo 12). Falló: 1 SSL transitorio al escribir (reintento OK). Plan: 24 de 552, 528 recortadas; 2026-10 sin bucket elegible. Latido ok:true.

- **2026-10-18 · facturas-correo** · hizo: Vía B sana (última copia 17/10); 0 candidatos nuevos (Agoda 17/10 ya Procesada); 0 archivados/conciliados; barrido 4.0: 4 `sin_revisar` sin cargo exacto (Siquebrilla 1.128,48 · Supabase 25 USD · Anthropic 180 vs cargos 170×2 del 01-02/10 · Vercel 94,20 USD), sin tocar BD; latido ok:true; dudas: Anthropic 180≠170 y USD↔EUR → decisión de Alberto; fallos: `gmail-adjuntos` CONNECTION_CLOSED (Vía A no necesaria); PRs/commits: —

- **2026-10-18 · agentes-entrenador** · hizo: pasada semanal (rango 11/10→18/10, 25 entradas podadas); preflight canal 200; 0 PRs de prompt, 0 carril-1. Sin patrón de PROMPT: (1) `scripts/canal-aviso.sh` sigue sin admitir payloads >128 KB (el cuerpo viaja como argumento; trading-analista 11, 13 y 14/10, ya van 3 pasadas con el rodeo `@fichero`) → arreglo de CÓDIGO (leer el cuerpo de stdin/`@fichero`), no del prompt; (2) mercado-booking: 1 ventana sin respuesta (17/10 aforo 12, not_found) y SSL/HTTP 000 transitorios reintentados OK, `ok:true` en todos los latidos (el criterio de `ok` ya no falla como el 27/09); (3) facturas-correo: 3 `sin_revisar` sin cargo (Siquebrilla 1.128,48 · Supabase 25 USD · Anthropic) y Vercel USD↔EUR sin casar → decisión de Alberto; (4) `gmail-adjuntos` CONNECTION_CLOSED repetido (Vía A no necesaria, hay Vía B). Backlog PRs `claude/*` abiertos: 11 en total, 2 con 2+ semanas (#3755 27/09, #3995 29/09; ambos docs-only); sin crecimiento relevante. dudas: —; fallos: —; PRs/commits: este PR
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
