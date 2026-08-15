# Estado vivo, recurrencia y protocolo de aviso — pricing-agente

## Estado vivo (13/07/2026) — leer al empezar el ciclo

### Actualización 14/08/2026 — suelo PL congelado + partidos a domicilio (PR #1416)
- **El suelo PriceLabs era autorreferente:** `pricing/apply` re-capturaba `pricing_pl_referencia`
  a diario desde `rate_snapshots` — que desde la baja de PL refleja los precios del PROPIO motor —
  así que el «suelo PriceLabs» nunca caducaba. **Upsert eliminado**; la tabla quedó congelada a
  `captured_at='2026-08-10'` (última captura con PL vivo; migración
  `2026-08-14_pl_referencia_congelada.sql`) → el suelo caduca el **08/12/2026** como estaba diseñado.
  Regla: una referencia EXTERNA jamás se recaptura de un espejo que escribes tú.
- **Partidos a domicilio ya no suben precios:** el websearch metía jornadas del Sevilla/Betis FUERA
  de Sevilla como eventos locales (9 confirmadas, hasta ×2,2). Guarda determinista
  `esPartidoFueraDeSevilla` (`lib/sivra/eventos-impacto.ts`: club sevillano DETRÁS del «vs» =
  visitante; finales/neutral exentas) en sync y websearch, y el upsert **ya no resucita filas
  `descartado`**. Factores de liga re-derivados a la curva plana (×1,35).

### Actualización 13/08/2026 — guarda 🧊 «evento a ciegas» (decisión delegada a Fable 5)
- **Una noche de evento CONFIRMADO (factor ≥1,15) sin ≥3 comps fiables de SU fecha no se baja**
  (subir sí). Caso fundacional: el verificador confirmó la Bienal a las 05:31 y a las 08:30 el motor
  la seguía hundiendo −20%/día hacia el ancla global (0 comps fiables en esas 5 noches). Centinela
  `decidirEventoACiegas` (pricing-centinelas.ts #5) + guarda en `apply` junto a la de Karol G (que
  se mantiene). Solo confirmados: un previsto es una apuesta y no congela.
- **Descongelado automático**: al medir la fecha (rutina Booking) la condición deja de cumplirse y
  el raíl −20%/día deshace lo que estuviera inflado. La cola del plan (`mercado-cobertura.ts`)
  prioriza el evento confirmado sin medir POR DELANTE de la ronda base (solo entre vírgenes).
- Aviso 🧊 agrupado por pasada con dedupe 7d por (piso,fecha) — tabla `pricing_avisos` (aplicada).
- NO se bajó `factorMinimo` de `evento_sin_respaldo` (2,0): con factores 1,15-1,5 la señal es
  indistinguible del premio de finde → falsas alarmas crónicas. El hueco lo cubre el #5.

### Actualización 12/08/2026 — los previstos ya NO esperan a Alberto (verificación automática)
- **Alberto no confirma eventos.** Su respuesta al aviso 🔮 de previstos fue «esto tiene q ser
  automático, yo no sé de esta información». Ese Telegram **se retiró**; ahora decide el cron
  **`/api/sivra/eventos/verificar`** (05:30 UTC, detrás de `eventos/sync` y `eventos/websearch`).
- **Tres señales independientes** (`lib/sivra/eventos-verificacion.ts`, puro y testeado): otra fila
  ya `confirmado` en la misma fecha con **nombre parecido** · **búsqueda dirigida** sobre ese
  evento (confirma con confianza ≥0,8; `desmentido` → descarta) · **mercado real** de esa noche
  (comps `booking_mcp`/`manual` ≥25% sobre la línea del mes, con ≥4 comps y ≥3 fechas de base).
- **Caducidad a 21 días** vista sin corroborar → `descartado`. 🚨 **Con la búsqueda caída NO se
  decide nada** (ni se descarta): solo cuentan las verificaciones ÚTILES
  (`pricing_eventos_auto.verificaciones`), y el latido `sivra_eventos_verificar` se pone en rojo.
- **Telegram solo para pelotazos** (factor ≥1,4 auto-confirmado) y para el latido. Si tocas un
  evento a mano, pon `decidido_por='alberto'` y el cron no te lo pisa.
### Actualización 10/08/2026 (noche) — el reparto mes/global de la demanda ya se persiste (PR #1361)
- `pricing_applied` tiene columnas nuevas: **`demanda_fuente`** (`'mes'|'global'` por fecha, antes solo
  viajaba en la respuesta HTTP del cron, que nadie guarda) y **`demanda_gateada`**. Filas anteriores a
  NULL a propósito — no saben la respuesta, no asumas `'global'`.
- El `.catch(() => [])` de la consulta de ocupación mensual ya no es mudo: si falla marca
  `ocupacionMesIlegible` (aviso Telegram + `demanda_degradada`), pero `ok` sigue en `true` a propósito
  — sin ocupación por mes el motor tarifica como antes de #1323 (no mal), el vigía se reserva para lo
  que sí invalida la pasada. Migración `2026-08-10_pricing_applied_demanda.sql` (aditiva, aplicada).

### Actualización 09/08/2026 (tarde) — los 4 pisos EN VIVO bajo el motor; PriceLabs de baja; previstos v2
- **Los 4 pisos tienen `apply_enabled=true` y `channel_markup=1.0`** (OK explícito de Alberto: «el
  agente coge las riendas de los 4 apartamentos»). PriceLabs: Busto/Luxury ya estaban desconectados;
  Alberto pausó Dúplex/House el 09/08 ~15:00 UTC (medido antes: PL les hacía 1.140/1.653 escrituras
  sin motor en la semana). La curva PL quedó persistida en `pricing_pl_referencia` (caduca a 120 días).
- **Eventos `previsto` v2 (decisión de Alberto):** un previsto LEJANO (≥60 días) SÍ sube el precio,
  ponderado `1 + (factor−1) × confianza × 0,5` (riesgo asimétrico: inflar y bajar a tiempo es
  recuperable; no inflar y que cuaje, no). Cerca de la fecha se retira solo (vuelve a solo-suelo);
  el confirmado sigue al factor pleno. `eventos-estado.ts` v2 + `diasVista` desde el motor.
- **SIN techo de precio, A PROPÓSITO (decisión de Alberto, 09/08/2026):** `max_price` se queda NULL
  en los 4 pisos — «no tope! final copa rey hay q aprovechar!! … siempre hay tiempo de ir bajando
  precio». NO volver a proponer techos.
- **Last-minute ENCENDIDO (decisión de Alberto, 09/08/2026):** `lastminute_k = 0.5` en los 4 pisos
  (descuento máx. 12,5% el día de entrada, curva cuadrática desde la antelación mediana por
  piso/mes; inerte sin muestra ≥10). Su condición: «que ganemos dinero, si no prefiero no vender
  esa noche» — la cumple el orden del motor (el descuento va ANTES de `min_price`, del suelo
  estacional y del raíl; noches de evento factor ≥1,15 no se rebajan). De paso,
  `seasonal_floor_k` 0→1 en Dúplex/House (venían del dry-run) para que la urgencia no perfore la
  temporada. SQL registro: `prisma/sql/2026-08-09_lastminute_activado.sql` (aplicado).

### Actualización 09/08/2026 — la venta bajo mercado del finde tenía TRES causas (reparadas)
Disparador: 3ª reserva bajo el p50 de su fecha exacta (Luxury 16-18/10 a −36% efectivo; antes 18/09
−40% y 06/11 −43%). Detalle completo en `docs/AUDITORIA-2026-08-precios-dinamicos.md` (adenda 09/08):
- **🚨 El `channel_markup` 1,16 NO existe en el escaparate** — 20 reservas medidas: bruto/listado
  0,66-1,08 (mediana 0,92, solo Genius/móvil); la del 06/11 pagó 122,43€ con listado 122€ (factor
  1,004). El ÷1,16 era un −13,8% sistemático. La «confirmación» del 01/08 usó el importe corrupto
  pre-fix de la doble comisión. Fix: guardas `>= 1` (con `> 1`, un markup 1.0 se ignoraba) +
  `prisma/sql/2026-08-09_channel_markup_sin_recargo.sql` → `channel_markup = 1.0` (**aplicar SOLO
  tras desplegar el código**).
- **Ancla suave por fecha** (`pricing-ancla-fecha.ts`): con mediana FIABLE de la fecha (≥5 comps,
  nunca Serper), la base del día es al menos esa mediana ajustada — solo sube, respeta el raíl.
  Cierra el hueco del finde a 1,1-1,4× que el premio (≥1,5×, para eventos) no cubre a propósito.
- **Descuento de demanda gateado por antelación** (`pricing-demanda.ts`): la ocupación baja de una
  fecha FUERA de la ventana de venta del piso/mes (antelación mediana medida) ya no descuenta; el
  boost >1 se conserva. Luxury vende octubre a 11-17 días — estar «vacío» a 68 días es lo normal.

### Actualización 22/07/2026 (MERGEADO a main, PR #1065, producción verde)
- **Motor — «premio de mercado por fecha» (lever NUEVO, `apply/route.ts` + helper puro
  `lib/sivra/pricing-premio-mercado.ts`).** Antes el motor solo consultaba el mercado por FECHA EXACTA dentro
  de `if (ev>1)` (factor de evento del CALENDARIO). Karol G/Feria se malvendieron (344€/140€) porque
  Ticketmaster/websearch NO las flaguearon → el conector tenía 931€/424€ pero se tarifaban por el bucket del
  MES. Ahora: si el mercado del PROPIO día va **≥1,5× (`PREMIO_MERCADO_RATIO`)** su base normal del mes, se
  ancla a la mediana de ESA fecha TAL CUAL (con el ajuste demanda/calidad, **sin ×factor** → sin el doble
  conteo del 18/07), **solo SUBE** (salta el raíl ±%/día como el evento de calendario), respeta `max_price`,
  gateado por `events_enabled`. Umbral 1,5 separa EVENTO (1,5-5×) de FINDE normal (~1,1-1,4×; la mediana del
  mes mezcla findes/entre semana → no encarece un sábado). Es ADITIVO al salto de evento del calendario
  (compiten por MAX). Si un premium se dispara donde no toca, **sube el umbral**, no lo quites.
- **Guardián (`/api/sivra/pricing/guard`) — 2 arreglos de ruido/exactitud:** (1) dedup SIN límite de tiempo
  (antes «24h» + cron diario apilaba una fila `suelo_coste`/día → Telegram DUPLICADO); ahora no recrea un aviso
  mientras siga abierto (al resolverlo y persistir, la siguiente pasada crea uno nuevo). (2) `reserva_bajo_mercado`
  compara contra el p50 de la FECHA EXACTA (≥8 comps; fallback al blended por escenario si esa fecha no tiene
  comps) — el blended aplanaba a ~186€ TODAS las fechas y hacía INVISIBLE el infraprecio de eventos (Karol G
  344€ salía «+85% vs mercado» cuando su día real era 931€). Helpers puros testeados: `pricing-guardia.ts` +
  `pricing-premio-mercado.ts` (16/16). Umbral `suelo_coste` (≥3 fechas al suelo) es estructural (Busto tarifica
  al suelo en ~100/358 fechas) → con el dedup ya no spamea, pero es señal de bajo valor.
- **Copia LEGADA:** `apps/sivra/app/api/pricing/guard/route.ts` NO está programada (solo la de plataforma) y
  arrastra el bug viejo de dedup + solo tiene checks #1/#3 — candidata a retirar; no la reactives.

### 🚨 AFORO: los comps se normalizan al tamaño del piso (31/07/2026 — aviso de Alberto sobre Socorro)
Alberto: «Socorro tiene 12 plazas, no se puede vender a 165€, saldrían 13,75€ por persona». Tenía razón y
el fallo era doble y sistémico:
- **Recogida:** el cron `mercado/sweep` buscaba con «4 personas» y guardaba los **mismos comps** para los
  4 pisos con `guests=4` fijo. Ahora busca por el **aforo REAL** de cada piso (`pricing_piso_zona.max_guests`);
  los pisos con el mismo aforo comparten búsqueda (coste: 1 por aforo distinto y ventana, hoy 4).
- **Consumo:** `apply/route.ts` calculaba los percentiles **sin mirar `guests`** → una casa de 12 plazas se
  tarificaba contra apartamentos de 4-8 y salía a mitad de precio. Ahora cada comp se **normaliza** con
  `pricing_factor_aforo(plazas_piso, plazas_comp)` (función SQL, gemela de `lib/sivra/pricing-aforo.ts`).
- **El exponente (k=1,1) está MEDIDO, no inventado:** p50 de la MISMA fecha con aforos distintos (entre
  fechas distintas mandaría la temporada). House 8p vs Dúplex 4p en 12 fechas → ratio 2,20 al doblar plazas;
  House 12p vs Luxury 5p en 2 fechas → 2,52 para 2,4×. Validación cruzada: comps 8p de House p50 319€ ×1,56
  = 498€, y su precio vivo real está en 450-522€.
- **Efecto medido en el ancla de mercado:** Busto 95€→95€ y Dúplex 118€→118€ (**sin cambio**, sus comps ya
  eran de su aforo) · House 258€→403€ (+56%) · **Luxury 123€→157€ (+28%, y está EN VIVO** — vigilar
  ocupación tras el merge; el raíl ±20%/día y el circuit-breaker acotan la subida).
- **Suelo de House 180€ → 300€** (25€/plaza) con OK de Alberto. A 180€ eran 15€/plaza, el más bajo de los
  cuatro siendo el activo de más valor. Referencia: su peor venta real en 8 meses fue 334€/noche.
- **Regla nueva: al juzgar el precio de un piso grande, mira SIEMPRE el €/plaza**, no solo el total. Un
  número que parece alto («360€») puede ser precio de hostal repartido entre 12 personas.

### Revisión de eventos y costes (31/07/2026, a petición de Alberto)
- **🚨 Feria de Abril 2027 estaba MAL FECHADA en `pricing-calendar.ts`** (corregido): el calendario la tenía
  «estimada 18-25 abr» (patrón de 2026 calcado) cuando las fechas oficiales son **13-18 abr, alumbrado el 12**.
  Doble daño: 19-25 abr (semana normal) se tarificaba de Feria —hasta ×2,5 de precio y ×2 de SUELO, que además
  impide corregir a la baja— y los días de Feria REAL se quedaban sin suelo de evento. Comprobado contra mercado
  real: 15-abr p50 417€ y 17-abr 304€ frente a 20-abr 162€. **Lección: las fechas de Feria NO se estiman
  «dos semanas después de Semana Santa» — se confirman contra el mercado (un p50 que se dispara) o fuente oficial.**
- **Semana Santa 2027 (21-28 mar) SÍ está bien** en el calendario y el pico casa con el mercado (25-mar p50 554€,
  26-mar 462€). No está en `pricing_eventos_auto`, pero el motor toma el MAX de ambas fuentes.
- **✅ ARREGLADO 31/07/2026 — el suelo ya mira las DOS fuentes de eventos.** `seasonalFloorFactor(fecha, evExterno)`
  acepta el factor de `pricing_eventos_auto` y el motor le pasa el mismo que usa para el precio. Antes solo leía
  el calendario, así que los 3 días de **Karol G** (factor 2,5, solo en la tabla) tenían el suelo de un junio
  cualquiera: subían de precio pero podían deslizarse al mínimo si sus comps caducaban.
- **🕳️ HUECOS DE EVENTOS vivos (calendario + tabla, próximos 12 meses):** ~~septiembre 2026 = CERO eventos~~
  **→ CERRADO 03/08/2026: la Bienal de Flamenco 2026 (fechas OFICIALES 9 sep – 3 oct, labienal.com) está en el
  calendario** (1,25 laborables / 1,30 dom / 1,40 vie-sáb) tras la reserva del Dúplex 25-28 sep a 159,63€/noche
  bruto con el mercado de ese finde a p50 258€ (4pl) / 984€ (12pl) — comps de 4 findes de Bienal cargados en
  `market_rates` (barrido de sesión 03/08). Julio 2027 sigue vacío (límite del horizonte). Agosto 2026 solo
  tiene el Sevilla-Rayo. El resto de meses está cubierto.
- **Horizonte vs calendario:** `PRICING_HORIZON_DAYS`=365 y el calendario acaba el **2027-05-02** → may-jul 2027
  se tarifica sin eventos de calendario (solo lo que traiga la tabla). El watchdog de `pilot-track` avisa.
- **Costes por noche (recalculados con datos vivos; detalle en `pricing_aprendizaje/ALL/costes_por_noche_31_07_2026`):**
  busto **19,40€** (suelo 65€ → 3,3×) · luxury **29,70€** (suelo 72€ → 2,4×, el más ajustado: su estancia media de
  2,7 noches encarece la limpieza por noche) · duplex **10,60€** (suelo 85€ → 8×) · house **≥30€** (suelo 180€).
  **Ningún suelo vende bajo coste.** Huecos: House **no tiene ni un gasto fijo registrado** (290 m², 6 dorm — su
  coste está infravalorado) y Dúplex/House **no tienen calibración de suelo contra competencia** (la de Busto y
  Luxury es del 28/07). Recuerda que el suelo protege el LISTADO, no el efectivo (canal ≈0,76× a ≥7 noches).

### 🚨 House cambió de categoría en 2024 — NO promedies su histórico entero (01/08/2026)
ADR de House por año: **67 · 106 · 147 · 175** (2020-23) → **553 · 459 · 487** (2024-26). Ticket medio 2026:
**1.424€** por reserva (fines de semana de 2 noches a 2.257-2.882€). Promediar las dos etapas da cifras
plausibles y FALSAS: así salió un «ADR de agosto de 102€» que casi lleva a bajar House a 285€ — regalarlo.
**Regla: al analizar House usa SOLO desde 2024.** Es el mismo fallo que el de los ADR del radar de trading
(número creíble, periodo equivocado, sin hueco que lo delate); aquí lo cazó Alberto, no el sistema.
- **Pero el precio de AGOSTO sí está alto** — no es contradicción, es estacionalidad: el ADR de 487€ sale de
  abril, mayo, septiembre, octubre y diciembre. Competencia real de Booking (12 personas, 16-23/08/2026):
  mediana **228€/noche**, techo 443€ (Luxury Palace, 9,6); House pide 450-483€, por encima del techo. La
  reserva cancelada de esas fechas eran **334€/noche**. Desde 2024, House no vende agosto (1 y 7 noches).
- **Suelo PLANO = error de diseño.** El ADR de House va de ~230€ en agosto a >500€ en octubre. Un `min_price`
  único no puede servir a los dos. Pendiente: calibrar el suelo por temporada con la serie 2024+.
- **⚠️ La curva de anticipación NO sale de `incomes`, sale de `rate_snapshots`.** El `createdAt` de las reservas
  de 2024-25 es la fecha de la IMPORTACIÓN masiva (junio 2026), no la de la reserva: cualquier «vamos
  tarde/normal» calculado con esa columna es inventado. **Pero sí se puede medir de verdad** con los 65.725
  snapshots diarios (4 pisos, desde el 10/05/2026): cada transición de `available` 1→0 entre dos snapshots es
  una reserva entrando, y `rate_date - snapshot_date` es su antelación. Consulta de referencia: `LAG(available)
  OVER (PARTITION BY property_id, rate_date ORDER BY snapshot_date)`.
  **Antelación mediana medida (01/08/2026): Busto 108 días · Luxury 57 · House 32 · Dúplex 7.**
  Sin esto, la ocupación a X días no se puede interpretar: Dúplex a 0/31 en octubre parece alarmante y es su
  patrón normal, y Busto a 7/31 parece el mejor cuando es el que va tarde. Muestra corta (78 días, 11-51
  noches/piso) → brújula, no GPS; se afina sola cada día.
- **🔴 Octubre 2026 (el mejor mes de Sevilla) a 2 meses vista:** Busto 7/31 · Dúplex **0/31** · House 6/31 ·
  Luxury 4/31, con los precios publicados a **2-4× el ADR realizado de octubre 2024-25** (Busto 307€ vs 77-86€ ·
  Dúplex 194€ vs 90-100€ · Luxury 212€ vs 98-100€ · House 867€ vs 423-499€). House sí ha colocado sus 6 noches
  a **709€**, su mejor ADR de octubre, así que el precio alto no es absurdo — el problema es el volumen.
- **🔴 El corpus AÚN NO tiene comps del aforo real, y eso invalida cualquier juicio de precio sobre House**
  (confirmado 01/08/2026, lo levantó Alberto: «House Sevillana aún está en PriceLabs como dúplex»). El sweep
  arreglado (#1186) entró el 31/07 pero era **semanal (dom 03:00 UTC)**, así que **no ha corrido ni una vez**
  con el arreglo: los 30 comps VIVOS de House son de 8 plazas (media 314€), metidos a mano por el `/ingest` de
  la auditoría del 22-29/07. El motor los normaliza (×1,56 → 403€) y no miente, pero ese ancla está
  **EXTRAPOLADA, no medida** — los últimos comps de 12 plazas de verdad (09/06) iban a 621-694€.
  **Consecuencia directa: la propuesta de bajar House a 330-350€ salió de ahí y queda RETIRADA.** Desde #1203
  el sweep es DIARIO, así que se repone solo; hasta entonces, no muevas el precio de House con el dato de mercado.

### 🔴 El bucket mensual solo cuenta con 3 fechas distintas — y el barrido daba 1 (01/08/2026)
Caso que lo destapó: reserva de Luxury para el **viernes 6-nov**, entrada a las 18:43 después de que
el motor bajara esa noche **152€ → 122€** a las 14:30. Comparables de ESE día: **123-212€**, mediana
169€ a 4 plazas. No fue Booking: los descuentos (Genius ~19%) muerden sobre la base que le demos.
- **Por qué bajó:** `apply/route.ts` descarta el bucket de mercado de un mes si no tiene comps de
  **3 fechas distintas** (`MIN_FECHAS_MES`) — y el barrido visitaba **una sola fecha por mes**, así
  que el umbral era inalcanzable POR DISEÑO. Sin bucket, el día se tarifica con el **ancla global**,
  que sale del último barrido y va dominada por las fechas cercanas y baratas.
- **Cobertura real medida ese día (fechas distintas por piso y mes):** House 3/2/1/1/1 (ago→dic),
  Luxury 6/4/4/**1**/2, Dúplex 4/2/1/1/1, Busto 7/3/2/3/3. O sea: **House se tarificaba con el ancla
  global de octubre en adelante**, encima con el ancla extrapolada desde comps de 8 plazas.
- **Y el premio por fecha no lo rescata:** exige ≥1,5× la base normal y aquí salía 1,38×.
- **Fix:** `fechasPorMes` (default 3, env `SIVRA_SWEEP_FECHAS_MES`) — viernes + sábado + martes, que
  replica la composición de los meses que sí funcionaban (~2/3 finde). **La mezcla importa:** el
  bucket se aplica a TODOS los días del mes, así que solo-findes lo sobrevalora y solo-entresemana lo
  hunde. Una muestra que cae en día de evento **se corre una semana** (el bucket excluye las fechas de
  evento a propósito, así que ahí no sumaría — el bug se habría reproducido solo).
- **Plan por RONDAS + presupuesto de tiempo:** temporada (1 fecha/mes) → eventos → profundidad. Si el
  barrido se queda sin tiempo pierde profundidad, nunca temporada ni eventos, y lo **publica**
  (`truncado`, `base_completa`); el latido solo baja a `ok:false` si no cubrió la temporada. La
  cobertura se ACUMULA entre días (el motor mira 120 días de `search_date`), así que truncar es barato.

### 📉 Qué hace PriceLabs (medido, 01/08/2026) — HISTÓRICO: PL de baja el 09/08/2026
> PriceLabs ya no tarifica ningún piso (baja 09/08/2026). Esta sección se conserva porque su
> historial en `rate_snapshots` sigue siendo dato útil (curva de anticipación, ADR realizado).
Idea de Alberto: «¿por qué no estudias cómo lo hace PriceLabs?». Se puede, porque `rate_snapshots` lleva
fotografiando sus decisiones a diario desde mayo. Lo que hace, por días de antelación (mayo-julio 2026):

| Días antes | House | ocupado | Busto | ocupado |
|---|---|---|---|---|
| 23 | 460€ | 10% | 94€ | 24% |
| 14 | 453€ | 13% | 98€ | 23% |
| 7 | 446€ | 19% | 104€ | 45% |
| 0 | 428€ | 30% | 105€ | 47% |

**PriceLabs NO hace last-minute:** House baja un −7% en tres semanas y se queda con el 70% de las noches
vacías; Busto ni baja, sube. Ese «aguantar el precio» explica agosto a cero y octubre a 2-4× el ADR realizado.
**No copiar su política**; sí explotar su historial (ver la curva de anticipación arriba). Pendiente de
implementar: que el motor baje de verdad cuando una fecha se acerca sin venderse, calibrado con la antelación
mediana por piso — que es justo lo que PriceLabs no hace.
⚠️ `rate_snapshots.was_booked` está casi vacía (5.139 de 65.725 filas): **NO usarla como etiqueta**; el proxy
bueno es `available`.

### 🛡️ Centinelas del guardián (31/07/2026) — el sistema se contrasta solo contra el mercado
Los tres fallos de ese día tenían la misma forma: **un dato metido a ojo que nadie volvió a mirar**, y que el
motor usó como verdad durante meses porque NO TENÍA FORMA DE QUEJARSE. La respuesta no es «revisar más», es que
el guardián (`/api/sivra/pricing/guard`, cron 07:30) compare lo que hacemos contra el mercado real. Lógica pura
y testeada en **`lib/sivra/pricing-centinelas.ts`** (21/21), cableada en el route como chequeos #6/#7/#8/#9:
- **#6 `precio_por_plaza` / `suelo_por_plaza`** — el € por plaza EFECTIVO (tras canal ×0,76) del precio vivo más
  barato y del suelo. Umbral 18€/plaza. **Solo pisos de ≥6 plazas**, y no es un tecnicismo: en un piso pequeño
  las plazas son en buena parte sofás-cama (Luxury: 5 plazas en 2 dormitorios), así que el reparto no significa
  nada — su suelo de 72€ da 10,94€/plaza y sin embargo cubre coste 2,4× y va a mercado. Por debajo del umbral el
  centinela devuelve **«no evaluado», no «correcto»**: a esos pisos los vigilan el suelo de coste y el ancla.
- **#7 `evento_sin_respaldo`** — fecha declarada con factor ≥2 cuyo mercado NO la respalda (ratio fecha/mes < 1,15)
  → la fecha del evento probablemente está desplazada. Es el centinela que habría cazado la Feria 2027.
- **#8 `evento_no_catalogado`** — el espejo: mercado ≥1,5× su mes SIN evento en ninguna fuente → hay algo en
  Sevilla que no sabemos. Es el que destaparía la Bienal.
- **Control de composición (importante):** el p50 de la fecha y el del mes se calculan **sobre los mismos
  pisos-escenario** (el JOIN restringe el mes a los escenarios que barrieron esa fecha). Sin eso, un barrido
  desigual —un día solo barrido para la casa de 12 plazas— dispararía «evento desconocido» cada semana.
- **Umbral de #7 a 1,15, no 1,25, a propósito:** el p50 del MES ya viene inflado por el propio evento (abril 2027
  va a 310€ justo porque dentro caen Feria y Semana Santa). Con los datos reales del 31/07 el 1,15 separa igual
  los días de Feria (1,25×) de los días normales mal marcados (0,87× y 1,04×) sin castigar los meses con eventos.
- **Simulado contra el mercado real del 31/07: 3 avisos, no una avalancha** — 27-nov-2026 (1,75× sin evento),
  07-ago-2026 (1,54× sin evento) y 18-abr-2027 (declarado ×2,5, mercado 0,87× → la última noche de Feria está
  sobrevalorada). Los cuatro pisos pasan el €/plaza. **Ojo al denominador:** la respuesta devuelve
  `fechas_evaluadas` (21 el 31/07) — si es baja, el barrido cubre pocas fechas y el SILENCIO de #7/#8 **no
  significa que el calendario esté bien**. Ampliar el barrido de mercado ensancha estos centinelas.
- **#9 `comps_otro_aforo` (01/08/2026)** — avisa cuando los comparables VIVOS de un piso son de otro tamaño, o
  sea cuando el ancla de mercado ha dejado de ser una medición y es una extrapolación. Nació del caso House
  (12 plazas medidas con comps de 8). Umbral **holgado a propósito (×1,35)**: a ×1,25 saltaría también Luxury
  (5 plazas con comps de 4 = ×1,28), y esa diferencia de UNA plaza es ruido de cómo cada anfitrión cuenta los
  sofás-cama — un canal que avisa de eso cada semana se acaba ignorando (lección del 19/07). El aviso dice
  explícitamente **«no bajes el precio con este dato, lanza el barrido»**: la respuesta correcta es medir, no
  tarificar. Verificado contra producción: salta House y deja fuera a Busto, Dúplex y Luxury.
- **🚨 #4 y #5 iban SIN normalizar por aforo hasta el 01/08/2026 — un vigilante que no podía disparar.** La
  normalización de #1186 se puso en el motor (`apply`) pero NO en el guardián, así que sub-mercado y
  reserva-barata comparaban el precio vivo contra comps EN CRUDO. En el único piso donde la diferencia importa
  (House) eso es un mercado un 36% más barato: la casa salía «por encima de mercado» justo cuando estaba por
  debajo. **Regla que deja esto:** cuando el motor gane una corrección de datos, comprueba si el guardián que
  lo vigila necesita la MISMA — si no, se queda midiendo con la regla vieja y su silencio no vale nada.
- Todos comparten la regla del repo: sin muestra devuelven `evaluado:false`, **nunca un «todo bien» que en
  realidad significa «no lo he mirado»**.

- **Zona** poblada (`pricing_piso_zona`): 4 pisos, CP 41003 (Bustos Tavera / Casco Antiguo).
- **Costes/suelos** ya calibrados (`pricing_aprendizaje/ALL/costes` + `pricing_settings.min_price`):
  **busto 65 · duplex 85 · luxury 72 · house 180** (busto/luxury recalibrados 28/07/2026 con OK explícito
  de Alberto tras análisis de comps reales — detalle en `pricing_aprendizaje` temporada `suelo`; los 115/95
  anteriores quedaban por encima del mercado flojo → fechas al suelo y días sin reserva). Coste real/noche
  ~14-30€ (limpieza + fijos; busto y luxury son **subarriendo** → la renta es coste duro). El suelo es
  protección, no precio. NO volver a subirlos por encima del p25 de fechas flojas sin OK de Alberto.
- **Motor por temporada (B2)** YA en prod: `apply/route.ts` tarifica por mes de `checkin_date` con fallback al
  global. NO hace falta reimplementar bucketing; solo alimentar `market_rates` con comps fechados por mes.
- **EN VIVO los 4 pisos** (`apply_enabled=true` en busto_reform, luxury_busto, duplex_center y
  house_sevillana — los dos últimos activados 09/08/2026 con OK de Alberto). **PriceLabs DE BAJA
  09/08/2026**: Alberto pausó los listados de Dúplex/House ese día y canceló la suscripción; ya no
  escribe en Smoobu ni se espera factura nueva. Su última curva queda persistida en
  `pricing_pl_referencia` (**estado real verificado 15/08/2026: SOLO Dúplex+House, 366 fechas/piso,
  todo `captured_at='2026-08-08'` → caduca ~06/12/2026** — la recaptura diaria autorreferente se
  eliminó en el PR #1416, y después alguien restauró la tabla a la curva GENUINA del snapshot del
  08/08, último día limpio antes de la pausa, descartando Busto/Luxury cuyo «PL» ya era espejo del
  motor; restauración fiel —732/732 filas cuadran con `rate_snapshots` del 08/08— pero SIN autoría
  anotada en memoria/commits). NO actives ni desactives `apply_enabled` de un piso sin OK explícito
  de Alberto.
- **Mercado cargado a 12 meses** (Booking MCP, barrido F1 13/07): verano, Semana Santa 2027 (~462€ p50),
  Feria 2027, may/jun/jul 2027. **Ticketmaster VIVO** (cron semanal; busca por latlong — postalCode da 0
  fuera de EE.UU.). **🔥 KAROL G 3 noches en La Cartuja 11-13 jun 2027** (mercado 4-8x, factor 2,5) — rampar.
- **🕳️ LANDMINE CANAL BOOKING (corregido 13/07):** el precio EFECTIVO en estancias ≥7 noches caía hasta
  ≈ listado × 0,56-0,65 por los **planes "Tarifa semanal" (−30%) y "mensual" (−40%; Dúplex −30%)** de la
  extranet + móvil 10% + Genius dinámico ~11%. Los planes de tarifa NO salen en Promociones. EJECUTADO
  13/07 (Alberto, Booking confirmó los 8 planes): semanal y mensual → −5% (busto/luxury/duplex) y −10%
  (house); ratio esperado ≥7 noches ≈0,76. Detalle y métrica en `pricing-automatico.md` §12 y
  `pricing_aprendizaje` (`canal_booking`). Al valorar margen por reserva, usar el bruto real de `incomes`.
- **Checker anticipado (13/07):** `pricing_experiments.was_booked` se marca al detectar el income que cubre la
  noche futura — la evidencia para la baja de PL crece sin esperar a que pasen las fechas.
- **Websearch de eventos RESTAURADO (13/07):** `lib/websearch.ts::buscarWeb` en plataforma — Gemini
  grounding (gratis) → plugin `web` de OpenRouter (de pago, ~0,02€/pasada) cuando Gemini da 429. Cubre
  LaLiga/ferias/congresos/festivos que Ticketmaster no lista. Gasto trazado en `ai_usos` (endpoint `eventos`).
- **Pendiente de datos:** comps de unidad grande (12 plazas) para House Sevillana.

## Recurrencia / autonomía (importante, no prometer 24/7 de más)
- **Va solo (crons in-app):** `apply-auto` (tarifica Busto a diario), `rates/snapshot` (mide `was_booked`),
  `mercado/sweep` + `eventos/sync` (refrescan datos), `resumen-diario`/`pilot-track` (KPIs). Bucle determinista
  que se retroalimenta sin Claude.
- **Solo con sesión de Claude:** este agente con los **conectores de viajes** (Booking/Tripadvisor/Trivago) —
  los conectores viven en la sesión, no en la app. Para que corra periódicamente: **sesión programada de Claude
  Code on web** apuntando a este skill. Sin ella, el motor sigue con los datos que tenga (plan B).

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
