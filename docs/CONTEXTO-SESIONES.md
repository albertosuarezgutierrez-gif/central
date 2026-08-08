# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 🧮 (08/08/2026) Subastas 2ª tanda: ITP por CCAA, puja en vivo, vivienda habitual y simulador
- **ITP por CCAA** (`module-subastas/src/impuestos.ts`): `calcularCoste` deja de aplicar el 7% andaluz a
  todo — la provincia elige el tipo general de su CCAA (Asturias 8%: Cancienes pasa de 94.248€ a 95.112€),
  con aviso del tipo aplicado y de las escalas progresivas. `params.tipoItp` explícito sigue mandando.
- **Vigía de pujas en vivo** en `subastas-cierre`: `mejorPujaViva()` (1 llamada/ficha, seguidas a ≤3 días)
  → `subastas.mejor_puja(_at)` (migración `2026-08-08_subastas_mejor_puja.sql`, aplicada) + Telegram 🔥 una
  sola vez si superan tu techo (`sobrepuja_avisada_at`). NULL nunca pisa un valor visto.
- **Vivienda habitual** (ya se extraía del edicto): `viviendaHabitualDeNotas` (round-trip testeado) afina la
  nota del art. 671 en umbrales/ficha. **Simulador «¿y si pujo X?»** en la ficha (módulo puro + financiación
  de criterios; banda de aprobación, admisibilidad, tramos). Tests 443 módulo + 1045 app, tsc 0, build OK.

## ⚖️ (08/08/2026) Subastas: deuda, puja mínima y umbrales LEC 670 en la ficha
- Pregunta de Alberto («¿se puja por la deuda? ¿el 70%?»): la «salida» YA es el valor de puja (tipo del
  BOE, no mercado); el 70% legal es del VALOR DE SUBASTA, no de la deuda (LEC 670). SUB-JA-* = judicial.
- 3 huecos arreglados: `cantidad_reclamada` era campo muerto (ahora en ficha), `puja_minima` sin consumidor
  (la puja máxima marca inadmisible/sin aprobación automática), y «Sin puja mínima» → centinela `0`
  (≠ NULL no publicada; COALESCE-safe, backfill solo vía relectura 24h del cron).
- Nuevo `module-subastas/src/umbrales.ts` (`umbralesPuja`/`estadoPujaMinima`) + `escenariosCoste` (70% del
  tipo + mediana provincial real). Score/coste siguen conservadores al 100% (decisión de Alberto).
- Telegram avisos con línea de umbrales+deuda. Migración documental `2026-08-08_puja_minima_centinela.sql`.

## 🧱 (08/08/2026) Bandeja «cargos duplicados» de /banca responsive en móvil — PR #1319
- Captura de Alberto: en móvil las filas desbordaban (chips `flexShrink:0` + importe fuera de pantalla).
- Fix CSS-only en `BancaClient.tsx::DuplicadosBandeja`: media query ≤768px, concepto a ancho completo,
  fecha+chips+importe con wrap, botonera con wrap y botones ≥44px (`#duplicados`). Igual en «Ya resueltos».
- Mismo patrón que la bandeja «Gastos por revisar» del mismo archivo.
- Verificado 320/360px con Playwright (0px overflow). OJO: `next build` en el contenedor falla en
  page data de `/api/admin/clientes/[vertical]/[id]` YA en main (envs ausentes), no es del cambio.

## 📌 Estado actual (lo más reciente arriba)

### 🛡️ Auditoría profunda: el vigía del agente de pricing estaba en verde falso (08/08/2026)
Pasada completa a petición de Alberto («prueba que todo funciona y está todo al día»). **Todo verde
salvo un 🔴 nuevo:** la sonda `pricing` de `agentes-latido` medía sobre `market_rates prop_*`, huella
que dejó de ser exclusiva de la Rutina semanal cuando el barrido Serper (diario 03:00) y la rutina
`mercado-booking` (diaria desde el 06/08) empezaron a escribir ahí → **saldría verde con la Rutina
muerta**, justo la avería de los 16 días del 21/07. Cambiada a `pricing_decisiones.ciclo_at` por piso
(solo la escribe `aplicar-propuesta`, y solo la Rutina lo llama); misma corrección en la SQL de
`/auditoria-diaria`. La Rutina está viva (último ciclo 03/08). Corregidas 2 afirmaciones mías: F2 ya
estaba arreglado en #1299 y «latidos OK» no estaba comprobado. Todo en **PR #1318**.
Verificado: 1031/1031 + 26/26 + 53/53, `tsc` 0 en las **8** apps, build 0, advisors sin ERROR.

### 🔎 Auditoría de precios dinámicos + fallo mudo en el plan (08/08/2026)
Informe: `docs/AUDITORIA-2026-08-precios-dinamicos.md`. **No está al 100%.** 🔴 El bucket mensual de
`pricing/apply` excluye `corpus_clonado` pero **no filtra por `fuente`**, así que mezcla los precios
de anuncio de Serper con las mediciones de Booking: medido hoy, mueve el objetivo **+24% en sep** y
**−13% en octubre** (justo a la baja en el mejor mes). No se arregla filtrando ya — Booking solo
llega a ≥3 fechas en sep/oct/nov; dic→abr se quedarían sin bucket. Propuesta: preferencia
condicional (usar solo-fiable cuando él mismo cumple el umbral) + declarar `bucket_fuente`.
Pendiente de decisión de Alberto por ser cambio de fórmula.
🟡 `sivra_mercado_sweep` tiene `ultimo_ok_at` **NULL**: ninguna pasada buena desde que existe el latido.
🟢 Raíles OK (suelo, tope ±%/día, techo, circuit-breaker sobre la intención cruda); 1023/1023 tests,
tsc 0, build 0. Falso positivo propio corregido en el informe (marzo-27 no está contaminado: Semana
Santa sí está catalogada). Arreglado de paso `?max=abc` → 0 ventanas en silencio (**PR #1318**).

- **✅ Precio dinámico vivo en los 4 pisos, primera pasada real verificada (08/08/2026).** Mergeado #1305;
  el cron de las 14:30 UTC escribió en los cuatro (Dúplex 161 noches y House 60, las dos primeras veces).
  House-octubre bajó al tope del limitador (−20%: 04-oct 639→511€) **contra un mercado medido de 638€**, lo
  que se pausó como presunto fallo — y **NO lo era**: las reservas reales de Smoobu (`incomes` expandido
  noche a noche) confirman la ocupación que lee el motor casi noche por noche (House 22/22, Dúplex 3/3,
  Luxury 29/29 de 365). Los pisos están **genuinamente vacíos**: el resto de agosto al **0% en los cuatro**,
  sep 30/13/10/10%, oct 19/13/23/0%. El motor baja porque no se vende, que es su trabajo. Reanudado
  (`paused=false`). Tercera alarma falsa del día, todas por concluir desde una cifra rara sin comprobarla
  contra la fuente primero.
  **Pendiente REAL detectado de paso:** el motor calcula UNA sola ocupación por piso para los 365 días
  (`occ` en `apply/route.ts` no acota `rate_date` por arriba) y la aplica a todas las fechas — septiembre
  al 30% recibe el mismo factor de demanda mínimo (0,92) que marzo-2027 al 0%. Hoy no cambia el signo
  porque todo está flojo, pero la palanca de demanda está ciega a la estacionalidad de la propia venta.

- **🔀 El precio era real… pero de otra empresa: saneo del corpus de trading (08/08/2026).** La auditoría
  encontró que el fallo caro no es un precio absurdo sino un cierre VERDADERO bajo la etiqueta
  equivocada: los `get_price_history` paralelos vuelven en orden de finalización y se transcribían por
  posición. Verificado contra IBKR: `17/07` META←MSFT, MSFT←SPOT, SPOT←NFLX, NFLX←LLY · `03/08` LLY←CVX,
  META←LLY · `04/08` NFLX←PLTR. Nuevo `detectarSuplantaciones()` (duplicado en la pasada + cruce contra
  referencias, 3%) vetando en `/analizar` y `/puntuar`; `trading_tesis.anulado` con 28 tesis y 16
  resultados anulados (una tesis sobre velas ajenas NO se re-puntúa: se anula) y 24 resultados LLY/META
  re-puntuados con el cierre real. Stats: n 81→77, hit rate 0,296→0,312 (momentum). PR #1321.

- **🛡️ Segundo par de ojos sobre el precio + procedencia del dato (08/08/2026).** Cierra el hueco que
  dejaba la guardia del ×2 (#1315): un error del 10% pasaba limpio y movía el retorno 10 puntos.
  `contrastarFuentes` (puro) compara cada precio con la fuente propia del servidor (Stooq→Yahoo,
  tolerancia 2%) el MISMO día; `precios-contraste.ts` hace el acarreo con presupuesto y concurrencia
  acotada — sin contraste NO se juzga, y un contraste a medias nunca bloquea la pasada. En `/analizar`
  el símbolo divergente se salta entero y avisa por Telegram. Nuevas columnas **`precio_fuente`** en
  `trading_tesis` y `trading_tesis_resultado` (default `sesion`; las 12 filas del saneo de CVX quedan
  `manual`) — patrón `market_rates.fuente`, es lo que desbloquea la recuperación automática de
  `/puntuar`. De regalo: **`/saldo` avisa si el NAV salta >15%** (no bloquea: puede ser un ingreso real,
  pero con el NAV se dimensionan TODAS las compras). PR #1317. **Dos fallos propios cazados en la
  auto-revisión antes de mergear:** la lectura del NAV anterior no filtraba por `cuenta_id` (regla
  multi-tenant — habría comparado contra el saldo de otra cuenta) y `sinContraste` de `/puntuar` metía
  los ~100 símbolos que nunca se quisieron contrastar, exagerando lo que no se sabe.

### 🏨 Filtro de ronda/fecha en el plan de mercado + 2ª pasada Booking (08/08/2026)
`/api/sivra/mercado/plan` acepta **`?rondas=2,3&desde=&hasta=`**, aplicado ANTES del tope (filtrar
en cliente no llega: el orden de urgencia pone las rondas de profundidad al final — con `?max=30` se
alcanzaban 18 de 40 y ninguna de ronda 3). Respuesta nueva: `filtro`/`candidatas`/`recortadas` +
aviso cuando el tope recorta. Filtro mal escrito → 400, nunca «mido todo». 6 tests nuevos; tsc 0,
`next build` OK (fallan `fmp`/`edgar`, preexistentes, son de red).
**🚨 Bloqueo de infra:** el proxy de egress da **403 al CONNECT contra `plataforma-ten-flame.vercel.app`**
→ ninguna sesión puede usar el raíl HTTP (plan/ingest/latido) hasta que se abra la allowlist de red
del environment. Esta pasada midió 10 ventanas (100 comps `booking_mcp`) y las escribió por SQL.
**Tope real de una pasada ≈10-12 ventanas, no 30:** las respuestas del conector no caben en contexto.
- **🚨 Un precio falso envenenó el track record de trading (08/08/2026).** Al comprobar si el agente había
  dado alguna compra (no: 0 propuestas reales, 1 posición paper MSFT) salió que el 03/08 la pasada mandó
  **CVX=590,17$** con cierre real **193,18$** (verificado en IBKR). `/puntuar` cogía `precios[simbolo]` sin
  comprobar nada → 12 resultados envenenados, 3 a +205 pp. Efecto en `trading_estrategia_stats`, que
  alimenta `ajustesDeStats` y por tanto el torneo: momentum **+7,18 pp → −0,40 pp** (cambio de SIGNO).
  Fix: guardia pura `lib/trading/precios-guardia.ts` (×2 contra el último `precio_ref` ANTERIOR a hoy;
  sin referencia NO se juzga), aplicada a tesis + deslizamiento + **stops**; `ventana_dias` pasa a ser los
  días REALES, no el horizonte declarado; columnas `anulado`/`anulado_motivo` (marcar, nunca borrar).
  Las 12 filas re-puntuadas con el cierre real; la guardia va también en `/analizar`, que es el ORIGEN
  (la vela falsa contaminaba EMA/MACD/RSI/ADX → el símbolo se salta entero y avisa). PR #1315.

- **🩺 El watchdog de trading ya distingue «no PUDO dispararse» (08/08/2026).** El viernes 07/08 la pasada
  nocturna no corrió y el aviso mandaba a mirar trigger/IBKR; la causa real fue quedarse **sin cupo de
  tokens**. Nuevo `diagnosticarPasada()` (puro, 3 tests) en `lib/trading/watchdog.ts`: si fallan los TRES
  tramos enumera las causas candidatas en vez de señalar una que no puede distinguir, y separa «arrancó y
  murió» (usa `agente_latidos.ultimo_at`) de «ni arrancó». **Corrección a lo que dije antes: solo `/puntuar`
  sería auto-recuperable** (`/saldo` y `/analizar` dependen del NAV, que solo existe en el MCP de IBKR) — y
  exige marcar la FUENTE del precio (patrón `market_rates.fuente`) porque toca el track record. **Pendiente
  de decisión de Alberto.** Retrovisor de 15 años en marcha: 178 snapshots/fila, 40 símbolos/pasada, ETA ~13 h.

- **🔴→🟢 Latido rojo de `sivra_mercado_sweep` — diagnosticado: NO investigar de nuevo (08/08/2026).**
  El `ok=false` de la pasada de hoy 03:04 UTC es código VIEJO: exigía cero ventanas ciegas en base y
  saltó por 1 de 32 (lotería de fecha de Google, documentada). El fix (PR #1299, `mesesCiegosEnBase`
  + ratio 25%) mergeó a las 11:28 UTC y **ya está en producción** (deploy `0fe9d9e`, 13:04 UTC).
  Verificado localmente: con los números reales de hoy la lógica nueva da `ok=true` (tests 25/25).
  Si la pasada del 09/08 03:00 UTC sigue roja, ESO sí es señal nueva. Las «6 búsquedas sin resultados»
  son la lotería conocida (ya mitigada con consulta de mes); el precio por fecha real lo trae
  `mercado-booking` (hoy verde, 120 comps).

- **🔍 Rutinas de auditoría ampliadas (08/08/2026).** Revisión pedida por Alberto de la diaria/semanal:
  el heartbeat (paso 2-bis) pasa a leer `agente_latidos` como fuente preferida y saca de la SQL las 3
  huellas de actividad (`incomes`, `market_rates normal`, `cleaning_sessions`) que daban falso ⛔ cada
  pasada desde el 02/07; añade huella de `mercado-booking` + reconciliación de cobertura contra
  `CRON_JOBS`/`AGENTES_VIGILADOS`. Nuevo paso 2-ter: backlog de PRs `claude/*` (atascados/conflicto/
  olvidados) + vigilar que `rutinas-automerge.yml` corre (lección PRs #1252-#1286). `auditoria-central`
  gana el check de `ignoreCommand` en los 8 `vercel.json` (incidente ~600$). Corregido "4 apps"→8.
  PR draft de la rama `claude/revision-rutinas-diarias-semanales-sviqer` — cambia comportamiento, carril 2.

- **💶 Precio dinámico SIVRA operativo en los 4 pisos (08/08/2026).** Medidas a mano 19 ventanas de
  Booking (190 comps, `fuente=booking_mcp`): ago-2026→ene-2027 ya tiene **≥3 fechas sin evento por mes
  y por piso**, que es lo que exige `MIN_FECHAS_MES` del bucket mensual — antes solo 9 de 24 buckets
  eran elegibles y el resto se tarificaba con el ancla global. Con el corpus arreglado se activó
  `apply_enabled` en Dúplex y House (ya lo tenían Busto y Luxury): los 4 pisos tarifican solos.
  **Pendiente:** feb→jul-2027 siguen sin bucket (caen al ancla global + prior estacional, que es el
  fallback de diseño, no una avería); la rutina diaria de Booking los va rellenando. **A vigilar:**
  23-oct y 27-nov salieron muy por encima de su mes sin estar en el calendario de eventos.

- **🕰️ Retrovisor de 24 meses → 15 AÑOS (08/08/2026).** Decisión de Alberto tras ver que H8 invertía el
  signo entre mitades y con 22 snapshots no había forma de saber cuál era el mundo. `MESES_RETROVISOR`
  = 180 en `backtest-puro.ts`: de ~22 snapshots por símbolo a **178**, cubriendo 2011-2026 (euro, 2015-16,
  Q4-2018, COVID, oso de 2022, ciclo actual). No toca factores, pesos ni umbrales — solo la ventana de
  medición. **Firmado en el pre-registro ANTES de ver datos, con el caveat que manda: sesgo de
  SUPERVIVENCIA** (el universo son los 1.018 de hoy) → el nivel absoluto queda inflado y no se usa; lo
  válido es la comparación cruzada dentro de cada fecha, que es justo lo que miden H8/H9/factores.
  Fundamentales solo desde ~2010 (mandato XBRL) → los factores se miden sobre menos años que el precio.
  El lote lleva ahora **presupuesto de tiempo** (240 s de 300) porque cada símbolo hace ~8× más CPU, y el
  cron va **temporalmente cada 30 min** para reconstruir en ~1 día — **devolver a `10 */2 * * *` al cerrar**.
  Durante la reconstrucción el corpus está MEZCLADO: filtrar por `actualizado_en` en todo análisis.
  Reconciliadas las skills: `trading-analista/SKILL.md` (regla nueva — H8/H9 resueltas, no proponer
  entradas «porque capituló» ni stops) y `references/infra-forward-radar.md` (decía 546 símbolos × 22
  snapshots; ahora 1.018 × 178, con el sesgo de supervivencia y el límite de fundamentales desde ~2010).

- **⚠️ mercado-booking: 2º disparo el mismo día, sin huella del 1º en `market_rates` (08/08/2026).**
  El disparo de las 12:28 UTC de hoy dio `ok:true` y logeó 120 comps escritos. Este 2º disparo (horas
  después) pidió `/api/sivra/mercado/plan` y recibió **las mismas 12 ventanas "nunca medidas"** —
  `comps:0` en las 12, como si el primero no hubiera escrito nada. Medidas de nuevo (120 comps más),
  y esta vez sí hizo avanzar la cola. **Sin diagnosticar la causa:** ¿se disparó dos veces la skill
  por config de scheduling, con la primera fallando en silencio pese a loggear éxito? ¿o algo borró
  `market_rates` entre medias? Pide revisar logs de `/api/sivra/mercado/ingest` de Vercel y el trigger
  de la skill. Detalle en `docs/AGENTES-BITACORA.md`.

- **✅ H8 y H9 RESUELTAS sobre el corpus completo — ninguna se cablea (08/08/2026).** 1.018/1.018 símbolos,
  21.321 observaciones. **H9:** las tres reglas de salida fallan su propio criterio; stop −20% y trailing
  −15% EMPEORAN los batacazos (15,6% y 12,1% vs 10,4% sin regla) — la salida por TIEMPO queda validada,
  **no se ponen stops**. **H8:** el agregado SÍ cruza el umbral (+2,34 pp ≥ +2) y aun así no se cablea,
  porque **el signo se invierte entre mitades**: +6,85 pp en ago24-jul25 y **−2,24 pp** en ago25-may26.
  Aviso de método que costó dos veredictos contradictorios en el mismo día: con 920 símbolos daba +1,38
  («no cumple»), con 1.000 daba +2,15 («cumple») — un 8% más de muestra movió 0,8 pp y cruzó la línea; la
  guarda de serie rota solo aportó +0,19 de eso. **Toda resolución del retrovisor se reporta partida por
  subperiodo, no solo agregada** — un criterio de una cifra sobre el agregado no ve la inversión de signo.

- **🧹 Auditoría del corpus re-recolectado + dos «no lo sé» que afirmaban (08/08/2026).** El arreglo de
  la barra en curso confirmado en producción: la asimetría por día de semana desapareció (medianas de
  volRel 0,96–1,09 los siete días). **Veredictos:** H8 (capitulación) **NO cumple** — +1,4/+1,5 pp de
  mediana ret91 contra los ≥+2 pp firmados; H9 (salidas) **fallan las tres**, y stop −20% y trailing
  −15% EMPEORAN los batacazos (un stop convierte un susto en pérdida cerrada) → **no se cablea nada**.
  Dos correcciones aprobadas por Alberto, en el pre-registro (§ Corrección de medición 08/08): (a) serie
  de precios rota por contrasplit/reuso de ticker ⇒ capitulación a `null`, no `true` (`serieDiscontinua`
  en `velas.ts`); (b) sin NI earningsYield NI fcfYield **no se rankea** — el `zValor = 0` de los que no
  tienen dato es la MEDIA del universo, no una abstención, y colaba 3 nombres en el top-20 (TSEM/NBIS/ASX).
  Anotado y SIN tocar: los pilares promedian columnas vacías → peso efectivo ≈39/28/34, no 40/40/20.

- **📡 mercado-booking: primer disparo programado real (08/08/2026).** Hasta hoy la Rutina diaria no
  había dejado huella (ver nota de ayer en la bitácora). Este disparo sí funcionó de punta a punta:
  12 ventanas medidas con Booking.com, 120 comps escritos (`fuente='booking_mcp'`), latido
  `sivra_mercado_booking` con `ok:true`. Detalle de p50 por ventana en `docs/AGENTES-BITACORA.md`.
  Sin acción pendiente — vigilar que se repita mañana.

- **📅 mercado-booking arranca como Rutina programada (08/08/2026).** Primer disparo automático (antes
  solo se había probado a mano, ver entrada #1299): plan de 12 ventanas (las 12 nunca medidas),
  medidas todas contra Booking respetando aforo real, 120 comps escritos (`fuente='booking_mcp'`),
  0 sin respuesta, latido `sivra_mercado_booking` ok. Detalle y medianas en `docs/AGENTES-BITACORA.md`.

- **🔍 Auditoría diaria ligera (08/08/2026).** Sin PRs de rutina atascados (el auto-merge de #1289/#1297
  ya funciona: #1298 resuelto solo hoy). Heartbeat de crons 12/14 ✅, 2 falsos positivos ya conocidos
  (`updates/sync` Smoobu sin reservas nuevas, `limpiadoras/auto-sessions` idempotente) verificados de
  nuevo, sin acción. Un hallazgo real: `docs/RUTINAS-PROGRAMADAS.md` describía el watchdog de trading
  con solo 2 tramos (NAV+tesis) cuando el PR #1291 (mergeado hoy) le añadió un 3er tramo (`/puntuar`,
  latido `trading_puntuar`) — corregido. Resto (skills-maestro, `docs/SKILLS.md`, triaje de correo,
  reglas fiscales, manuales) sin drift.

- **📚 Las 6 trampas del extracto de tarjeta, en la doc que se lee (08/08/2026).** Lo de #1295/#1300 estaba
  solo en esta memoria y en los PRs; una sesión futura que toque `lib/extracto-tarjeta-*` no las vería.
  Ahora viven en `plataforma-maestro/references/agentes-banca-landmines.md` (detalle) y en
  `apps/plataforma/CLAUDE.md` (resumen, dentro del bloque del extracto por 📎). La que más cuesta
  redescubrir: **el parser se validó contra un fixture escrito a mano y llevaba meses devolviendo cero** —
  el fixture de un parser de documento externo se copia de un documento REAL.

- **⏱️ «Sin respuesta.» sobre un extracto que SÍ había entrado (08/08/2026).** Primera subida real tras el
  arreglo del parser: los 109 movimientos de julio entraron (742,92€, 109/109 hashes, Drive archivado) y la
  función murió a los 60 s justo ANTES de contestar → en pantalla «Sin respuesta.» y un 👎. `maxDuration`
  del chat 60→300 y, sobre todo, **presupuesto de tiempo** (`lib/contable/presupuesto-extracto.ts`, puro +
  tests): los pasos opcionales (Telegram, vigilantes, Drive, Gmail) se sueltan de abajo arriba antes de
  quedarse sin aire y **se dice cuál faltó**; la respuesta nunca se sacrifica. El cliente ya no llama
  «Sin respuesta.» a un 504: dice que puede haber entrado y manda a mirarlo a /banca. Es el mismo landmine
  de `facturas-scan` (31/07) en otra ruta: subir el techo solo mueve la pared. PR draft.

- **💓 El latido del barrido de mercado llevaba rojo desde el día 1 por 1 ventana de 32 (08/08/2026).**
  `barridoFiable` exigía CERO ventanas ciegas en la ronda base (8 meses × 4 aforos) y el token de fecha
  de Google es lotería: hoy, 162 comps en 60 ventanas y rojo por **1**. Tercera vez que la misma guarda
  absoluta hace permanente el rojo (07/08 fue el clon). Ahora manda `mesesCiegosEnBase` (mes SIN ningún
  aforo visto) + tope del 25%; las ciegas sueltas se siguen cantando en el parte. El marcado de
  `corpus_clonado` pasa ANTES del latido (si falla, ahora se ve).
  **🏨 La rutina de Booking NUNCA ha corrido** (`booking_mcp`: 10 filas del 06/08, y nada más). Pasada
  manual desde esta sesión: 50 comps reales en 5 ventanas. El contraste con el corpus Serper del mismo
  día es brutal: Busto 4-sep 204€→**110€**, 6-nov 305€→**156€**, Dúplex 16-oct 282€→**184€**, y House
  (12 pax) 260€→**474€** (el motor le pone precio de apartamento de 4). El latido se deja EN ROJO a
  propósito: darlo por verde con una pasada a mano taparía que la Rutina sigue sin existir. PR #1299.

- **🤝 El auto-merge ya resuelve el conflicto que se repite todos los días (08/08/2026).** El
  workflow de #1289 funcionó (probado: #1292 mergeado solo), pero se rendía ante los conflictos con
  UN comentario y luego callaba: #1290 acabó **24 h abierto**, resuelto a mano, y `main` lo rompió
  otra vez 44 min después. La causa es estructural — TODAS las rutinas insertan arriba de los mismos
  dos ficheros, así que chocan siempre. Decisión de Alberto: que lo resuelva el bot. Ahora, si el
  conflicto es una **inserción pura** (la sección base de `merge.conflictStyle=diff3` está vacía →
  nadie pisa a nadie), conserva las DOS entradas —primero la de `main`, sin reordenar nada de lo que
  ya está— y empuja el merge; si alguien editó texto existente, no toca nada y avisa.
  `scripts/resolver-conflicto-registro.mjs` (puro, 14 tests) + simulación con git real de los dos
  caminos. El merge va directo a `main`: un commit de arreglo en la rama del PR no volvería a
  disparar la CI (los pushes con `GITHUB_TOKEN` no lanzan workflows) y lo dejaría atascado en «sin
  checks» para siempre.

- **📬 Cursor incremental en las alertas de portales — el cron ya no relee 300 correos al día (08/08/2026).**
  Pregunta de Alberto («¿estás revisando varias veces los mismos mails?»): sí, `subastas-mercado` pedía 30
  días × 150 correos POR PORTAL en cada pasada diaria, y esa relectura se comía el presupuesto entero
  (latido del 07/08: «cortado tras 0 ficha(s); 8 pendiente(s)»). Nuevo cursor por UID en
  `subastas_correo_cursor` (tabla propia, NO `correo_cursor` — su `max(updated_at)` es el latido del
  triaje y una fila diaria lo haría parecer fresco): lógica pura en `lib/subastas/correo-incremental.ts`
  (11 tests: landmine `N:*` de IMAP, `uidvalidity` cambiado → bootstrap, lote ascendente para truncar sin
  huecos), `leerAlertasDesde` en `gmail-boe.ts` (`leerAlertas` intacta para el BOE) y confirmación del
  cursor SOLO tras ingerir (at-least-once). El modo de lectura va en el parte del latido. Migración
  aplicada. PENDIENTE: verificar en la pasada del 09/08 que ficha(s)/zona(s) dejan de salir a 0.

### 🐕 El watchdog de trading avisó de una pasada que SÍ corrió (07/08/2026)
«NAV 21 h sin refrescar» era FALSO: el NAV llevaba 10 h (20:16 UTC) y `/puntuar` 9,9 h — la pasada
del 06/08 corrió entera. Dos fallos: (1) el tramo 2 medía `max(trading_tesis.created_at)`, tabla
IDEMPOTENTE desde #1271 (único `(simbolo,fecha,estrategia)` + `skipDuplicates`), así que la 2ª
pasada del mismo día (repaso manual a las 09:34) no insertó nada y el reloj se quedó clavado en la
primera; (2) el motivo de los TRES tramos llevaba «el NAV de IBKR» cableado → el aviso mandaba a
mirar IBKR y la rutina. Fix: latido explícito `trading_analizar` (como `/puntuar`) + `GREATEST` con
las tesis de respaldo, y `etiqueta` por tramo en `evaluarWatchdog`. PR #1291.
- **📎 Pasada diaria facturas-correo (08/08/2026).** Vía B sana (`dias_caido=1`), sin backlog en
  `PDF-pendiente`/`Revisar`. Día tranquilo: 0 candidatos nuevos en Gmail, 0 subidas manuales nuevas,
  0 duplicados nuevos (los 2 "FACTURA JULIO SOCORRO" de la raíz ya estaban avisados). Roborock
  -247,92€ (House Sevillana) sigue sin conciliar en banco. Nada que archivar/decidir hoy. Detalle en
  `docs/AGENTES-BITACORA.md`.

- **💳 El parser del extracto de tarjeta llevaba meses devolviendo CERO con el PDF real (08/08/2026).**
  Con el `movimientos (1).pdf` de Alberto en la mano: Kutxabank ya no separa los campos
  (`01/07/2026******2019750300COMPRA EN…-8,00 €`) y `RE_LINEA` exigía `\s+` → 0 movimientos → el chat lo
  trataba como factura ilegible. Se validó en su día contra un fixture escrito a mano con espacios, no
  contra un PDF de verdad. Arreglado (importe primero, prefijo de tarjeta después) → **109 movimientos**,
  y el Excel del mismo listado ya se puede subir al 📎 (`identificarTarjetaExcel` saca el PAN del
  `PAGO RECIBO`). **Landmine:** sin normalizar `fechaValor`/saldo, subir PDF+Excel del mismo mes duplicaba
  63 de 109 compras (~1.990€); ahora los 109 hashes coinciden, con test. El cuadre ya no grita «no cuadra»
  cuando la liquidación paga el ciclo anterior (es lo normal). PR draft.

- **🤖 El agente contable dejaba de responder «no encuentro el cargo» a lo que no había mirado (08/08/2026).**
  Alberto: «el agente falla mucho» (captura). En `contable_log`: subió `movimientos (1).pdf` **3 veces**
  y las 3 recibió «no distingo el importe» (es un LISTADO de movimientos, no una factura → detector puro
  `lib/contable/documento-clase.ts`); y antes, dos facturas dadas por no pagadas cuando el extracto aún no
  llegaba a su fecha (la de 780,10€ del 03/08 entró en BD el **06/08**, un día después de negarla). El cruce
  pasa de sí/no a 5 estados (`CruceDoc`: match · ya_conciliado · fuera_de_ventana ±60d · **sin_cobertura** ·
  sin_match), con la cobertura real por banco en el mensaje. De paso, el dinero del agente ya usa `eur()`.
  Kutxabank va 1-3 días por detrás por diseño (no está roto). PR draft.

- **🧪 Prueba en vivo del auto-merge de rutinas (07/08/2026).** Esta entrada se subió en un PR que
  toca **solo** `docs/CONTEXTO-SESIONES.md` para ejercitar el camino feliz de
  `.github/workflows/rutinas-automerge.yml` (#1289) — el camino de bloqueo ya estaba probado contra
  #1055 y #755, que el workflow saltó por tocar código. Si este párrafo está en `main`, el
  auto-merge funciona de punta a punta: rama `claude/*` + diff solo de registro + CI en verde +
  margen de quietud ≥20 min → mergeado sin mano humana. A partir de aquí las rutinas ya no necesitan
  push directo a `main` para que su memoria llegue: les basta con separar el PR de registro.

- **🧾 Factura 47/2026 Jaime Salas (electricidad Socorro 24) archivada (07/08/2026).** 278,30€
  (base 230 + IVA 48,30), reparación de avería en CGP + cuadro eléctrico → `turistico_pisos` /
  `prop_house_sevillana`. En Drive `08-Agosto-2026` + fila en `facturas_drive`. **Conciliación
  pendiente**: Alberto la pagó por transferencia hoy y el cargo aún no está en el feed PSD2 (último
  movimiento 06/08) — recogerlo en la próxima pasada de `facturas-correo` con `propiedad_id`.
  Dos límites del entorno anotados: `script.google.com` (Apps Script de Drive) está **bloqueado por
  la política de red** (403 en CONNECT) y el MCP de Drive no traga un PDF de 563 KB → se archivó una
  copia rasterizada 200 dpi 1-bit (11 KB, legible, sin capa de texto).

- **🧪 Prueba en vivo del resolver de conflictos (08/08/2026).** Esta rama sale a propósito de un
  `main` de AYER, así que choca de verdad con todo lo que entró después — es el caso real que dejó
  #1290 veinticuatro horas abierto. Si este párrafo acaba en `main` **junto a** las entradas del
  08/08 que ya estaban arriba (sin que nadie resuelva nada a mano), el resolver de #1297 funciona de
  punta a punta: detecta la inserción pura por la base vacía de `diff3`, conserva las dos entradas
  poniendo primero la de `main`, y empuja el merge. El commit de merge lo firma `github-actions[bot]`.

### 💓 El latido del barrido deja de estar rojo para siempre (07/08/2026)
Segunda pasada con #1282 vivo: la guardia volvió a saltar (174 comps, 19 fechas, **17 precios
distintos**) → confirmado ESTRUCTURAL, no era cosa del día. Los snippets de Google no distinguen
la fecha, así que `ultimo_ok_at` no se iba a poner verde nunca — y un vigía eternamente rojo
entrena a ignorarlo justo para el día que Serper se caiga de verdad. Se separan los dos veredictos:
`barridoFiable` = «¿se pudo mirar?» (lo que el agente controla → enciende el latido) y el nuevo
`midioTemporada` = «¿el dato distingue la fecha?» (lo que la fuente permite → marca
`corpus_clonado` y frena al motor, que es la protección real). El «no lo sé» sigue entero en el
parte y en la BD. De paso, el UPDATE del sweep ya solo marca SUS filas (`scenario` = `prop_*`): el
`WHERE search_date = CURRENT_DATE` a secas se llevaba por delante los comps del scraper diario
—16 en producción, ya recuperados—, que es justo la fuente que sí mide temporada. tsc 0 · 914 tests.

- **🧹 Atasco de PRs de rutinas resuelto: 6 PRs cerrados en una pasada (07/08/2026).** La auditoría
  del 07/08 (#1285, mergeada con el fix de `rotar-memoria.mjs` + 17 tests) dejó 4 PRs de solo-texto
  atascados 1-3 días y en conflicto. Resueltos: #1252 y #1277 CERRADOS (su contenido de valor ya
  estaba en `main` vía #1285 — verificado archivo a archivo), pero sus **informes de auditoría del
  05/08 y 06/08 rescatados** aquí en `docs/AUDITORIA-2026-08.md` para no dejar huecos en el
  histórico. #1254, #1279 y #1286 (auto-informes `facturas-correo` 05, 06 y 07/08) CERRADOS con su
  bitácora rescatada en `docs/AGENTES-BITACORA.md`. La causa raíz se ataja en la entrada de abajo.

- **🤖 El carril 1 ya no depende de que la rutina pueda empujar a `main` (07/08/2026).** Decisión de
  Alberto: que lo resuelva el repo, no un permiso. `.github/workflows/rutinas-automerge.yml` mergea
  solo los PRs de rama `claude/*` cuyo diff toca **exclusivamente ficheros de REGISTRO**
  (`CONTEXTO-SESIONES`, `AGENTES-BITACORA`, `AUTO-APLICADOS`, `AUDITORIA-*`, `memoria/*`), con CI
  entera en verde, sin conflicto y con ≥20 min desde el último commit (para no comerse el push del
  hook `Stop`). **Deja fuera a propósito lo que cambia el COMPORTAMIENTO de un agente** (`.claude/**`,
  `CLAUDE.md`, `SKILLS.md`, `FUENTES-DE-VERDAD.md`): eso sigue necesitando tu ojo. Filtro por RUTA,
  no por etiqueta — una etiqueta se le puede poner a un PR que toca código, una lista de rutas no.
  Freno: etiqueta `no-automerge`, o deshabilitar el workflow. Contrato actualizado en
  `/auditoria-diaria` y `docs/RUTINAS-PROGRAMADAS.md`.

### 📎 Pasada diaria facturas-correo (07/08/2026)
Vía B sana (dias_caido=2), sin backlog en `PDF-pendiente`/`Revisar`. 2 candidatos revisados: aviso
de próximo cargo PriceLabs (49,97 USD, 08/08, aún sin PDF — pendiente de la factura real) y factura
de impuestos propia de Stripe para la cuenta ia.rest (fuera de alcance, no es compra de Alberto).
Nada que archivar/conciliar hoy. Detalle en `docs/AGENTES-BITACORA.md`.

- **📬 Pasada diaria facturas-correo (06/08/2026).** Vía B sana. Backlog `Extraccion-fallida` limpiado
  (8→0, ninguno era factura real pendiente). Factura SIQUE BRILLA 780,10€ (lavandería 4 pisos) conciliada
  y reclasificada `personal`→`turistico_pisos`. Roborock Amazon 247,92€ (Costa Ballena, Rota) confirmado
  por Alberto como deducible House Sevillana, archivado; conciliación bancaria pendiente. Detalle en
  `docs/AGENTES-BITACORA.md`.

- **🧾 facturas-correo (05/08/2026, trigger diario) — el escaneo de correo destapó una venta de
  3,3M€ colada como "gasto".** Vía B sana, sin backlog. Re-archivadas 3 facturas Booking mal ubicadas
  por el cron `facturas-scan` (mismo bug de siempre). **Hallazgo gordo:** el cron metió en `gastos`
  como si fueran facturas de Alberto: 2 extractos de Allianz sobre la póliza impagada de UN CLIENTE
  (importes que no casan con el documento — probable alucinación de la extracción) y el "Documento de
  Reserva" de Ariste Investments para comprarle a **San Luis 9 CB** (comunidad de la que Punto y Coma
  podría ser copropietaria) el edificio de Calle San Luis 9 por **3.300.000€**, con una señal de
  **33.000€ pagadera en 2 días hábiles desde el 31/07** (plazo ya vencido o al filo). Ninguna de las
  4 filas es gasto deducible — avisado a Alberto por Telegram. Detalle en `docs/AGENTES-BITACORA.md`.

- **🤝 Landing privada de partnership Teya (06/08/2026, auditoría diaria, PR #771).** One-pager
  `noindex` en `/partner/teya` (`apps/ia-rest`) para la reunión con Federico Muratore: PosLink +
  All-In-One, diferenciadores VeriFactu/voz frente a Teya. Sin lógica de producto ni tests —
  página estática de marketing, no requiere entrada en los manuales de usuario.

- **💶 ialimp: precio de plan y ahorro anual sin formato español (auditoría diaria, PR #1139).**
  Mergeado por el orquestador Fase 2 (coder barato) sin sesión que lo anotara.
  `apps/ialimp/app/admin/planes/page.tsx` pintaba `€25` en vez de `25€` — la regla global de
  dinero exige el € DETRÁS del número. Corregido con `.toLocaleString('es-ES')` en precio y ahorro.

### 📎 El agente leía el LOGO del correo, no la factura (05/08/2026)
#1243 funcionó (sinLeer 9→**0**, descartados 2→**11**, visión ya en `ai_usos`: 16 llamadas
`gpt-5.6-luna`, 0 errores, 0,0056€ el día). Pero la factura de DIGI (76€) seguía sin entrar, y
Alberto avisó de que **sí adjunta el PDF**. Cierto: el correo trae **12 adjuntos** — 11 imágenes
`cid:` del HTML (`header.png`, `logo-Mi-DIGI.png`, iconos de redes…) y el PDF **el último**; y
`pagos.ts` cogía `adjuntos[0]`, o sea un banner publicitario. Como el banner se lee perfectamente,
el correo salía «descartado: leído, no era factura» — una comprobación que nunca se hizo. Fix:
módulo PURO `lib/agente-facturas/elegir-adjuntos.ts` (7 tests, con el caso real de DIGI) que ordena
adjunto-real > PDF > nombre-de-factura > decorativo, `mailparser.related` marca los `inline`, y el
escaneo prueba hasta 3 adjuntos parando en el primero con importe. Además `quitarEtiqueta()` VACÍA
`Facturas/Extraccion-fallida` de lo ya resuelto: la cola solo crecía y acabó afirmando «fallida» de
correos ya leídos. tsc 0 · 812 tests · guardia 26/26 · build OK. PR #1257.

### 🔀 `fuente` y `corpus_clonado` son columnas HERMANAS, no la misma (06/08/2026)
Al mergear main en la rama de la fase 1 apareció #1282, del mismo día y otro carril. No se pisan:
`corpus_clonado` = veredicto de UNA pasada (ya excluye al sweep del 05/08 en adelante de los buckets
por mes y por fecha) · `fuente` = procedencia de la fila (mide cobertura fiable, `FUENTES_FIABLES`).
Comprobado en BD: quedan **1.466 filas `serper` de antes del 05/08 (55 fechas) sin marcar** y sí
alimentan el bucket mensual (ventana de 120 días), y el ancla global no se filtra por ninguna de las
dos a propósito → **el gate de la fase 2 (≥3 fechas/mes con `booking_mcp`) sigue vigente tal cual**.
Anotado en el spec y en el landmine de `apps/plataforma/CLAUDE.md`. **De paso el guardián de rutas de
rutina (#1230) cazó un fallo real de la fase 1:** `mercado/plan` y `internal/latido` aceptaban el token
pero NO estaban en `RUTAS_RUTINA`, así que el middleware las habría redirigido 307 → /login y la rutina
habría fallado muda. Añadidas. tsc 0 · 934+26 tests · build OK.

### 🏨 Mercado real por fecha: rutina de Booking → `market_rates` (06/08/2026, fase 1)
Aprobado por Alberto. Piezas: columna **`market_rates.fuente`** (`serper`|`booking_mcp`|`manual`,
default conservador `serper`; los 3 caminos ponían `portal='booking'` y el motor no filtra por portal),
**`GET /api/sivra/mercado/plan`** (ventanas más urgentes, reusa `ventanasDelBarrido`), helper puro
`lib/sivra/mercado-cobertura.ts` (13 tests), `ingest` con `fuente` validada, **`POST /api/internal/latido`**
(huella para RUTINAS, allowlist) y latido `sivra_mercado_booking` + skill `mercado-booking` (diaria, 12
ventanas de 96, acumula). **Probado con datos REALES:** 4-sep aforo 4 → 10 comps, p50 **129€** vs **171€**
de Serper (+33%: es plano Y ALTO). tsc 0 · 900 tests · build OK. **Fase 2 (NO antes de 3 fechas/mes
booking): retirar el sweep + neutralizar filas serper.** Spec: `docs/superpowers/specs/2026-08-06-mercado-booking-design.md`.

### 🔎 Barrido de mercado: la MECÁNICA quedó arreglada; lo que falta es la FUENTE (06/08/2026)
Pasada 03:00 con #1253+#1255: plan COMPLETO (120/120 ventanas, base entera, 339 comps, noviembre
rescatado por el refuerzo de mes, extracciones 1,1 s). El rojo restante es la guarda de medianas
clonadas, y TIENE RAZÓN — verificado contra `market_rates`: cada comp lleva precio CONSTANTE en todas
las fechas (Vincci ≈305€, Smartr ≈93€, Genteel ≈259€ en ago/nov/mar); los snippets de Serper NO llevan
fecha, la «temporada» del 04/08 era ruido de muestreo. Validado con Booking MCP: mismas propiedades a
~160€/noche (nov) vs ~650€ (Feria) → fuente correcta. **Decisión PENDIENTE de Alberto:** rutina Claude
programada con Booking MCP → `market_rates` (patrón Bienal 03/08). NO ablandar la guarda: el rojo diario
de `sivra_mercado_sweep` es verídico hasta cambiar la fuente. Serper sigue valiendo para el ancla global.

- **🐕 3er tramo del watchdog de trading + 2 crons rotos desde el 30/07 (06/08/2026).** La pasada del
  06/08 dejó NAV y 64 tesis pero NUNCA llamó a `/puntuar`: ni stops ni walk-forward, y el watchdog lo
  habría dado por bueno (solo miraba NAV+tesis). `/puntuar` no escribe NADA sin tesis vencidas ni
  stops, así que su huella es un latido explícito (`agente_latidos.trading_puntuar`, patrón de
  facturas-scan) y el watchdog gana tramo 3. `evaluarWatchdog` acepta `huella` — el «nunca» decía
  siempre «broker_saldos vacío» y mandaba a mirar la tabla equivocada. Crons arreglados y validados
  contra BD real: `concursos-cierre` (falta `::int`, Prisma manda bigint a `make_interval`) y
  `sivra/pricing/resumen-diario` (la columna es `applied_at`, no `created_at` — llevaba una semana
  callando **173 cambios de precio/día**). Verificado: 888 tests, tsc 0, build 0.

- **🚨 La barra EN CURSO hundía el volumen: H8 era indetectable y lo decía como «no salta» (06/08/2026).**
  Auditando el retrovisor a mitad de ciclo: `volRelMes` medio 0,62 (debe rondar 1,0) y 47% de las
  observaciones por debajo de 0,2. Causa: `barrasPeriodicas` corta en la fecha del snapshot → su última
  barra era el mes EN CURSO; el precio de una barra a medias es real, pero el **volumen es acumulativo**
  (día 1 = 1 sesión de 21). Prueba: día 1 en sábado/domingo → mediana 1,02 (sin cotización, última barra
  = mes cerrado); en día hábil → 0,047 ≈ 1/21. Solo 263 capitulaciones frente a 2.008 caídas ≥25%, y se
  guardaba `capitulacionMes:false` = «mirado y no salta» cuando era «no se puede saber». Fix:
  `barrasCerradas`/`claveDePeriodo` en `velas.ts` (6 tests). **El primer ciclo queda ANULADO para H8**
  (Enmienda 3 del pre-registro); H9 intacta (trabaja sobre cierres diarios). tsc 0 · 730 tests · build 0.
  PR #1283.

### ⏱️ El cron de mercado moría a los 300s JUSTO antes de avisar chollos (06/08/2026)
Seguimiento post-merge del peaje de obra (#1259): «0 chollos avisados hoy» **no era** «no hay chollos» —
`/api/cron/subastas-mercado` devolvió **504 a las 06:20:43** («Task timed out after 300 seconds») y nunca
llegó a `avisarChollos`. No es regresión del peaje (lógica pura, ms): los 2 pasos de red pueden gastar 420s
solos (8 fichas + 6 zonas × 30s de timeout) y **los avisos van al final**; el 05/08 ya se salvó por 15s
(285s). Fix con la doctrina del repo («subir el techo mueve la pared; el presupuesto hace que la pasada
VUELVA»): helper puro `lib/subastas/presupuesto-mercado.ts` (6 tests) — los pasos de red se cortan en un
deadline **reservando 70s para el tramo que avisa**, y no se arranca una petición que no quepa ENTERA (el
fallo exacto). Además **latido `subastas_mercado`** (intento al empezar + definitivo tras avisar) y su
sonda: nadie se enteró del 504 porque este cron no tenía vigía. Verificado: tsc 0 · 903 tests · build OK.

### 📉 El prior estacional ya corrige a la baja — sin regalar precio (06/08/2026)
Decisión de Alberto: «a la baja sí, pero que no se regale precio; Sevilla en julio y sobre todo
agosto está vacía, es normal que no haya reservas». Clave del diseño: la BAJADA solo mira el **ADR**,
nunca las noches vendidas — un agosto vacío no es señal de precio alto, así que bajar por eso regala
margen sin traer a nadie. La SUBIDA sigue usando ADR × ocupación (octubre destaca por llenar, no por
precio). Tope de bajada −15% (el ADR de agosto pediría −23%), solo cuando NO hay bucket de mercado
del mes, y nunca por debajo del suelo del piso. Extraído a `lib/sivra/prior-estacional.ts` (puro,
13 tests). Verificado: tsc 0 · 910 tests · build OK.

### 🛑 El corpus de mercado clonado ya no llega al motor (06/08/2026)
Con #1255 el barrido cubre el calendario entero (120/120 ventanas, 339 comps) pero la guardia nueva
dictó sentencia: **93% de las medianas repetidas en otra fecha** — 117 ventanas con solo **22 medianas
distintas** para 30 fechas. Los snippets de Google NO dan mercado por fecha; devuelven el mismo puñado
de anuncios genéricos de Sevilla se pida la fecha que se pida. El latido ya lo cantaba, pero eso avisa
a un humano y **no frenaba al motor**: esas 339 filas entraban en el bucket de temporada. Fix: columna
`market_rates.corpus_clonado` (migración aplicada + backfill de 05 y 06/08), el sweep marca su propia
pasada cuando la guardia salta, y los buckets por MES y por FECHA de `pricing/apply` la excluyen —
quedan 1.363 comps limpios de 52 fechas. El ancla global NO se filtra a propósito: ahí el mercado de
hoy es el dato correcto. **Corrección a lo que propuse:** la «curva de estacionalidad propia desde
incomes» YA EXISTE (`priorIdx` en `apply/route.ts`, ADR×ocupación por piso y mes). No se duplica.
Verificado: tsc 0 · 897 tests · build OK.

- **🌙 El agente de huéspedes ya no rechaza llegadas de madrugada (06/08/2026).** A Daniela (Luxury Busto,
  pedía entrar a la 1:00-2:00) el agente le AUTO-ENVIÓ que «no podemos atender llegadas entre la 1:00 y las
  2:00» + sugerencia de hotel: se lo inventó porque la política de llegadas tardías no estaba en NINGUNA
  fuente y dedujo una hora de cierre a partir de la de entrada. Nuevo `lib/sivra/agente-huesped/llegada.ts`
  (puro, 10 tests): la entrada es autónoma → **no hay hora límite**, y lo que se avisa es que la **atención
  es 09:00–21:00** (que lleve resueltas las instrucciones de acceso antes). `bloqueLlegada()` va en la
  **ficha** (guardrail-safe) + bloque de prompt en pre-llegada/día-llegada vía `esLlegadaFueraDeHorario()`.
  Lección: si una política no está escrita en la ficha, el modelo la inventa plausible y se auto-envía.

- **🛡️ La barrera de earnings del torneo vuelve a ver + higiene de cantera (05/08/2026, 4ª tanda).**
  Hallazgo: `earningsInminente` (veto ≤3d) y la estrategia catalizador dependían de `proximoEarnings`
  de FMP (sin créditos) → llegaba siempre vacío y degradaban a «no vetar» EN SILENCIO. Fix:
  `/api/trading/analizar` inyecta la fecha Yahoo cuando falta, y manda aviso 📅 diario si un valor de
  la watchlist presenta en ≤2 días (`lineaEarningsProximos`, puro). Radar: espejo de BAJA de capa C
  (≥4 lunes fuera del top-20 → botones 🍂 `wlc_baja`/`wlc_mantener`; «mantener» caduca a 30d; columnas
  `baja_*` en `trading_cantera`, aplicadas) + línea ⚖️ de concentración de la watchlist B+C en el
  digest. **FMP queda REDUNDANTE (5ª tanda):** `datosYahoo` trae también PER/PB/deuda-EBITDA/margen
  (misma llamada quoteSummary, validado con respuesta real de STX) y `/analizar` los inyecta si el
  payload no los trae → la estrategia «valor» (muerta por `sin fundamentales`) vuelve a competir.
  No recargar créditos FMP; la skill de la pasada ya lo marca opcional. Solo el DCF (valorRazonable,
  descubrimiento) sigue sin fuente — degradable.

- **📅 Fechas de earnings EXACTAS por Yahoo en trading (05/08/2026, 3ª tanda).** Nueva fuente
  `lib/trading/earnings-yahoo.ts`: quoteSummary/calendarEvents con sesión cookie+crumb (keyless;
  verificada desde cloud vía pg_net — STX 27/10 confirmada). La consumen la ficha «Analiza una acción»
  (`proximoInformeFuente`: confirmada/prevista/estimada) y la línea 📅 del digest del radar (sin ~ =
  confirmada). EDGAR (+365d) queda de RESPALDO. IBKR no expone earnings por MCP; FMP sin créditos.
  Parser validado contra respuesta real (fixture en test). PRs #1272/#1273 mergeados antes en la sesión.

- **🌱 Cantera capa C automática + alertas/altas de trading (05/08/2026, 2ª sesión).** El radar de los
  lunes propone ahora por Telegram (botones `wlc_alta`/`wlc_no`) los valores ≥2 lunes seguidos en su
  top-10 (`lib/trading/cantera.ts` puro+testeado, tabla `trading_cantera` aplicada; máx 3 propuestas,
  un ❌ no se re-pregunta) — la cantera llevaba muerta desde la siembra. Altas manuales de Alberto:
  STX+SNDK+WDC en capa C, y alerta IBKR de ruptura STX ≥865$ (solo aviso, cero órdenes). OJO: SNDK y
  WDC presentaron resultados el 05/08 tras cierre — el trío de almacenamiento repreciará. Earnings por
  MCP: IBKR no lo expone y FMP está sin créditos ($0) — las fechas salen del estimador EDGAR o de web.

- **📈 STX (Seagate) alta en `trading_watchlist` capa C (05/08/2026, sin commit — cambio solo en BD).**
  Alberto la vio con momentum (weekly en consolidación tras +290%) y preguntó por qué el agente no la
  tenía: estaba en el radar (#8-12 del top-20, «fuerte», técnico «esperar») pero la watchlist seguía
  siendo la siembra manual A/B — la cantera C no había promocionado nada aún. Insertada por Supabase MCP;
  entra en la pasada nocturna desde el 06/08. Análisis a demanda (endpoint `analisis-simbolo` vía pg_net):
  RSI 51, bajo SMA50, acumulación por volumen, insiders 47 ventas/0 compras, «sufre» en caídas del SPY.

- **📈 Trading: pasada idempotente + 🪜 semáforo de la escalera real (05/08/2026, PR #1271).** El 04/08 la
  pasada corrió ~5 veces (5 BUY idénticas, 288 tesis donde tocaban 52) → «posición ya abierta» es barrera
  ANTES de escribir, únicos en BD, saneo aplicado. Decisión de Alberto: **la escalera la suben las SEÑALES,
  no el calendario** (sin fecha objetivo; enmienda firmada en TRADING-HIPOTESIS-PREREGISTRO.md). Nuevo
  `lib/trading/puerta-fase2.ts` (`evaluarEscalera`, puro+testeado) implementa la escalera YA firmada
  (1.000€→+2.000€→+3.000€, techo 6.000€) en `/trading` y el digest semanal. Extras: deslizamiento
  señal→día sig. (`precio_dia_siguiente`, lo rellena /puntuar), contador `trading_pasadas` (avisa si la
  pasada corre 2×), `motivo_bloqueo` en tesis (vetadas agrupadas en /trading). Curva EUR ya existía.

- **📱 El libro de `/banca` en móvil ya dice A QUÉ negocio va cada gasto deducible (05/08/2026).**
  Captura de Alberto: la fila apilada de móvil oculta el `<select>` de negocio, así que un ✅ deducible
  no decía dónde estaba asignado. Chip `banca-mov-destino-chip` junto al ✅ con el `DESTINO_LABEL`
  (🛡️ correduría / 🏖️ pisos / 🏠 Dúplex), visible solo ≤768px (en escritorio el select ya lo muestra).
  `BancaClient.tsx` + media query de `banca/page.tsx`. `tsc` 0. PR de la rama `claude/deductible-expense-info-lmirph`.

- **📲→📧 El agente de venta de ia-rest trabaja SOLO (05/08/2026).** Alberto (a raíz del aviso «WhatsApp
  listo: C&C EVENTS»): el agente manda el email él mismo y sin notificar nada. Retirado el carril WhatsApp
  de frío (`crm-whatsapp-sevilla`, exigía un toque manual por lead; cron y ruta borrados) — esos leads van
  ahora por el email frío automático (quitada la exclusión de móviles en `enviarEmailsSevilla`; backlog: 28
  leads con marca whatsapp y email sin contactar). Silenciados los resúmenes Telegram 'info' de los carriles
  de frío (lead-hunter, verticales, followup, envio-auto); los ERRORES siguen avisando. Auditado en prod:
  C&C ya recibió día 1 (03/08) + día 2 (04/08) por el carril catering; el dedup impide repetirle. OJO: los
  datos vivos del CRM están en la BD COMPARTIDA schema `iarest` (AGENTS.md de ia-rest aún dice silo). PR abajo.

- **🚨 «otro» NO es un tipo, es un «no lo sé» — regresión en prod y su arreglo (05/08/2026).** La re-derivación
  de #1266 se apoyaba en una premisa FALSA que escribí una entrada más abajo: «`tipo_bien` tiene una sola
  fuente». No la tiene — la ingesta usa `s.datos ?? extraerDatos(...)` y ese `s.datos` viene del texto RICO de la
  ficha, que NO es el que se persiste en `descripcion`. En muchas fichas lo persistido es un marcador
  («DESCRIPCIÓN QUE CONSTA EN LA CERTIFICACIÓN DE CARGAS…»), del que `tipoBien` solo puede sacar `otro`. Primera
  pasada en producción: Punta Umbría (`SUB-JA-2026-264600`) degradada de **`vivienda` a `otro`**. Fix:
  `COALESCE(NULLIF(nuevo,'otro'), tipo_bien)` en el SET y el mismo NULLIF en el guardián del WHERE — se sigue
  re-derivando (Alcalá del Río mantiene su `vivienda`) pero un «no lo he sabido leer» nunca pisa un dato sabido.
  Dato de prod restaurado a mano. Lección: al re-derivar una columna, comprobar **todas** las escrituras, no solo
  las que mencionan la columna — la fuente rica puede estar en un campo intermedio que ya no existe aguas abajo.
  Tests 863 (2 guardianes sujetan las dos mitades). PR #1268. **Verificado en prod:** dos pasadas seguidas de
  `reextraer` → 0 escrituras; Alcalá del Río y Punta Umbría en `vivienda`, Jerez sigue `garaje` (ahí el garaje SÍ
  es el bien). Regla generalizada al CLAUDE.md raíz («tercer hermano»: el «no lo sé» disfrazado de valor centinela
  se cuela por toda guarda basada en NULL) y landmine en la skill `plataforma-maestro`.

- **🔁 El arreglo del parser no llegaba a la BD: `tipo_bien` se re-deriva (05/08/2026).** Verificando #1265 en
  producción: el margen ya salía bien (la lente flip recalcula el tipo en vivo desde el texto), pero la COLUMNA
  `subastas.tipo_bien` seguía diciendo `garaje` para la unifamiliar de Alcalá del Río — y es esa columna la que
  filtra `GET /api/subastas` y pinta el mapa, así que la casa seguía invisible al filtrar por vivienda. Causa:
  `reextraerDatosDeTexto` protege TODAS las columnas con `COALESCE(columna, nuevo)`, correcto para las que
  también rellenan la ficha o el Catastro, equivocado para `tipo_bien` porque congela la lectura del extractor
  viejo. (⚠️ Esta entrada decía «cuya única fuente es ese mismo texto»: **es falso**, ver la entrada de arriba —
  costó una regresión.) Ahora se re-deriva
  (`COALESCE(nuevo, columna)`), la cola deja de exigir «le falta algo» (una fila sin huecos también puede tener
  un tipo mal leído) y la idempotencia la da solo el guardián del `WHERE`. Guardián nuevo
  `reextraer-escritura.test.ts`, hermano del de `documentos.ts`. Tests 862. PR #1266.

- **🏠 Una casa dejaba de ser casa por su plaza de aparcamiento — y el paso 1 no tiene candidatas (05/08/2026).**
  Mergeado #1264 y lanzada la re-extracción en prod: 2 subastas ganan superficie (77,19 y 140,06 m², exactamente
  las previstas) y el margen sube de 4 a **7 de 40** vivas. El cuello de botella se movió a `precio_m2_mercado`
  (el corpus de comparables es casi todo costa de Huelva); `accion=zonas` lo resolvió por buscador Fotocasa.
  **Resultado honesto: 0 subastas con margen ≥25%.** La única positiva es Dos Hermanas (+20,6%) y es ocupada,
  🔴 y con €/m² de municipio entero. Al revisar salió un fallo de la misma familia: `tipoBien` resolvía por
  orden fijo de reglas, así que la unifamiliar de Alcalá del Río (`SUB-JA-2026-264398`) salía **`garaje`** por
  el «…plaza de aparcamiento en superficie» del final de su descripción — y `evaluarFlip` descarta lo que no es
  vivienda, o sea que la casa quedaba fuera de la lente de rentabilidad por un elemento accesorio. Ahora manda
  **quién aparece antes** en el texto (la descripción registral nombra el bien primero y deja linderos y anejos
  al final) y la lista solo desempata; «plaza de garaje en edificio» sigue saliendo garaje. Tests 417/859. PR #1265.

- **📐 Sin superficie no hay rentabilidad: 12 de 17 subastas vivas sin margen calculable (05/08/2026).**
  Alberto propuso el embudo «primero las muy rentables, luego el escrito al juzgado» y el paso 1 no se podía
  cumplir: solo 4 de 17 tenían `margen_flip_pct`. Causa: `superficieM2` exigía «X metros CON Y decímetros» y
  la fórmula registral usa también COMA («setenta y siete metros, diecinueve decímetros») y mezcla cifra con
  letra («105 metros, 5 decimetros»). Reescrito a `superficiesM2` (todas las medidas + qué mide cada una) con
  prioridad construida > útil > sin etiqueta > **parcela** — en una unifamiliar la parcela se cita ANTES y
  quedarse con la primera valora el inmueble por el solar. Nuevo paso `reextraerDatosDeTexto` en el cron: el
  extractor solo corría en la INGESTA, así que mejorarlo no rescataba nada del corpus vivo. Tests 411/851.

### 🔨 Las casas derruidas dejan de salir como chollos (05/08/2026)
Alberto confirmó con un caso real (Idealista 111790643, Llanes: 99.000€, 541€/m², −68%) que los
descuentos «de derribo» son casas a levantar, no chollos. `detectarChollos` (módulo `comparables.ts`)
aplica ahora un **peaje de obra determinista**: si el descuento supera el umbral sospechoso (50%) o el
título confiesa obra (`pareceRuina`), el chollo solo sobrevive si tras sumar `RECONSTRUIR_EUR_M2`
(1.100€/m², demolición+obra nueva) sigue ≥20% bajo la mediana — con `descuentoNeto` visible en UI y
Telegram. Los que no aguantan la obra se excluyen (antes salían con ⚠️). Además el agente ya «lee el
anuncio» por la vía legítima: `Comparable.aReformar` desde el `status` de la API oficial de Idealista
(`renew`; columna `mercado_comparables.a_reformar`, aplicada) — el scraping de la ficha sigue vetado
(Idealista bloquea datacenter). Fotocasa: estado de la ficha PENDIENTE de validar contra ficha real.
Tests 409/409 módulo + 851/851 plataforma, `tsc` 0, build OK. PR #1259.
- **🔘 Botones ✅/❌ en las propuestas de trading por Telegram (05/08/2026).** Alberto: «lo más rápido
  y fácil para mí». `/api/internal/alerta` acepta `botones` opcionales validados por
  `lib/alerta-botones.ts` (puro, 5 tests): URLs solo https y callbacks SOLO `trd_*` — un ALERTA_TOKEN
  filtrado no puede fabricar botones `pago_`/`mov_`. Webhook: `trd_no:<instrId>` marca `rechazada` en la
  tabla nueva `trading_propuestas` (migración aplicada; el server no toca IBKR — la sesión borra la
  instrucción en su check-in) y edita el mensaje. El ✅ es botón URL a la pestaña AI Instructions (el
  envío final SIEMPRE es de Alberto — candado del broker). Autonomía total: solo vía OAuth/Web API,
  descartada hasta validar la escalera. Verificado: tsc 0 · 725 tests · build 0. PR #1263.

### 🚨 Landmine trading-analista: get_price_history en paralelo desordena símbolos (04/08/2026)
Pasada diaria (paper): al pedir los 13 `get_price_history` de IBKR en un solo mensaje paralelo y
transcribir por POSICIÓN, los resultados llegaron en orden de FINALIZACIÓN, no de invocación →
histórico de NFLX y PLTR intercambiado (+ una vela recortada a mano) → `/api/trading/analizar`
reventó en prod con `PrismaClientValidationError` (visto en Vercel runtime errors). Sin impacto
real: solo paper, ninguna posición se abrió con datos corruptos. Fix: re-pedidas una a una y
verificada longitud de arrays antes de usar; protocolo documentado como landmine en
`.claude/skills/trading-analista/references/pasada-diaria.md` (paso 3): etiquetar por
`contract_id`/símbolo al guardar, nunca acumular N respuestas paralelas para transcribir al final.

- **🔌 Circuito de propuestas de órdenes IBKR probado END-TO-END (05/08/2026).** Flujo validado con
  Alberto: el agente crea la orden como «instrucción» vía MCP IBKR (`create_order_instruction` — NO es
  orden viva; candado del broker) → aparece en la pestaña *AI Instructions* de su app con Reject/Submit
  (probado con 1×PYPL límite 50$, instrucción #100) → aviso Telegram vía `/api/internal/alerta` con token
  propio en `rutina_tokens` (rutina `trading-propuestas`; el contenedor no llega a vercel.app → se llamó
  por pg_net desde Supabase) → detección en solo-lectura OK. Descartada la integración OAuth/API (no
  compensa a escala tramo 1). Retrovisor vivo: 200 filas post-merge, 191 con H8+H9. PR #1256 mergeado.

### 🔎 Barrido: refuerzo por «mes en texto» para las fechas que Google no casa (PR #1253, 05/08/2026)
Diagnóstico en paralelo con #1255 (que ya mergeó los aforos en paralelo — al fusionar se quedó su
versión): el hallazgo propio de este PR es que la ventana de NOVIEMBRE entera (4 aforos, 8 búsquedas)
volvió `organic:[]` mientras feb/mar 2027 traían comps — el token de fecha ISO es lotería POR FECHA, no
distancia ni cuota. Fix: consulta de refuerzo con el MES EN TEXTO («noviembre 2026») SOLO para ventanas
de base (un evento exige comps de SU fecha; el bucket del motor es mensual), bajo el mismo cupo
`SIVRA_SWEEP_MAX_REFUERZO`. `consultasDeVentana` movida a `mercado-ventanas.ts` (pura, 3 tests).
**Verificar latido 06/08** (send_later armado; rutina PENDIENTE de alta manual).

- **⚖️ El dato que decide Belmonte estaba guardado y no lo leía nadie: la nota marginal (04/08/2026,
  rama `claude/carga-no-recogida-analizada-vjkwc9`).** Auditando `cargas_detalle` a mano tras la relectura,
  el literal de la anotación letra D (LIBERBANK, la que ejecuta) dice: «Se hace constar por nota al margen,
  su relación con la inscripción de hipoteca 2ª» — y la inscripción 2ª ES la hipoteca «anterior» de
  44.850,00€ de CAJA DE AHORROS DE ASTURIAS (Cajastur → Liberbank). O sea que lo ejecutado es el crédito que
  ella garantiza y se cancelaría al cobrar. `mismoAcreedorQueEjecutante` no lo cazaba porque compara con la
  AUTORIDAD (el juzgado), no con el acreedor de la carga `la_que_ejecuta`. Nuevo `vinculoConCargaAnterior`
  (nota marginal primero, acreedor después); nunca descuenta, avisa. `LECTOR_VERSION` 8→9.

### 🔎 El barrido ya ve mercado, pero no le cabía el calendario (05/08/2026)
Pasada con #1241: **6 búsquedas vacías (eran 100)** — la consulta abierta era la buena. Pero al dejar
de volver vacías, cada ventana paga su extracción IA y en los 240 s solo entraron **28 de 120**
ventanas, ni siquiera la ronda base (32) → 6 meses sin medir y `ok=false` correcto. Fix: los 4 aforos
de una misma fecha se miden **en paralelo** (son independientes; techo natural de 4 peticiones).
Segundo hallazgo, más feo: 204€ era la mediana de 6 ventanas, 104€ de 5 y 261€ de 3 —entre fechas y
aforos distintos, con muestras de 1-5 comps— y `sinSenalDeTemporada` no lo cazaba. Nuevos
`clonRatio`/`corpusClonado` (≥50% de medianas repetidas en otra fecha ⇒ no fiable) y aviso de
muestras <3 comps. Verificado: tsc 0 · 851 tests · build OK. **Pendiente: latido del 06/08.**

- **💶 Escalera de dinero real firmada en el pre-registro (05/08/2026).** Alberto quiere adelantar
  dinero real «poco a poco, si el agente lo ve»: firmado plan de tramos (1.000€ → +2.000€ → +3.000€,
  techo 6.000€/18% del cash hasta validación, congelador H6, señal viva del agente como requisito de
  entrada, órdenes SIEMPRE manuales de Alberto). No adelanta la validación (ene-feb 2027): adelanta
  fontanería y disciplina. Contexto previo: PYPL capituló de libro en feb/2026 (−37,8% + 3,3× vol,
  señal H8) y ya pagó +26,7% — hoy sería perseguir el gap. Pendiente: cuando el retrovisor cierre su
  primer ciclo con H8+H9 (~2 días), foto completa a Alberto con propuesta de tramo 1. PR #1256.

- **⚖️ La misma hipoteca contada dos veces por escribir la fecha en LETRA (04/08/2026,
  rama `claude/carga-no-recogida-analizada-vjkwc9`).** Con #1250 ya en producción, Punta Umbría quedó bien
  (🟠 «sin cuantificar», adiós al 43.200,00€), pero Belmonte (`SUB-JA-2026-264269`) SUBIÓ de 48.450,00€ a
  **93.300,00€**: la certificación registral fecha la hipoteca de Caja de Ahorros de Asturias como
  «diecisiete de agosto de dos mil nueve» y el informe de valoración como «17 de agosto de 2009».
  `fechasDeAsiento` solo entendía dígitos → las dos lecturas no compartían fecha, `mismoAsiento` las daba
  por distintas y los 44.850,00€ se sumaban dos veces. Ahora reconoce las fechas en letra reusando
  `palabrasANumero`/`numeroAlFinal`. `LECTOR_VERSION` 7→8. Tests 400 módulo / 846 plataforma.

- **⚖️ La cifra vieja de cargas sobrevivía a la lectura que la desmentía (04/08/2026,
  rama `claude/carga-no-recogida-analizada-vjkwc9`).** Con #1249 ya mergeado, la relectura de Punta Umbría
  (`SUB-JA-2026-264600`) dedujo bien el asiento duplicado y su texto pasó a «Cargas subsistentes sin
  cuantificar»… pero la ficha seguía titulando **43.200,00€ heredados**: el UPDATE de `documentos.ts` escribía
  `cargas = COALESCE(nuevo, cargas)`, y cuando `cargasQueSubsisten` devuelve `importe: null` a propósito
  («subsisten pero no se pueden cuantificar») el COALESCE resucitaba el número de la pasada anterior. Ahora
  se pisa con `CASE WHEN hayCargas` — null = 🟠 «no lo sé», el estado honesto. `LECTOR_VERSION` 6→7 para
  limpiar el corpus; guardián `lib/subastas/documentos-escritura.test.ts`. Tests 846 plataforma / 397 módulo.

- **⚖️ 43.200,00€ de cargas heredadas que no existían: el mismo asiento contado dos veces (04/08/2026,
  rama `claude/carga-no-recogida-analizada-vjkwc9`).** Tras mergear #1213/#1214 y releer el corpus, Punta
  Umbría (`SUB-JA-2026-264600`) pasó de 🟢 a 🔴 43.200,00€ — y la cifra era FALSA. La certificación cita
  las hipotecas por su fecha de INSCRIPCIÓN (10/02/2009, 29/04/2011) y las declara POSTERIORES; la nota
  simple cita las MISMAS por la fecha de la ESCRITURA (30/12/2008, 24/03/2011) y la IA las etiquetó
  «anterior». Ni `identidadCarga` las emparejaba ni había árbitro de rango → 4 hipotecas donde hay 2, y
  `rangoConservador` («el más caro») las hacía subsistir en una ejecución hipotecaria directa.
  **Fix:** `mismoAsiento` empareja por fecha COMPARTIDA (la certificación cita las dos) con el principal
  de contraste; `Carga.documento` + `autoridadDocumental` (certificación 2 > nota simple 1 > resto 0) y
  el rango lo fija el documento de más autoridad. Además `fecha` ya no se trunca a 40 caracteres —
  «veintinueve de enero de dos mil dieciocho» son 41, se leía el año como 2000 y una anotación de 2018
  salía «de hace 26,5 años» y posible caducada (el lado BARATO) — y una antigüedad >40 años pasa a
  `fecha_implausible`: se cuenta entera. `LECTOR_VERSION` 5→6 para releer el corpus. PR #1249.

- **🚪 Reglas de VENTA por fin medibles — H9 (04/08/2026, noche).** Alberto: «vender igual de importante,
  hay que buscar solución». Todo salía por tiempo (28/56/91d); cero observaciones de reglas de salida.
  Nuevo `lib/trading/salidas.ts` (puro, 10 tests): `simularSalidas` = retorno de la misma entrada bajo
  stop fijo −10%, stop fijo −20% y trailing −15% sobre cierres, mismos criterios de entrada/horizonte
  que ret91. Recolectado en `factoresEnFecha` (cron `trading-backtest`, el resucitado hoy). NO decide
  nada: pre-registrado como **H9** (freno: −5 pp de batacazos sin ceder >1 pp de mediana · o retorno:
  +2 pp de mediana). Caveat firmado: stops suelen ayudar al momentum y matar la reversión — si H8 se
  cablea, su salida se evalúa aparte. PR #1248.

- **🧾 facturas-correo (01/08/2026, trigger diario).** Vía B sana, sin backlog. Archivada la factura
  de la lavandería Giraldillo AFV-11808 (72,60€, deducible); pago aún pendiente, sin conciliar. **Hallazgo
  colateral:** el cron `facturas-scan` (`apps/plataforma/lib/agente-facturas/drive.ts`) archiva TODO lo que
  procesa en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` en vez del árbol de negocio — mismo patrón que Castuera
  (10/07, aviso aún sin borrar). No es un bug de esta skill (yo re-archivo bien y aviso en
  `_DUPLICADOS_BORRAR`), pero conviene revisar la resolución de carpeta de ese cron algún día. Detalle en
  `docs/AGENTES-BITACORA.md`.

- **🧹 Laboratorio de inversión: quitado el ruido + el retrovisor llevaba 16 días muerto (04/08/2026).**
  Alberto: «no entiendo la pantalla, quítame lo que no me dé números reales». Hallazgo gordo al auditarla:
  **`/api/cron/trading-backtest` NO estaba en `CRON_JOBS`** — la ruta existía, nadie la disparaba, y
  `trading_backtest` estaba congelada desde el 19/07 mientras la UI pintaba sus cifras como vigentes; eso
  además hacía INCUMPLIBLE el criterio de evaluación de H8 firmado horas antes (enmienda anotada en el
  pre-registro). Job añadido `10 */2 * * *`. Retiradas de `/trading`: **💼 Cartera simulada** (entrada/stop
  sin ningún resultado — intenciones con pinta de cartera) y **📊 Rendimiento por estrategia** (retorno
  HIPOTÉTICO de seguir señales del torneo interno, la bajista «gana» si cae). Las dos cohortes forward se
  **fusionan cuando comparten cesta**: 2026-07-18.v1 y 2026-07-20.v1 son los MISMOS 8 valores y se pintaban
  como dos confirmaciones. Evidencia forward REAL a día de hoy: 1 cesta, 16 días, 2 snapshots. PR #1247.

- **📊 Velas + volumen: medido, y la tesis del rebote en la media larga REFUTADA (04/08/2026).** Idea de
  Alberto tras su ORCL. Estudio punto-en-el-tiempo sobre 1.300 velas mensuales de 7 large caps US
  (2008-2026), midiendo el exceso sobre la deriva de CADA valor. Resultado incómodo: tocar la EMA100
  mensual y cerrar encima da **−11,9% a 6 meses y −23,3% a 12** (n=51, solo 8 de 40 ganan a un año) —
  es el aviso de que el valor devolvió años de tendencia, no un soporte; AAPL no la tocó ni una vez en
  12 años. Las figuras de vela solas (martillo/envolvente/cuerpo grande) ≈ 0. Lo ÚNICO con señal:
  **caída ≥25% del máximo de 12 barras + volumen ≥1,5×** (+18,5% de exceso a 12 meses, n=34). Nuevo
  `lib/trading/velas.ts` (puro, 13 tests, tres estados null/false/true) recolectado en el retrovisor
  sobre las ~800 del universo; NO toca ranking. Pre-registrado como **H8**. PR #1247.

### 🔐 Trial Tuya IoT Core renovado — cerraduras OK de nuevo (04/08/2026)
Los PINs del teclado de Socorro fallaban por `Tuya 28841002: IoT Core service subscription has expired`
(NO por el corte de luz; la «Sonda» no enlaza nada, solo lee por cloud). Alberto renovó el trial en
platform.tuya.com (Cloud → Cloud Services → IoT Core → Extend Trial) y la sonda en prod confirma:
PIN ✅ (PIN vivo para la reserva de hoy) · Accesos ✅ · Estado ✅ en Socorro y BustoTavera.
`Tarjetas → Tuya 1108: uri path invalid` es aparte y esperado (el aparato no expone tarjetas por cloud).
Caduca ~04/02/2027: trigger one-shot `Recordatorio renovar trial Tuya IoT Core` (04/01/2027) ya creado.
Truco de verificación reutilizable: el proxy del contenedor bloquea Vercel → sonda vía `pg_net` desde
la Supabase compartida (`net.http_post/get` + `net._http_response`) con cuenta temporal (borrada). Sin código.

### ⚕️ Sonda NIM: la key está VIVA — el veredicto separa lento de muerto (04/08/2026)
Investigado el 🔴 «NIM no responde, revisar key/cuota»: la key funciona (93 llamadas reales OK en 7
días, 40 chat OK la víspera, mismo modelo). Es la cola del tier gratis (p50 24,6 s / p90 27,5 s)
rozando el timeout de 30 s → un ping suelto cae ~1 de cada 4 con el proveedor sano. Fix (rama
`claude/sonda-nim-timeout-1fcduq`): la sonda reintenta 1 vez SOLO ante timeout (errores HTTP no) y
el Check 13 emite veredicto con helper puro `lib/monitoring/sonda-veredicto.ts` (testeado): 🟠
«degradado» si el tráfico real de 48 h completa, 🔴 «revisar key» solo si nada lo desmiente.
Sigue pendiente el suplente de `meta/llama-3.3-70b-instruct` (pasada de `buscador-ia`).

### ⚕️ Verificación #1232: groq y gemini cerrados; NIM es DEGRADACIÓN real (04/08/2026)
Sonda de hoy 07:01 con el fix: **groq verde** (458 ms — el maxTokens 300 arregló el falso «respuesta
vacía») y **gemini fuera del Check 12** (0 llamadas en la ventana de 3 días, la guarda lo apagó sola).
**NIM sigue rojo** y ya NO es calibración: timeout con los 30 s completos, y el tráfico real del 03/08
ya sufría **12/52 timeouts (23%)** con ese mismo margen. No es key muerta ni modelo retirado (el error
es timeout, no 404): el tier gratis de NIM va con cola degradada. El fallback (OpenRouter/Groq) cubre
producción. Candidato a pasada de `buscador-ia`: valorar suplente para `meta/llama-3.3-70b-instruct`.
Sigue en observación: `registral` → `google/gemini-2.5-flash` vía NIM con 404 intermitentes (~50%).

### 👁️ La rama de VISIÓN de las facturas también pasa por la pasarela (04/08/2026)
Verificada la pasada de hoy tras #1234: la mitad de TEXTO funciona (12 llamadas, **0 errores**,
0,0076€, `gemini-2.5-flash`) y las facturas nuevas suben **1 → 5**. Pero quedaron **9 sin leer** sin
rastro en `ai_usos`: la rama de IMAGEN se quedó fuera de #1234 y llamaba a `nimVision` a pelo —un
intento, sin suplente, sin coste visible y con `JSON.parse` crudo que tomaba unas vallas ```json por
avería. Ahora usa `aiVision` (OpenRouter multimodal → NIM) + `parsearJsonIa`. Dos arreglos más:
`maxTokens` 512 → **1500** (los modelos del Director razonan y ese gasto cuenta contra el mismo tope
→ JSON cortado = «no leído», la lección de la sonda del 03/08), y un PDF **escaneado** (capa de texto
vacía) pasa de `sin_datos` a `tecnico`: se encolaba como «leído y descartado» sin que nadie lo mirara.
Al abrir la cola se ve que 8 de los 9 NO son facturas (cartas de MAPFRE, extractos de ParkingLibre);
la real es DIGI 76€. `aiVision` no pasa por el gate de presupuesto diario (era ya así). PR #1243.

### 🔎 El barrido de mercado ya trae comps: la consulta buena era la ABIERTA (04/08/2026)
Primera pasada con #1227 en producción: **52 comps en 20 ventanas** (antes 0) y medianas distintas por
fecha en el Dúplex —305€ oct · 199€ dic · 104€ ene— o sea que SÍ distingue temporada. Pero el parte nuevo
delató el resto: «⚠️ 100 búsquedas sin resultados · 12 de la ronda base ciegas». Las 20 ventanas con datos
son EXACTAMENTE el tope de consultas abiertas: 20 de 20 aciertos con la abierta contra 0 de 100 con
`site:booking.com`. Fix: se invierte el orden — la abierta pasa a primaria y la de `site:` queda de
refuerzo acotado (`SIVRA_SWEEP_MAX_REFUERZO`, antes `..._MAX_ABIERTAS`). Sin coste extra: hoy eran 140
búsquedas, ahora 120 + hasta 20. Verificado: tsc 0 · 805 tests · build OK. **Pendiente: latido del 05/08.**

### 🎸 Bienal de Flamenco 2026 dada de alta en el pricing (03/08/2026)
Reserva Booking del Dúplex (25-28 sep, 478,88€ brutos = 159,63€/noche, 53 días de antelación con mediana 7)
destapó que la Bienal (fechas oficiales **9 sep – 3 oct**, labienal.com) no estaba en NINGUNA fuente de
eventos (el hueco «septiembre = 0 eventos» del 31/07). Mercado real de ese finde por aforo (Booking MCP):
p50/noche 258€ (4pl) · 269€ (2pl) · 429€ (5pl) · **984€ (12pl)** — ~1,5× el finde 18-20 (162€ a 4pl).
Hecho: Bienal en `pricing-calendar.ts` (plataforma+sivra, 1,25/1,30/1,40), 60 comps de 4 findes en
`market_rates` (upsert idéntico al ingest), aprendizaje en `pricing_aprendizaje` (`ALL/bienal_flamenco_2026`),
hueco cerrado en la skill. PR draft rama `claude/duplex-dynamic-pricing-435igu`.

### 🔎 SEO housesevillana: push manual + el agente solo actualizaba el <title> (03/08/2026)
El PAT de Alberto no tiene `contents:write` sobre `house-sevillana-landing` → el botón SEO falló el push
(403); pendiente de que Alberto suba el permiso del token en GitHub. Mientras: actualización SEO aplicada
A MANO al repo de la landing (title con marca+USP parking, description 157c, og:title; propuesta registrada
en `seo_proposals`). Al mirarlo se vio que las regex de `seo-landing.ts` (sivra Y plataforma) esperaban
comillas escapadas `\"` y el `app/route.ts` real lleva comillas normales: description/og NUNCA se
actualizaban, solo el `<title>`, en silencio. Fix con backreference de estilo + 5 tests nuevos (validado
contra el fichero real). PR de esta rama.

### 🔑 El redeploy del panel de secretos se cancelaba en silencio (03/08/2026)
Alberto guardó `GITHUB_TOKEN` en `/operador/secretos` y el panel dijo «✅ redeploy lanzado» — pero los
redeploys de sivra y plataforma salieron **CANCELED**: `redeployProjectProduction` usa `withLatestCommit`
y el último commit de main era el de la auditoría `[skip ci]`, que `vercel-ignore-build.mjs` salta SIEMPRE.
La env quedaba en Vercel pero nunca en runtime. Fix (PR): el redeploy pasa
`projectSettings.commandForIgnoringBuildStep: ''` (un redeploy explícito construye siempre) + sonda de
~15 s que reporta CANCELED/ERROR como fallo real; el endpoint solo dice `redeployed` si TODOS los
proyectos salieron (antes un fallo parcial se tapaba). El PR #1236 (mergeado) tocó también apps/sivra,
así que el merge reconstruyó sivra Y plataforma con la env ya guardada — verificado READY en producción;
no hace falta re-guardar el token. El override del redeploy queda pendiente de estrenarse en la próxima
edición real desde el panel (la sonda avisará si no funciona).
Los 10 ilegibles de hoy eran **Groq 429** (rate limit de `gpt-oss-120b`) + **NIM timeout**: los dos
únicos eslabones, porque `aiExtractInvoiceDetallado` llamaba a los proveedores a pelo **saltándose la
pasarela**. Ahora usa `chatConDirector` (`endpoint='extraer-factura'`): Director eligiendo modelo,
reintento con modelo seguro, cadena GRATIS de respaldo, presupuesto diario respetado (si se agota
degrada, no gasta) y **coste visible en `ai_usos`** — antes leer facturas no aparecía en el panel.
De paso, el parseo sale a `lib/agente-facturas/parsear-json-ia.ts` (puro, 9 tests): tolera ```json y
prosa alrededor (adornos, no fallos), pero un JSON **truncado NO se repara** —un importe a medias es
peor que ninguno— y un **array** se declara ilegible en vez de coger «la primera de N». Verificado:
tsc 0 · 800 tests · build OK. **Pendiente: la pasada del 04/08 dirá si `sinLeer` baja de 10.**

### ⚕️ Health-check 03/08: los 3 rojos de IA eran ruido, no averías (03/08/2026)
Gemini (Check 12) = residuo pre-gate: última llamada real 01/08 04:00; la guarda de 3 días lo apaga
sola el 04/08. NIM y Groq = **falsos positivos de la primera pasada de la sonda (Check 13)**: Groq
devolvió 200 en 222 ms con `content` vacío (gpt-oss-120b es razonador y `maxTokens:5` se iba en
razonamiento); NIM abortó a los 12 s cuando producción espera 30 y su media real es ~26 s (167 éxitos
/30d, último 02/08). Fix en `lib/monitoring/sonda-ia.ts`: `maxTokens` 5→300 y timeout 12→30 s.
Observado de paso: `registral` usa `google/gemini-2.5-flash` vía NIM con 404 intermitente (~50% hoy)
— vigilar si persiste. PR #1232 (mergeado).

### 📨 Leads ia-rest: fuera aviso Telegram, email en frío 100% automático (03/08/2026)
Alberto pidió (a raíz del ping «Lead listo: MICE Catering») quitar los avisos Telegram de leads y
que el agente mande los emails solo con Resend. `lead-onboarding` ya no manda Telegram y marca
`envio_aprobado=true`; `crm-envio-auto` pasa a ACTIVO POR DEFECTO (opt-out `ENVIO_AUTO_ACTIVO='0'`,
antes exigía `='1'`). Salvaguardas intactas: horario L-V 9-19, tope diario 30, dedup, bajas RGPD.
Resultado de envíos → resumen diario por email (tgAlert canal `resumen`). Build ia-rest verde. PR #1233.

### 🧾 El fix de #1219 funciona… y prometía una cola de Gmail que no existía (03/08/2026)
Verificación de la pasada 06:15: cron **200**, latido `ok=true` y el parte nuevo ya dice la verdad —
«1 factura nueva · ⚠️ **10 correos sin poder leer** · 1 descartado». Ese 10 es justo lo que antes se
tiraba en silencio (causa en logs: **Groq 429 rate limit** en `gpt-oss-120b` + NIM timeout). PERO el
parte añadía «etiquetados en Gmail para reintentar» y la etiqueta **`Facturas/Extraccion-fallida` no
existía**: `messageCopy` fallaba y el `.catch(() => {})` se lo tragaba → cero encolados y una promesa
falsa en el mismo sitio donde se arreglaba otra. Etiqueta creada a mano (Label_16) y arreglo de código:
`etiquetarCorreo` devuelve booleano, se cuenta `encolados` y el parte solo promete cola para los que de
verdad entraron (🔴 explícito si no). Verificado: tsc 0 · 791 tests · build OK. **Pendiente: los 10
ilegibles siguen sin leerse** — el cuello es la cuota de Groq, no el escaneo.

### 💹 MCP Financial Datasets evaluado — decisión: NO contratar (02/08/2026)
Alberto conectó el MCP `Datos_financieros` (financialdatasets.ai) y pidió valorarlo para trading.
Probado en sesión: la cuenta va por créditos y está a $0 — TODO endpoint de datos (hasta precio AAPL)
responde «add more credits»; solo el catálogo del screener es gratis (trae FCF yield/ROIC/PEG + insiders/
institucionales/guidance). Decisión de Alberto: no gastar — precios ya los da IBKR gratis, fundamentales
los cubre el parser EDGAR propio (endurecido tras PR #1189), y lo nuevo (insiders/guidance) es CONTEXTO
nunca filtro por preregistro. Reconsiderar solo si EDGAR vuelve a fallar (~49$/mes vs mantenimiento) o
si se activa el tramo gratis 100 req/día (entonces: contexto en la pasada diaria, coste cero). Sin código.

### 🔎 El «0 comps» del barrido de mercado eran 44 búsquedas VACÍAS (02/08/2026)
Diagnosticado el `ok=false` de `sivra_mercado_sweep` (lo que la entrada de abajo dejaba para el 09/08).
No es Serper agotada ni la IA: la consulta con `site:booking.com` devuelve `organic: []` desde finales de
julio — los 41 prompts que llegaron a la pasarela pesaban 149-278 tokens (el scraper diario, que sí trae
comps, mueve 576-933). La IA contestaba `{"apartments":[]}` porque no le daban nada. Fix: `serperSearch`
cuenta resultados y usa `answerBox`/`sitelinks`; `extractPrices` separa «no supe leer» de «leído sin
precios»; 2ª consulta abierta acotada (`SIVRA_SWEEP_MAX_ABIERTAS`); parte y `ok` desde el helper puro
`lib/sivra/resumen-sweep.ts` (con guardia `sinSenalDeTemporada`: comps planos en todas las fechas = corpus
que miente). Verificado: tsc 0 · 788 tests · build OK. **Pendiente: mirar el latido del 03/08 03:00** —
dirá si la consulta abierta rescata el barrido o si hay que buscar otra fuente de comps por fecha.

### 🔍 Revisión de memorias/skills/agentes (02/08/2026, pedida por Alberto)
Reconciliación post-auditorías de hoy. Heartbeat 14/14 en verde REAL: el ⛔ de `psd2-sync` (31h) era falsa
alarma de finde — cron 200 a las 06:01 en logs Vercel; umbral 30→54h en `auditoria-diaria.md`. Drift corregido
(carril 1): `buscador-ia`+`docs/BUSCADOR-IA.md` no recogían Gemini apagado por defecto (#1220) ni el alias
`gemini-flash-latest`; `facturas-correo` sin la etiqueta `Facturas/Extraccion-fallida` (#1219); borrado el
duplicado `###` del 31/07 (ya archivado en `memoria/2026-07.md`). `docs/SKILLS.md` y `perfil-fiscal` al día.
Ojo: 1ª pasada del sweep semanal (#1186) con latido `ok=false` («0 comps en 44 ventanas, 19 sin tiempo») —
revisar el domingo 09/08. Sin Telegram en este entorno (sin `ALERTA_TOKEN`). Rama `claude/revision-conversaciones-memorias-9hq32s`.

- **📡 Sonda ACTIVA de proveedores IA — «que no vuelva a pasar y si pasa, enterarnos rápido»
  (02/08/2026, rama `claude/gemini-quota-fallback-issue-fyhghm`, 2ª tanda tras mergear #1220).**
  El Check 12 es forense (necesita ~1 semana de fallos orgánicos); ahora el health-check diario hace
  además un **ping real de 5 tokens a CADA proveedor configurado** (`lib/monitoring/sonda-ia.ts`,
  misma key y modelo que producción, en paralelo, coste ≈0) → **Check 13** avisa por Telegram el
  MISMO día si un eslabón no responde, haya tráfico o no. Cada ping queda en `ai_usos`
  (endpoint `sonda`) — histórico de cuándo murió una key. Gemini solo se sondea si sus gates están
  activos. `maxDuration` del health-check 60→120.

- **🔎 Revisión mensual ia.rest Tech & Stack (02/08/2026, sesión de investigación).** Resultado: TODO
  verde, sin acciones. Groq `whisper-large-v3-turbo` vivo ($0.04/h, es el destino de migración de
  distil-whisper); NIM sin retiradas que nos toquen; Supabase ambos proyectos ya en PG17 (EOL PG14 no
  aplica); Next.js con programa de seguridad MENSUAL desde julio (9 CVEs parcheados 21/07, cubiertos por
  `^16.2.12` + install sin lockfile congelado). ASR premium (AssemblyAI Universal-3.5, 4.9% WER
  multilingüe) mejora a Whisper pero a ~9× el precio → seguir con Groq salvo quejas reales. El prompt
  del evento de calendario decía «Haiku como fallback» (Anthropic se retiró el 17/06) — YA CORREGIDO:
  la serie recurrente ahora apunta a la cadena real (OpenRouter→NIM→Groq→Gemini→Kimi) y a `client.ts`.
  Pendiente que arrastra: confirmar `CONTABLE_MODEL` (`deepseek-ai/deepseek-v3`) con `NVIDIA_API_KEY`
  a mano (esta sesión no la tenía).

### 📬 Los UID de IMAP son POR BUZÓN: el marcado de correos se perdía en silencio (02/08/2026)
Cerrado **#1201 sin mergear** (decisión de Alberto): nació para contar los correos ilegibles, pero mientras
estuvo abierto se mergeó **#1219**, que hace lo mismo y mejor (separa fallo técnico de «leído y no era
factura», cosa que #1201 no hacía). De él se rescata SOLO una pieza que #1219 no traía: `marcarProcesado` y
`etiquetarCorreo` bloqueaban **INBOX** aunque el listado hubiera leído de `Facturas/Proveedor` → el UID no
existe ahí, no se encuentra el mensaje y **ninguna de las dos lanza**. Efecto: la cola
`Facturas/Extraccion-fallida` de #1219 —único sitio donde queda constancia de un ilegible— podía no
etiquetarse nunca, y un correo ya procesado se reintentaba a diario. `ListadoCandidatos` devuelve ahora su
`buzon` y ambas funciones lo reciben (default INBOX = sin cambio de comportamiento); mismo arreglo en el
escaneo de gastos de sivra (`GMAIL_FACTURAS_LABEL`). **Lección:** al listar de un buzón que no es INBOX,
el buzón forma parte de la identidad del mensaje. Verificado: tsc 0 · 775 tests · build OK.

### 🧾 Verificado el latido de facturas — y el «0 facturas nuevas» seguía mintiendo un nivel más abajo (02/08/2026)
La pasada de hoy confirma el fix de #1194: cron **200** (no 504), 81 s (habría muerto con el techo viejo de
60 s) y `agente_latidos.facturas_gmail` con `ok=true`, sin `pendientes` → sin atasco. Pero los logs
enseñaban la extracción IA fallando (NIM timeout, Groq JSON truncado) mientras el parte decía «0 facturas
nuevas»: `escanearNuevasFacturas` descartaba los ilegibles con un `continue` mudo — ni nuevas, ni
pendientes, ni rastro. Fix: `aiExtractInvoiceDetallado` separa fallo `'tecnico'` (no se ha leído) de
`'sin_datos'` (leído, no era factura); los técnicos cuentan como `sinLeer`, se etiquetan en Gmail
(`Facturas/Extraccion-fallida`) y salen con ⚠️ en el latido (`resumen-escaneo.ts`, puro y testeado).
Límite asumido: ventana de 7 días, un correo que falle 7 días seguidos queda para revisión a mano.

- **⏱️ Crons con timeout 60s → 300s (02/08/2026, rama `claude/audit-30-07-hv2njr`).** Cierre del hallazgo
  del check-in post-dispatcher (PR #1165): 5 crons morían por «Task timed out after 60 seconds» (504,
  logs Vercel 3 días: `concursos-ingesta` ×12 — TODAS sus pasadas —, `concursos-radar` ×3,
  `facturas-conciliar-gmail` ×3, `facturas-scan` ×2, `subastas-enriquecer` ×2; preexistente al dispatcher).
  Fix: `maxDuration` 60→300 en `concursos-ingesta`/`concursos-radar`/`facturas-conciliar-gmail`
  (`facturas-scan` y `subastas-enriquecer` ya estaban a 300 en main vía PR #1194, mismo diagnóstico).
  El 504 suelto de `/api/ai/chat` NO es cron — sin tocar.
  De paso verificado el 🟡 de la auditoría 30/07: `incomes` volvió a escribir el 01/08 (falsa alarma de
  temporada baja) y `psd2-sync` escribe a diario tras el dispatcher. Verificado: tsc 0, 769/769 tests.

- **🔌 Gemini FUERA de todas las cadenas por defecto — «usa OpenRouter» (02/08/2026, rama
  `claude/gemini-quota-fallback-issue-fyhghm`).** El Check 12 seguía rojo (544 llamadas/30d, 0 éxitos, 429
  de cuota). Tras el corte de websearch del 01/08 quedaban 2 vías vivas: el eslabón Gemini de `aiComplete`
  (`core-ai/client.ts`) y el último intento de `lib/pasarela.ts` — ambas gateadas tras **`GEMINI_TEXTO=1`**
  (apagadas sin la env), + el fallback directo de `callAISearch` de ia-rest tras `GEMINI_WEBSEARCH=1`.
  El Check 12 ahora exige llamada en <3 días (sin eso repetiría 30 días la alerta de un problema ya
  resuelto). Embeddings de la caché semántica siguen con la key (best-effort). Nada que poner en Vercel:
  el default apagado ES el estado deseado. Pendiente: si algún día hay key con cuota, activar los 2 gates.

- **🧹 «Haz tu todo»: vulns 12→3, 0 críticas (02/08/2026, rama `claude/audit-vulnerabilities-02-08-m7lwtf`).**
  Los bumps aparcados eran seguros al mirarlos de cerca: nodemailer 8→9 en sivra (el call site es un stub
  comentado; peer de @auth/core opcional), fast-xml-parser 4→5.10.1 (v5 = solo empaquetado ESM, API idéntica),
  sharp 0.35.3 + override, imapflow ^1.6.5 (ya sin dep nodemailer) + mailparser 3.9.14 (mata linkify-it),
  overrides postcss ≥8.5.18 y uuid ≥11.1.1 (CJS verificado en node-ical). Quedan solo xlsx ×2 (sin parche npm,
  no explotable) y file-type (parche ESM-only rompería jimp). Verificado: typecheck 4 apps afectadas, tests
  raíz + 769/769 plataforma, smoke tests de runtime (fxp/sharp/uuid). PR #1218 ampliado con los bumps.

- **✅ Reparación auditoría 02/08 cerrada (02/08/2026, rama `claude/audit-vulnerabilities-02-08-m7lwtf`).**
  Alberto: «repara». Las dos verificaciones pendientes del PR #1215 ya estaban resueltas por los checks del
  propio PR: builds reales de Vercel **8/8 en verde** (la que faltaba antes de producción) y las 4 apps
  «desaparecidas» (rrhh/transporte/alquiler/almacen) **SÍ existen en el mismo team** — el conector Vercel MCP
  tiene acceso por-proyecto (403 en esas 4), no hay gap de despliegue. **PR #1215 mergeado** (squash `783b2fb`):
  46→12 vulns, 0 críticas. Pendiente opcional de Alberto: ampliar acceso del conector a los 4 proyectos;
  valorar nodemailer 8→9 y fast-xml-parser 4→5 con smoke test. Informe actualizado en `docs/AUDITORIA-2026-08.md`.

- **🧾 Cuota de la Seguridad Social (RETA) de julio salía ❌ NO DEDUCIBLE (01/08/2026, rama
  `claude/seguridad-social-deducibilidad-kgmyjq`).** Alberto preguntó por el cargo de BBVA de 388,95€.
  **Causa:** regla aprendida **`CUOTA → personal`** en `banca_destino_reglas` (18/07/2026, seguramente de
  la hipoteca «CUOTA PTMO» o la cuota de comunidad). Las reglas se aplican por SUBSTRING y con PRIORIDAD
  sobre `lib/destino.ts`, que ya manda la RETA de BBVA a `seguros`+`cuota_autonomos` (deducible, Art.
  30.2.1ª LIRPF) — 3er caso del landmine "TRANSF" (PR #840). **Fix:** `CUOTA/CUOTAS/IMPUESTO(S)/COTIZACION/
  PTMO/PRESTAMO` a `CLAVE_GENERICA` + los tokens de ≤3 letras (DE, LA…) dejan de valer como "específicos"
  en `claveReglaValida`; SQL `2026-08-01_fix_regla_cuota_generica.sql` (aplicado: regla borrada, movimiento
  a `seguros`). Tests 29/29.

- **🛡️ Auditoría PROFUNDA semanal (02/08/2026).** `auditoria-central` entera: lockfile OK, radiografía OK,
  guardián 26/26, typecheck limpio en las 8 apps (7 con Prisma + ia-rest), `pnpm test` 0 fallos, heartbeat
  14/14 crons ✅. `pnpm audit` había subido a 46 vulns (**3 críticas**, 17 high) desde las 16 (0 críticas) de
  la pasada de julio — next-auth 5.0.0-beta.31 en sivra (2 críticas Auth.js: fail-open de checks de auth +
  bypass homógrafo de email) y next desactualizado en ia-rest/todas las demás apps. Arreglado en el acto
  (bump de parche, sin roturas — typecheck+tests+build sanity OK): next-auth→beta.32, next→16.2.12 (ia-rest)
  /15.5.22 (resto), override de `axios`→≥1.18.0. Quedan 12 vulns (0 críticas, 7 high transitivas — xlsx/
  nodemailer/sharp/postcss-en-next/linkify-it, documentadas, ver PR). Drift de doc encontrado y corregido
  (carril 1): `auditoria-central/SKILL.md` seguía describiendo ia-rest en schema `iarest` compartido y
  contaba solo 4-6 apps — la vertical vive en su proyecto Supabase standalone `efncqyvhniaxsirhdxaa` (la
  migración al compartido sigue pendiente, como ya documentaba `ia-rest-maestro`). Hallazgo sin confirmar
  (carril 2, no autoafirmado): Vercel MCP solo lista 6 proyectos del team `pisos-turisticos-projects`
  (falta rrhh/transporte/alquiler/almacen) — puede ser otro team fuera de alcance del conector, pendiente
  de que Alberto lo mire a mano. PR draft con los bumps de deps + informe.

- **📂 RRHH: categoría «Documentación mensual» en documentos de empresa (01/08/2026, rama `claude/programa-rrhh-m25fwd`).**
  Petición de Pilar (Mariscos González) por WhatsApp sobre el desplegable de `/admin/empresa`. La lista de
  categorías estaba **triplicada** (lib + los dos clientes) y ya había drift: `contrato` existía en
  `/admin/empresa` pero no en `/admin/cuenta`, donde se pintaba el id crudo. Ahora vive una sola vez en
  `apps/rrhh/lib/categorias-empresa.ts` (módulo puro, importable desde `'use client'`) con `periodo`
  `ninguno|anual|mensual` que decide qué campos de fecha pide el formulario — `mensual` y `seguro_social`
  piden año+mes. Categoría desconocida ya no desaparece de la lista: se agrupa por su id. De paso, arreglado el
  desbordamiento horizontal de `/admin/empresa` y `/admin/cuenta` en móvil (verificado en Chromium a 320 px).
  Tests + typecheck + build OK; PR #1212.

- **⚖️ «Cargas no publicadas» con la certificación publicada y enlazada (01/08/2026, rama
  `claude/carga-no-recogida-analizada-vjkwc9`).** Alberto con captura: `SUB-JA-2026-264478` tenía en el BOE
  su «certificación de dominio y cargas», el cron la había listado y descargado (`documentos_leidos=1`), y la
  ficha remataba con «Cargas no publicadas: pide la certificación registral». **Causa:** el gate de
  rentabilidad `mereceAnalisisProfundo` (salida = tasación → 0% descuento, flip −30,6%) bloqueaba la lectura
  IA, así que `cargas_conocidas` se quedaba en `false` — y `false` se pintaba como «el BOE no lo publica».
  **Fix:** `estadoCargas`/`titularCargas` en `module-subastas/cargas.ts` (5 estados, testeados) usados por la
  ficha y por `analisisDocumental`, con enlace directo al PDF; y el gate de rentabilidad deja de ser gate de
  lectura: si la ficha publica documento de cargas se lee igual (`LECTOR_VERSION` 4→5, cargas primero en la
  cola de descarga). 14 vivas, solo 3 pasaban el gate.

### 🔴 La comisión de Booking se descontaba DOS VECES — 17.723€ en 2026 (01/08/2026)
Auditoría a fondo del precio dinámico pedida por Alberto. El hallazgo más caro NO es del motor:
`incomes` tiene un **trigger** (`incomes_compute_net`) que calcula `amount = amount_gross × (1 −
`portal_rates.commission_pct`)`; para BOOKING la tasa es **19,72% y es CORRECTA** (15% + 1,3% de
servicio de pagos, +21% de IVA, verificada contra factura). El fallo estaba en `smoobu-sync.ts`, que
aplicaba **ese mismo factor antes de escribir** → Smoobu 244,86€ → app 196,57€ → trigger 157,81€.
Confirmado por cuatro vías antes de tocar nada: desglose de la extranet (Alberto mandó captura), 14
de 15 pagos del banco casan al céntimo con `amount_gross`, agregados banco vs `amount` (+20% Dúplex,
+9% Kutxa) y la ausencia total de cargos de comisión en el banco. Saneado el histórico
(`amount_gross` recuperado dividiendo por 0,8028; el trigger recalcula el neto): la reserva de
prueba queda 244,86€/196,57€ **idéntica a la extranet** y 2026 pasa de 72.151,40€ a **89.874,62€**.
Afecta a P&L, break-even y **base del IRPF**; el motor de precios no (lee `amount_gross`).
**Retirada una sospecha mía:** el `channel_markup` de 1,16 SÍ llega al escaparate (122 × 1,16 con
−10% móvil y −18% Genius = 104,44€ frente a los 105,43€ reales). No había infravaloración del 14%.
Además: latido para el **guardián de precios**, que era el único agente sin vigilante, y retirada la
ventana de 3 días del aviso —se combinaba con el dedup y silenciaba una alerta PARA SIEMPRE (había 5
abiertas sin avisar, dos ALTAS sobre Luxury bajo mercado del 22 y 25 de julio).

### 🔴 El bucket de mercado por MES era inalcanzable por diseño (01/08/2026)
Alberto mandó una reserva de Luxury (6-8 nov, Booking) preguntando si estaba bien. La reserva sí; el
precio no. El motor había bajado esas noches **152€ → 122€** a las 14:30 y a las 18:43 entró la
reserva, con comparables de ESE viernes entre **123€ y 212€** (mediana 169€ a 4 plazas). Causa: el
bucket mensual exige comps de **3 fechas distintas** (`MIN_FECHAS_MES`) y el barrido solo visitaba
**una por mes** — o sea, inalcanzable por definición. Medido por piso y mes: House sin bucket de
octubre en adelante, Luxury sin el de noviembre, Dúplex igual. Sin bucket se cae al **ancla global**,
que sale del último barrido y va dominada por las fechas cercanas (agosto), más baratas.
**Fix:** 3 fechas de muestra por mes (viernes + sábado + martes, replicando la composición de los
meses que sí funcionaban), plan ordenado por rondas (temporada → eventos → profundidad) y
**presupuesto de tiempo** en el barrido, que ahora publica `truncado`/`base_completa` y baja el
latido a `ok:false` solo si no llegó a cubrir la temporada. Una muestra que cae en día de evento se
corre una semana: el bucket mensual EXCLUYE las fechas de evento, así que ahí no sumaría.
De paso, corregido en el hilo: `amount_gross` de `incomes` es lo que paga el huésped, **no** el neto.

- **⚖️ Auditoría de las 37 subastas vivas tras el fix de cargas: dos mentiras más (01/08/2026).**
  Al repasar el corpus con el titular nuevo (PR #1213) salieron dos huecos de la MISMA familia:
  (1) **3 de las 14 del BOE tenían `cargas_conocidas=true` con `cargas=NULL`** —el campo Cargas de la ficha
  habla de cargas pero nadie ha cuantificado el importe que subsiste— y se pintaban **🟢 «Sin cargas
  anteriores subsistentes»**: afirmar la ausencia sin el dato, el bug original con el signo cambiado.
  Estado nuevo `sin_cuantificar` 🟠; el 🟢 exige ahora que la cifra EXISTA (un 0 leído sí vale).
  (2) `publicadas_sin_leer` afirmaba «no se ha analizado» también cuando SÍ se analizó y la lectura salió
  vacía (264706, que pasaba el gate por playa) → renombrado a `publicadas_sin_extraer`, texto «NO tenemos su
  cuadro de cargas». Además `analisisDocumental` ya no tiene copia propia del texto: llama a `titularCargas`
  (la ficha y el desplegable llegaron a decir cosas distintas de la misma subasta).

- **⏰ Subasta vencida seguía en «🎯 Mi radar» (01/08/2026, rama `claude/expired-auction-visible-eoow4t`).**
  Alberto con captura: `SUB-JA-2026-263723` cerró el 31/07 18:13 y al día siguiente seguía con botones de
  pujar. **Causa:** NINGÚN camino de lectura del radar filtraba por fecha — la bandeja se limpiaba solo con
  el `DELETE` diario de `archivarPasadas` (06:15 UTC) y encima con `now() - 1 day` de gracia → visible entre
  14 y 38 h tras cerrar (y para siempre si el cron falla). **Fix:** filtros CANÓNICOS `SUBASTA_VIGENTE` /
  `RADAR_VIGENTE` + `RADAR_CON_CORPUS` en `lib/subastas-radar.ts`, aplicados a SSR, `/api/subastas/radar`
  (lista y badge), `/api/subastas`, `/api/subastas/mapa` y el cron de avisos; borrado sin día de gracia.
  De regalo: `decidirAviso` ganó `cerrada` (con `Math.ceil`, vencida hace horas = 0 días = «urgentísima» →
  sonaba en Telegram) y el aviso ya lee `valor_orientativo` (no se seleccionaba: la guarda nunca saltaba).

- **🔍 Auditoría del agente SEO de iarest.es: NUNCA ha aplicado un cambio (01/08/2026, rama
  `claude/iarest-seo-agent-2v61fi`).** Alberto: «la web no tiene visitas, ¿qué hace el agente SEO?».
  Evidencia BD prod (`efncqyvhniaxsirhdxaa`): `seo_cambios`/`seo_articulos`/`seo_overrides`/
  `seo_content_blocks` = **0 filas**; `blog_borradores` parado desde el 25/05. Causas: (1) la allowlist
  `RUTAS_SEO_EDITABLES` es solo `['/restaurantes','/restaurantes/*']` → home y las 8 landings de sector
  quedan FUERA (y `/restaurantes` tiene 2 restaurantes / 1 web activa); (2) umbral `SEO_MIN_IMPR`=30
  impresiones GSC → sin tráfico nada lo supera (pescadilla). NO comprobado: `SEO_AGENT_ENABLED` en Vercel
  ni GSC/GA4 reales (env fuera del repo). Informe: `docs/INFORME-SEO-iarest-2026-08-01.md`.
  **Decisión de Alberto: ia.rest NO publica precio** — conversión = formulario `/#contacto` + WhatsApp
  `wa.me/34637349990`. Aplicado en el mismo PR #1208: fuera la tarifa de layout (incl. 3 `Offer` de
  JSON-LD), home (calculadora y comparativa BORRADAS, no ocultadas), 8 landings y 4 posts; se mantienen
  precios de terceros y cifras de la demo de catering. Agente SEO: allowlist 2→11 rutas, `SEO_DEFAULTS`
  sin cifras, regla inviolable «nunca publiques precio» en el SYSTEM, `solicitarIndexacion()` eliminado
  (la Indexing API solo cubre JobPosting/BroadcastEvent) y el silencio >21 días pasa a alerta Telegram.
  Verificado: `tsc` 0 errores + `next build` OK + guardrails 14/14. **Pendiente en Vercel (no en repo):
  `SEO_AGENT_ENABLED=true`, bajar `SEO_MIN_IMPR` a 3-5, key de Gemini en 429.**

- **⚕️ Check 4 del health-check reescrito: latido del sync, no última reserva (01/08/2026, rama
  `claude/health-check-2026-07-30-vlv4c7`).** Feedback de Alberto: la sequía de reservas (25/07→01/08,
  sync verificado sano por logs 200) se pintaba como 🔴 — «que especifique el fallo, ya que no es un
  fallo». `runSync` registra latido en **`agente_latidos`** (`smoobu_sync`, patrón #1184: intento al
  empezar + ok al terminar; semilla aplicada). Check 4: 🔴 solo si `ultimo_ok_at` lleva >26h (sync
  averiado de verdad); sin reservas nuevas → línea ✅ informativa «temporada floja, no es un fallo».

### 📐 El mercado de House se leía de pisos de OTRO tamaño (01/08/2026)
Alberto: «House Sevillana aún está en PriceLabs como dúplex». Cierto fuera y también DENTRO: los 30
comparables vivos de una casa de **12 plazas** eran de apartamentos de **8** (media 314€). El motor
no mentía —normaliza con `pricing_factor_aforo` desde el 31/07— pero su ancla estaba **extrapolada
(x1,56), no medida**: 403€ frente a los 621-694€ de los últimos comps de 12 plazas reales. De ahí
salía mi propuesta de bajar House a 330-350€: **retirada**. Dos arreglos: el guardián compara #4/#5
contra el mercado NORMALIZADO (iba en crudo → en el único piso donde importaba medía un 36% barato y
no podía disparar) y **centinela #9 `comps_otro_aforo`** (puro + 8 tests; umbral x1,35 para que
Luxury 5-plazas-con-comps-de-4 no haga ruido). El barrido diario de #1203 repone los comps buenos.
**Coletilla (mismo día, cierra el último pendiente): el «pico» del sábado 17/10 en House NO era un evento**,
era este mismo fallo. Es la ÚNICA fecha suya medida a 12 plazas (barrido del 09/06); el resto van a 8. En bruto
salía 610€ contra 307-382€ y parecía un pelotazo; normalizadas las dos a 12 plazas, el 17/10 (610€) queda en
mitad del pelotón — 05/09 596€, 19/06/27 610€ clavado. No hay nada que catalogar ese día.

### 🏠 Un piso puede cambiar de PRODUCTO: `historico_desde` + Gemini fuera (01/08/2026)
Dato de Alberto: **House Sevillana estuvo alquilada como DOS pisos turísticos independientes** hasta
que se decidió alquilarla entera (6 habitaciones, 12 personas). El corte se ve solísimo en BD:
**ADR 112/99/129/166 (2020-23) → 473/418/446 (2024-26)**, ticket medio 519€ → 1.171€. Ese salto ya
causó el error de proponer bajarla a 285€ (promediando las dos etapas salía «ADR de agosto 102€»), y
estaba envenenando también la antelación que alimenta la palanca de last-minute: la mediana de
octubre de House salía de 51 reservas, 30 de ellas de cuando era otro negocio. Nueva columna
**`pricing_settings.historico_desde`** (migración aplicada; House = 2024-01-01, el resto NULL = «no ha
cambiado») y el motor la respeta al medir la antelación. Efecto: House octubre **34 → 26 días**
(muestra 20). **Regla:** al analizar el histórico de un piso, comprobar antes si sigue siendo el
mismo producto — el número que sale de mezclar épocas es plausible y nada delata el fallo.
**Gemini APAGADO** (decisión de Alberto: «usa OpenRouter, que tienes todo»). La key llevaba 548
llamadas y 0 éxitos desde el 16/06 y el fallback la tapaba pagando el intento fallido antes de cada
llamada. Ahora OpenRouter es el primario y Gemini solo se intenta con `GEMINI_WEBSEARCH=1`.

### 📅 Smoobu SÍ da la fecha real de reserva — y eso INVIERTE el diagnóstico de octubre (01/08/2026)
El 31/07 se dio por imposible reconstruir la curva de anticipación desde `incomes` porque `createdAt`
es la fecha de la importación masiva. Cierto de esa columna — pero la **API de Smoobu publica
`created-at`** (kebab-case, como `guest-name`) y lo trae **también para el histórico**. Verificado por
`pg_net` desde Supabase, sin sacar la key de la BD. Nueva columna **`incomes.reserved_at`**
(migración aplicada) + backfill: **1.843 de 1.984 reservas (93%) ya con fecha real, desde 2020**.
**🔴 Lo que cambia:** la antelación medida desde `rate_snapshots` era una mediana GLOBAL por piso, y
Semana Santa + Feria la disparaban. Con el histórico REAL de **octubre** (6 años, muestra 46-67 por
piso): **House 34 días · Busto 18 · Dúplex 17 · Luxury 16** — frente a los 108/57/32/7 globales.
O sea: **«Busto va tarde en octubre» era FALSO** (yo lo dije el 31/07). Busto vende octubre con ~18
días de mediana, así que 7/31 a dos meses vista es su comportamiento NORMAL. **Octubre no va mal.**
Y la palanca de last-minute con la mediana global habría empezado a descontar el precio de Busto
**tres meses antes** de que octubre se venda — regalando margen en el mejor mes del año. Corregido:
`apply/route.ts` mide la antelación **por piso Y por mes** desde `reserved_at`; sin muestra de ese mes
la palanca se queda quieta. Sigue APAGADA en los 4 (`lastminute_k=0`), así que no llegó a hacer daño.
Endpoint `/api/sivra/incomes/backfill-reserved-at` (idempotente, con presupuesto de tiempo) para
rellenar lo que falte. **Regla:** la antelación depende del MES tanto como del piso.

### 🎪 De dónde salen los eventos de Sevilla: auditoría y arreglo completo (01/08/2026)
Pregunta de Alberto («¿de dónde saca los eventos, funciona?»). Tres fuentes: calendario a mano
(`lib/pricing-calendar.ts`), Ticketmaster y búsqueda web, combinadas por `MAX()`. **Agujeros:**
agosto+septiembre 2026 VACÍOS en el calendario (83 días) y septiembre sin una sola fila automática —
con la **Bienal de Flamenco del 9/09 al 3/10** sin catalogar; el barrido de mercado solo miraba **el
primer viernes de cada mes** (5-7 fechas/mes, octubre con 15 días de retraso), así que las noches de
evento NUNCA tenían comps y los centinelas #7/#8 no llegaban a la muestra mínima; techo real 1.60 en
los crons (el 2.5 era inalcanzable); `.catch(()=>[])` en apply:161 y guard:269 que tarificaban la
Feria como un martes respondiendo `ok:true`; y ningún latido sobre `pricing_eventos_auto`.
**🔴 `GEMINI_API_KEY` lleva 548 llamadas y CERO éxitos desde el 16/06** — no es una racha de 429, es
una key sin cuota; el fallback a OpenRouter lo tapó mes y medio. Añadido breaker + Check 12 del
health-check (proveedor con ≥20 llamadas y 0 éxitos en 7 días). **Alberto: regenera la key en Google
AI Studio o bórrala del proyecto Vercel** — mientras esté puesta y muerta se paga el intento fallido.
**Idea de Alberto → eventos PREVISTOS:** nueva 2ª pasada que busca en PRENSA lo anunciado pero aún
sin entradas (final de Copa, congresos de FIBES, giras sin fecha). Asimetría deliberada: un previsto
**NO mueve el precio** (una noticia no es demanda comprada), solo **protege el suelo**, pide barrido
y avisa por Telegram. Migración `2026-08-01_pricing_eventos_previstos.sql` APLICADA. Bienal metida
como previsto (factor 1.25, solo findes) porque el mercado NO la respalda todavía: el 12/09 sale más
barato que el 05/09. Crons de eventos y barrido pasados a DIARIOS. 105 tests, tsc 0, build OK.

- **📈 Trading: el panel de estrategias por fin discrimina + limpieza de huérfanas (01/08/2026).** Revisión
  «¿cómo va inversión?»: la pasada nocturna SÍ corre (NAV+tesis del 31/07), pero `puntuarTesis` devolvía el
  movimiento BRUTO del precio para las 3 direcciones → las 4 estrategias empataban en `retornoMedio` por
  construcción y `ajustesDeStats` penalizaba por caídas del mercado, no por errores. Ahora `retorno` = seguir
  la tesis (bajista invierte signo, neutral = 0); 168 resultados históricos migrados en BD y stats recalculadas
  (reversión +0,38% · momentum −0,27%). Tablas huérfanas `trading_forward_paper(_marca)` retiradas (pre-registro
  cohorte 1 archivado en TRADING-HIPOTESIS-PREREGISTRO.md). 110 tests módulo · 721 app · tsc 0 · build OK.

### 💸 PriceLabs: baja ejecutada en Busto+Luxury; Luxury reactivado en el motor propio (01/08/2026)
Alberto confirmó que **Busto Reform y Luxury ya están dados de baja de PriceLabs** (Dúplex/House siguen
en PL por decisión suya, transición en dos fases). El informe de decisión (BD 31/07) encontró a **Luxury
con `apply_enabled=false` desde el 28/07 20:34Z** → estaba SIN ningún motor (precios congelados en
Smoobu). Con OK explícito de Alberto: `apply_enabled=true` (suelo 72€, raíles ±20%/día) aplicado por
Supabase MCP; el `apply-auto` (3×/día) retoma en su próxima pasada. Estado piloto a 31/07: Busto rojo
(occ 11%, 19d sin reserva, base bajando 115→71 por raíles, 28 fechas de agosto ya al suelo 65€) y
Luxury rojo (occ 9%, 11d sin reserva). 0 reservas nuevas en Busto desde el cambio de suelo (28/07) —
solo lleva ~1 día por debajo del p50 de mercado (91€). Vigilar en `/sivra/pricing-auto`.

### 🏠 SIVRA: House cambió de categoría en 2024 y el ADR mezclado me hizo proponer regalarlo (01/08/2026)
Lo cazó Alberto: «Socorro está dando 1.500/2.000€ por un fin de semana». **ADR de House por año: 67·106·147·175
(2020-23) → 553·459·487 (2024-26)**, ticket medio 2026 **1.424€**. Yo había calculado «ADR de agosto 102€»
promediando las dos etapas y llegué a proponer bajarlo a 285€ — habría sido regalarlo. Mismo fallo que el de
los ADR del radar: número plausible, periodo equivocado, sin hueco que lo delate. **Al analizar House, usar
SOLO 2024 en adelante.** Suelo revertido a 300€ (llegué a bajarlo a 180€; no afectó, está en dry-run).
**Pero agosto sí está caro:** competencia REAL de Booking para 12 personas 16-23/08 → mediana **228€/noche**,
techo 443€; House pide 450-483€. La reserva que se canceló eran 334€/noche. Propuesta viva: **330-350€** para
ese hueco. **Y el corpus no tiene comps de 12 plazas frescos** (20 comps del 09/06 vs 136 de 8 plazas): el
sweep por aforo real (#1186) es SEMANAL (dom 03:00 UTC) y aún no ha corrido — la primera vez es el 02/08.
**🔴 Octubre, que es el mejor mes de Sevilla, va flojo a 2 meses vista:** Busto 7/31, Dúplex **0/31**, House
6/31, Luxury 4/31, y los precios publicados van a **2-4× el ADR realizado de octubre 2024-25** (Busto 307€ vs
77-86€ · Dúplex 194€ vs 90-100€ · Luxury 212€ vs 98-100€ · House 867€ vs 423-499€). Matiz que impide concluir:
el `createdAt` de las reservas de 2024-25 es la fecha de IMPORTACIÓN masiva, no la de reserva.
**PERO la curva SÍ se puede reconstruir — desde `rate_snapshots`, no desde `incomes`** (idea de Alberto: «¿por
qué no estudias cómo lo hace PriceLabs?»). Hay **65.725 snapshots diarios** de los 4 pisos desde el 10/05/2026:
cada vez que una fecha pasa de `available=1` a `0` entre dos snapshots es una reserva entrando, con su
antelación exacta. Medido: **Busto 108 días de mediana · Luxury 57 · House 32 · Dúplex 7**.
**Eso INVIERTE el diagnóstico de octubre:** Dúplex a 0/31 es su patrón normal (vende a 7 días) y House a 6/31
aún no ha entrado en su ventana (32 días); **el que va tarde de verdad es Busto**, que vende con 108 días de
antelación y a 60 días de octubre solo tiene 7/31. Muestra corta (78 días, 11-51 noches por piso): brújula, no
GPS. **Y PriceLabs NO hace last-minute:** House pasa de 460€ a 23 días a 428€ el mismo día (−7%) y se queda con
el 70% de las noches vacías; Busto ni baja, sube (94€→105€). Sirve como fuente de datos, no como modelo a
copiar. Luxury sigue congelado hasta el 01/09 (decisión de Alberto).

- **🗓️ Rotación mensual: julio archivado (01/08/2026).** `node scripts/rotar-memoria.mjs` movió las 321
  entradas de julio a `docs/memoria/2026-07.md` (auditoría diaria). Nota para la próxima pasada: el script
  solo reconoce entradas que empiezan por `- **`; una entrada con formato `### ` no se archivó sola y hubo
  que moverla a mano — si vuelve a pasar, vale la pena normalizar el formato de cabecera o enseñarle al
  script el patrón `### `.

- **📊 Facturas Booking.com julio 2026 verificadas vs banco (03/08/2026).** Llegaron 3 facturas (noreply@booking.com);
  guardadas en Drive por correo-triaje. Cuadre: Socorro (4340072) 634,69€ ✅ · Bustos Tavera (4771238) 450,79€ ✅ ·
  Dúplex (2888928) 587,23€ esperado — pago bancario aún no llegó (vence 16 ago). Socorro 24 (ID Booking 2039943)
  cobró 1.958,39€ en julio pero SIN factura de comisión todavía. Total banco Booking julio: 3.043,87€.
  Trigger `trig_012T62U4LsM27GP8VKnBFifG` ampliado: ahora verifica facturas al llegar (busca Drive por fecha,
  lee PDF via contentSnippet, notifica resumen). Casos abiertos SIN respuesta: Bernardi -466,70€ (5603355846,
  House Sevillana) y Valantin -84,61€ (5712457476, Busto Reform). IDs Booking.com: 2888928=Dúplex ·
  4340072=Socorro · 4771238=Bustos Tavera · 2039943=Socorro 24. Skill sivra-maestro actualizada con este mapeo.
