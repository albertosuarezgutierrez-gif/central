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

- **2026-11-01 · agentes-entrenador** · hizo: pasada semanal (rango 25/10→01/11, 15 entradas podadas: facturas-correo ×6, trading-analista ×4, mercado-booking ×3, buscador-ia ×1, entrenador ×1); preflight canal 200; 0 PRs de prompt, 0 carril-1. Sin patrón de PROMPT: lo repetido es de infra/código (`gmail-adjuntos` Vía A caído ×3, `canal-aviso.sh` con payload grande de trading ×2, 2ª fuente de precios desfasada ×3, SiQue 1.128,48€/Anthropic 180€ sin cargo en banco desde 03-05/10 ×4 — Kutxa sin sync desde 28/09). Backlog: 11 PR `claude/*` con 2+ semanas abiertos (el 25/10 no se contó; la auditoría del 11/10 citaba 6), el más antiguo #3755 (27/09). FEEDBACK-AGENTES sin pendientes. dudas: —; fallos: `engineering:github` MCP no conecta (se usó el MCP github estándar); PRs/commits: este PR

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

2026-11-01 · pasada semanal (rango 25/10→01/11; 15 entradas procesadas y podadas). Preflight canal 200 OK. Sin cambios de prompt.

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
