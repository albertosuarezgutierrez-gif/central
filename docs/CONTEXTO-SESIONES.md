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

## 📌 Estado actual (lo más reciente arriba)

- **🧾 facturas-correo (02/08/2026).** Pasada diaria: Vía B sana (dias_caido=1), sin backlog. 2
  candidatos: parking de Pilar (Islantilla/Isla Cristina, cuenta propia) → personal; pedido Amazon
  roborock 247,92€ entregado en "Costa Ballena (Rota), Cádiz" (sin match con ninguna propiedad
  conocida) → `Facturas/Revisar`, pendiente de que Alberto diga si es de un piso o personal. Detalle
  en `docs/AGENTES-BITACORA.md`.

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

### 💓 El latido de facturas no faltaba: la pasada moría en 504 antes de escribirlo (31/07/2026)
Aviso «🧾 Escaneo de facturas: sin ninguna señal registrada» el mismo día de estrenar el vigía (#1184).
No era IMAP ni la app-password: `facturas-scan` corre a diario y **muere en 504 a los 60 s** (3 de sus
últimas 4 pasadas), a mitad del escaneo — ese 06:16 ya había insertado IONOS y Punto y Coma — sin llegar
nunca a `registrarLatido`, que estaba al final. Fix: `maxDuration` 60→300 **+ presupuesto de tiempo**
(deadline en el escaneo y en el listado IMAP, que devuelve `truncado`), **latido de intento al empezar**
y el definitivo justo tras el escaneo, y `evaluarLatido` con `ultimo_at`+`detalle` para separar «no se
dispara» de «se dispara y no termina». Verificado: tsc 0 · 702 tests · build OK · upsert probado en BD.
**01/08:** la pasada de las 06:15 (previa al merge) volvió a dar 504 (`agente_latidos` sigue vacía, ninguna
factura nueva desde el 31/07) — los logs añaden el porqué: los reintentos de `aiExtractInvoice` (NIM timeout,
Groq JSON truncado) son los que se comen los 60 s. **PR #1194 mergeado 01/08 07:40 UTC.** `agente_latidos`
sigue sin fila `facturas_gmail` a las 02:00 UTC del 02/08 — normal, el cron (`06:15 * * * *`) solo ha corrido
una vez desde el merge (01/08 06:15, con el código viejo); primera pasada con el fix: 02/08 06:15 UTC, a
revisar en la próxima auditoría.

- **🗓️ Rotación mensual: julio archivado (01/08/2026).** `node scripts/rotar-memoria.mjs` movió las 321
  entradas de julio a `docs/memoria/2026-07.md` (auditoría diaria). Nota para la próxima pasada: el script
  solo reconoce entradas que empiezan por `- **`; una entrada con formato `### ` no se archivó sola y hubo
  que moverla a mano — si vuelve a pasar, vale la pena normalizar el formato de cabecera o enseñarle al
  script el patrón `### `.


