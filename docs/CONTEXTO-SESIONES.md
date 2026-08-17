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
> **📌 «Estado vivo» (bloque al final):** SOLO pendientes y decisiones abiertas, en
> sub-bullets de 1-3 líneas — no es un segundo diario: el relato de cada sesión va en su
> entrada fechada y el detalle en el PR. Al cerrar un pendiente, borra su bullet; al
> actualizar el bloque, re-fecha su cabecera (si su fecha queda en un mes cerrado, la
> rotación se lo lleva al archivo).
>
> **Formato de cabecera de entrada:** `- **… (dd/mm/aaaa).**` o `### … (dd/mm/aaaa)` —
> son los ÚNICOS que `rotar-memoria.mjs` reconoce como entrada; una cabecera `## ` se
> funde con la entrada anterior y se archiva mal.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

### 🔑 (17/08/2026) SEO housesevillana: push 403 — el PAT quedó atrás en la unificación de la landing
- El cron `/api/seo-refresh` (lunes 10:00 UTC, primero tras unificar la landing el 12/08) falló al
  commitear: `403 Resource not accessible by personal access token`. Causa: los `seo-landing.ts`
  apuntan ya a `central`, pero `GITHUB_TOKEN` es el PAT del 03/08 scoped SOLO al antiguo repo externo
  `house-sevillana-landing`. El GET no delató nada porque `central` es público; solo el PUT falla.
- **PENDIENTE de Alberto (ops):** crear/re-scope del PAT con `contents:write` sobre
  `albertosuarezgutierrez-gif/central` y guardarlo en `/operador/secretos` (write-through sivra+plataforma).
- Repo: pista de diagnóstico en el 403 de ambos `pushToGitHub` + corregida la nota estale de
  `apps/sivra/CLAUDE.md` que aún citaba el repo externo. **PR #1470 MERGEADO** (tests seo-landing 8/8,
  previews sivra+plataforma OK); landmine añadido a la skill `sivra-maestro`. El cron seguirá en 403
  hasta que se rote el PAT — verificación real: botón manual de `/sivra/seo` o el cron del lunes 24/08.

### 💳 (17/08/2026) Check 7 cuadre tarjetas: falso 🔴 tras cada liquidación, arreglado
- Alberto: «los movimientos de 2.013,37€ los he pasado varias veces, ¿lo vuelvo a subir?». No: el
  desglose de julio de la ****0300 SÍ estaba (94 compras). El check exigía el espejo `PAGO RECIBO`
  del mismo día, que ABRE el extracto del mes SIGUIENTE (landmine PR #1300) → 🔴 durante ~un mes
  aunque el desglose estuviera. Y pedía «el extracto de agosto» cuando lo que faltaría es JULIO.
- Fix: sin espejo, valen las compras del mes del CICLO en la cuenta `TARJETA-KUTXA-<últ.4>`;
  veredicto 3 estados en `lib/cuadre-tarjetas.ts` (puro+tests; sin PAN = «no puedo comprobarlo»).
  SQL validado contra BD real (0300 → ✅, 0302 → 🔴 julio). La ****0302 de Pilar sigue faltando.

### 🧊 (17/08/2026) Cohorte 3 DOBLE congelada (H5) + primer contraste forward vs retrovisor
- PR #1460 **MERGEADO y verificado en prod**: cohorte 3 DOBLE en `COHORTES_PAPER` según H5 —
  `2026-08-17.v1` (combinada sp500, 25 valores, con `simbolosBase`) + `2026-08-17.factores.v1`
  (factores-solo: SNDK/BKNG/MU/WDC/NLY/STX/CMCSA/MOH/VICR/UMBF). `/seleccion` sp500 sirve
  `simbolosFactores` (verificado = cesta congelada) y `/paper` mide 4 cohortes (las 2 nuevas a 0d,
  `resultado null` correcto). Skill `trading-analista` + pre-registro (H5 ejecutada) actualizados.
- Contraste forward (~28d) vs retrovisor: NI confirma NI desmiente — alpha mediano −1,65 pp (cohortes)
  / −2,22 pp (radar, 0/1 ventanas), zona de ruido declarada a 28d; nada del pre-registro evaluable
  hasta ~91d (~oct). Doc: `docs/TRADING-FORWARD-VS-RETROVISOR-2026-08.md`.

### 💼 (17/08/2026) Cartera REAL de IBKR en el panel /trading — la compra de VWCE no aparecía
- Alberto compró 188×VWCE (~31.840€, ETF núcleo) y el panel solo pintaba paper. Nuevas tablas
  `trading_cartera_real(+_sync)` (aplicadas + sembradas con la foto de hoy), endpoint
  `POST /api/trading/cartera` (mismo auth/resolución de cuenta que `/saldo`) y sección
  «💼 Cartera real» en `/trading` (solo con sesión; el invitado NO la ve). Totales POR divisa,
  NULL nunca 0, sync-marker separa «sin leer» de «sin posiciones».
- La pasada diaria gana el paso 1c (skill `trading-analista`): empuja `get_account_positions`
  al endpoint cada noche — SOLO con lectura buena; fallo de lectura ≠ cartera vacía. PR #1468.

### 📸 (17/08/2026) Stories de Instagram salían recortadas — lienzo 9:16 real en ig-img
- Alberto mandó pantallazo: la Story auto de ia.rest se veía fatal (el «2» y el texto cortados,
  casi todo negro). Causa: `ig_aprobar` republicaba como Story la MISMA imagen cuadrada 1080×1080
  del feed, e Instagram la escala a pantalla completa 9:16 recortando los laterales.
- Fix: `/api/ig-img` acepta `story=1` → lienzo 1080×1920 con el arte cuadrado centrado sobre el
  fondo de su propia plantilla (bandas del mismo color → se ve nativo). El callback de Telegram
  publica la Story (y el fallback manual por foto) con `&story=1`. Verificado con render local
  (stat editorial, pregunta, brutalist) y en prod tras el merge. `next build` verde. PR #1467
  mergeado; skill `ia-rest-maestro` (tabla de agentes) actualizada con el detalle de la Story.

### ✅ (17/08/2026) Kutxabank PSD2 RESUELTO — era la VENTANA de 89 días (+2 fixes de camino)
- Causa raíz: Kutxabank rechaza `/transactions` con ventana de 89 días («Account not found /
  AccountNotAccessibleException», error engañoso) incluso recién firmado el SCA. Fallback 89d→30d→7d
  en `getMovimientosConVentana` (PR #1462) → feed vivo, último mov = HOY. Aviso ℹ️ informativo
  («importado solo desde X») que NO pone el semáforo en rojo (PR siguiente, tests 11/11).
- De camino: (a) el retiro `estado='sustituida'` del PR #1459 reventaba contra el CHECK de
  `conexiones_banco` → migración `conexiones_banco_estado_sustituida` aplicada (por eso fallaron los
  4 re-vínculos de la mañana, en silencio); (b) el callback ya loguea cada desenlace (PR #1461);
  (c) nuevo `POST /api/banca/psd2/sync` + botón «🔄 Sincronizar ahora» en el panel PSD2 de /banca
  (reintentar sin quemar SCA). OJO: el botón está en el segmento 💶 Dinero del Inicio (no en Negocios).
- Vigilar mañana: cron psd2-sync 06:00 debe traer Kutxa con la nota ℹ️ y sin rojo.

### 🏦 (17/08/2026) Kutxabank PSD2: el re-vínculo del 16/08 NO funcionó — diagnóstico + fixes
- Alberto vinculó 2 veces el 16/08 (07:46 y 08:30); hoy las 3 conexiones Kutxa `vinculada` fallaban:
  las 2 viejas con `authentication failure`, la nueva (08:30) con `Account not found` en `/transactions`
  DESDE EL MINUTO CERO (el callback del 16/08 no importó nada — no es caducidad por tiempo). Último mov 10/08.
- Saneado en prod: conexiones 14/06 y 16/08-07:46 → `caducada` (solo queda viva la de las 08:30).
- Fixes (este PR): el callback retira las conexiones anteriores del mismo banco al vincular
  (`estado='sustituida'` — fin de los zombis); el sync lee el `status` de la sesión de Enable Banking
  y avisa si no está `AUTHORIZED` (diagnóstico de raíz que hoy faltaba).
- **Pendiente Alberto: mergear el PR y re-vincular Kutxabank UNA vez en `/banca`** (el callback
  sincroniza al momento y rellenará el hueco 11/08→hoy; ventana 89 días). Tras vincular, mirar
  `conexiones_banco.ultimo_avisos` — con el fix dirá el estado real de la sesión si vuelve a fallar.

### 🧮 (17/08/2026) Fix doble conteo en el P&L por piso (`getPLMensual`)
- La query «gastos de tarjeta» sumaba CUALQUIER movimiento con `propiedad_id`+confirmado — cogía
  también los recibos de la corriente Kutxa (luz/agua/IBI de House, que llevan `propiedad_id` para lo
  fiscal) y ya entran por factura en `gastos` → doble conteo. Ahora exige `cuentas_bancarias.tipo='tarjeta'`.
- Efecto medido (junio, House): 420,31€ → 123,45€ en «otros» (solo la compra real de tarjeta).
  OK de Alberto tras explicárselo. Suite 1232/0, tsc 0.

### 🏦 (17/08/2026) Gastos fijos de House (Socorro) dados de alta desde banca real
- Alberto: «los gastos de Socorro están en la cuenta de Kutxa» → derivados de `movimientos_bancarios`
  y dados de alta en `gastos_fijos` (2 filas, `origen='manual'`): IBI 40,49€/mes (2 plazos ~242,93€;
  2º plazo nov ESTIMADO, confirmar al cobrarse) + seguro Occident 49,45€/mes (593,45€/año, 16/01).
- Suministros NO van en fijos (ya entran por factura en `gastos`; duplicarían). Skill pricing-agente
  actualizada en el PR #1457. El recibo Ayto. 130,93€ (16/04) era de MONTE CARMELO (confirmado por
  Alberto) → reclasificado en banca a `personal`+`ibi` (estaba como gasto de House, deducible en falso).
- ⚠️ Hallazgo aparte SIN tocar: `getPLMensual` (query «tarjeta») suma CUALQUIER movimiento con
  `propiedad_id`+confirmado, no solo tarjeta → los recibos Kutxa de House (luz/agua/IBI) pueden
  contar DOBLE contra sus facturas de `gastos` en el P&L por piso. Decidir fix con Alberto.

### ✅ (17/08/2026) PR #1449 (ciclo Booking +20%) MERGEADO + sincronía de skills/docs con el 1.20
- #1449 mergeado (inventario + Fases 1-3 ejecutadas y verificadas). Post-merge: actualizados la
  skill `pricing-agente` (estado-y-protocolo), el comentario del markup en `pricing/apply/route.ts`
  y `pricing-automatico.md` — la nota del 09/08 («channel_markup=1.0») quedaba como trampa: una
  sesión podía «corregir» el 1.20 de vuelta. **Regla: el markup del motor es el ESPEJO del ajuste
  real del canal Booking en Smoobu (hoy +20% ↔ 1.20); si cambia uno, cambia el otro, Smoobu primero.**
- BD verificada post-merge: `channel_markup=1.20` y `enabled=true` en los 4. Vigilancia del PR
  retirada. Quedan las rutinas: medición Fase 4 (30/08) y renovación oferta 8% (01/11/2028).

### 🏷️ (17/08/2026) Revisión post-ciclo pricing: los 2 accionables del 17/08, resueltos
- Las 3 fechas `no_disponible` de House (12-sep, 10-oct, 17-abr-2027) SÍ tienen reserva real con
  income (Booking: 1.344€ / 2.044,74€ / 3.318,47€ brutos — la de Feria a ~1.659€/noche). No hay
  bloqueo manual ni sync roto: el chequeo del ciclo las dio por «sin income» en falso. Nada que tocar.
- La muestra ruidosa del 29-ago NO es puntual: 364 filas / 36 fechas de House con comps a <12€/plaza
  (44-104€ para 12 personas = precio de habitación), **todas `fuente='serper'`** (sweep, desde 04/08).
  **Filtro de plausibilidad €/plaza APLICADO con OK de Alberto** (`pricing-comps-plausibles.ts`, umbral
  12€/plaza, comps sin aforo no se juzgan): apply (3 consultas) + guard (#4/#5/#7/#8/#9) + recommend/
  pilot-track/settings. Efecto medido: +14/+38€ en p50 de fechas contaminadas, 0€ en las limpias.
- Reservas Dúplex del 16/08 verificadas OK: 3-5 oct y 16-18 oct a 137-140€/noche bruto con listado
  en mercado (p50 fiable 171/184,5€); el descuento es el canal (~0,78-0,80), no infraprecio.
- 2ª tanda («haz todo», OK de Alberto): rutina `mercado-booking` sube de 12→24 ventanas/pasada
  (plan de 464; objetivo: 3 fechas/mes fiables para retirar Serper). Suelo estacional de House
  verificado con la serie 2024+ → NO está plano en la práctica (FLOOR_SEASONAL ya modula: abr 390€
  vs peor venta real 428€); pendiente cerrado, aprendizaje en `pricing_aprendizaje` id 74. El «ADR
  agosto 62€» era artefacto de reservas DIRECTO/OTRO a 0-200€ (huecos de amigos) — al analizar House
  excluirlas. `gastos_fijos` de House sigue a 0 filas: hace falta que Alberto pase IBI/seguro/
  suministros (no se inventan). FLOOR_SEASONAL nov ×1,00→×1,10 APLICADO («lo q veas mejor» de
  Alberto): suave a propósito — House 330€ de suelo nov, justo sobre su peor venta real (~263-310€
  de listado), sin cerrar la puerta al mercado flojo; el pricing lo sigue decidiendo el mercado.

### 🔴 (17/08/2026) Swap NIM verificado en vivo: 70B→GLM-5.2 · contable→deepseek-v4-flash (PRs #1454+fix)
- NIM retira el 3.3-70b el **25/08/2026**. 1ª elección (Maverick, PR #1454 mergeado) resultó **410 Gone
  en el API** (EOL 27/07 con la ficha web aún viva) — cazado al probar con la key real vía harness en
  una edge function de ia-rest + `pg_net`. **La ficha de build.nvidia.com NO prueba que el modelo viva.**
- Final, todo probado con llamadas reales: default NIM **`z-ai/glm-5.2`** (mini-eval A/B 2/2) y
  `CONTABLE_MODEL` **`deepseek-ai/deepseek-v4-flash-0731`** (el `deepseek-v3` YA NO existe en `/v1/models`
  — cerrado el "sin confirmar" del 27/07). Radio completo re-swapeado; 4 edge functions redesplegadas
  (Supabase MCP) y `nim-sentiment` probado end-to-end. Ids OpenRouter `meta-llama/*` NO tocados.
- Detalle y regla nueva del Paso 1 (id vivo = está en `/v1/models` o responde) en `docs/BUSCADOR-IA.md`.

### 🧾 (17/08/2026) facturas-correo — hueco real en `facturas_drive` (SiQueBrilla julio) + autocrítica
- Paso 4.0 sin `sin_revisar` y sin candidatos Gmail nuevos, pero la raíz de `FACTURAS Apartamentos/2026`
  seguía teniendo ~30 PDFs sueltos: al investigar, casi todos ya estaban cubiertos por avisos previos en
  `_DUPLICADOS_BORRAR` (Endesa Bustos/Dúplex, EMASESA Reform ×9, Castuera, Leroy, Dimitri/CREATE) — no
  eran backlog nuevo. El hueco real: la factura SiQueBrilla de julio (780,10€) SÍ estaba archivada en
  Drive y conciliada en banco desde el 03/08, pero sin fila en `facturas_drive` → invisible para
  `v_facturas_sin_cargo` (esa vista solo detecta filas existentes sin `movimiento_id`, no filas
  ausentes). Fila insertada.
- **Autocrítica:** antes de verificar bien, copié 2 duplicados nuevos (SiQueBrilla + Leroy) sin
  comprobar que ya existían archivados — avisos de borrado añadidos a la papelera para los dos.
- Etiqueta `Facturas/Extraccion-fallida` retirada de un hilo que era un mensaje de huésped de Booking
  (falso positivo, no factura). `agente_salud` actualizado (Vía B: dias_caido=3, sin backlog real).
- Papelera `_DUPLICADOS_BORRAR` acumula ~22 avisos sin que Alberto los haya vaciado — mencionado en el
  resumen, no bloqueante.

### 📊 (17/08/2026) Ciclo semanal de pricing — los 4 pisos, comps por conector real
- Ciclo completo del agente de pricing (skill `pricing-agente`): medido el ciclo anterior (10/08) contra
  incomes/rate_snapshots (ventas confirmadas de busto SS/Feria a precio decidido, 4 ventas nuevas en
  luxury/duplex en octubre), sembrado mercado en las 4 propiedades (12 ventanas: 1 finde/mes ~10 meses +
  Semana Santa + Feria, vía Booking/Trivago/Tripadvisor MCP) y aplicado en dry-run (48 decisiones,
  circuit-breaker sano en los 4 pisos).
- **Comps escritos hoy: busto=406 · duplex=263 · luxury=322 · house=186** (ninguno a 0).
- Pendiente sin cerrar (no bloqueante): 3 fechas de House quedaron `no_disponible` sin income que lo
  confirme — mismo patrón ya visto con busto/Feria (posible bloqueo manual o reserva aún sin sincronizar).
  Detalle en `pricing_aprendizaje` (`ALL`/`ciclo_17_08_2026`).

### 📈 (16/08/2026) Fases 1+2 del +20% Booking EJECUTADAS (Smoobu + motor)
- **Fase 1 (Claude Chrome, `docs/BOOKING-FASE1-SMOOBU-2026-08-16.md`):** `priceDifference` del canal
  Booking en Smoobu 0% → **+20%** (campo ÚNICO por canal, cubre los 4 pisos; resto de portales a 0%),
  push forzado con «Sobrescribir precios» (guardar NO basta). Hallazgo: el rótulo «Sobrescritos por
  PriceLabs» de Smoobu es LEGACY — PriceLabs está de baja desde el 09/08, los precios los escribe el motor.
- **Fase 2 (BD):** `pricing_settings.channel_markup` 1.0 → **1.20** en los 4 pisos. El motor re-basa en
  el siguiente `apply-auto` (08:30/14:30/20:30 UTC); hasta entonces Booking muestra ~+20% (lado seguro).
- **17/08 ✅ Verificación A5 hecha:** los 4 pisos cuadran `extranet = techo(base×1,20)` (24.08:
  113/125/126/360€); web directa confirmada al 100%. **Paso B (ocupación) DESCARTADO definitivo:**
  Smoobu no modela ocupación (precio plano por noche) y PriceLabs está de baja — no hay palanca.
  👀 Para Alberto: Reform publica Standard Rate «×2» (¿capacidad real?), House «Configurar»/×11.
  Medición Fase 4 programada 30/08 (`trig_01DHwh…`).

### ✂️ (16/08/2026) Cambios EJECUTADOS en la extranet de Booking (Fase 3 del estudio)
- Vía Claude Chrome → `docs/BOOKING-CAMBIOS-2026-08-16.md`: **Genius dinámico → No** en
  Luxury/Reform/Dúplex (tramos fijos 10/15/20 intactos); **NR de Luxury −15% → −10%**;
  **Oferta estándar 8%** en los 3 (16/08/2026–**31/12/2028**, ⏰ renovar; no permite «sin fin»).
  House Sevillana: cero cambios. Apilado máx. −37%→−33,8% s/ standard; suelo no-Genius 0%→−8%.
- **Parado a propósito:** precios por ocupación de Luxury — el Standard Rate es XML de Smoobu
  (sobrescrito) y la extranet solo acepta €-fijos por fecha → hacerlo en **Smoobu** (pendiente).
- Siguientes fases: +20% Smoobu = **solo UI de Smoobu, no hay conector ni API para el ajuste por
  canal** (Alberto o Claude Chrome) → SOLO DESPUÉS `channel_markup=1.20` (Claude; el orden es
  crítico, ver estudio). Rutinas programadas: medición Fase 4 el 30/08 (`trig_01DHwh6a38D4…`,
  incluye mirar volumen/conversión, no solo la mediana) y renovación de la oferta el 01/11/2028
  (`trig_01SDP3vfKHxZ…`).

### 🏷️ (16/08/2026) Inventario de descuentos Booking — el −29% explicado
- Pasada de solo-lectura por la extranet (Claude Chrome) → `docs/BOOKING-DESCUENTOS-INVENTARIO.md`
  (copia también en Drive). El −29% de Luxury Busto = **Genius dinámico ~21,5% × móvil 10%**
  (reserva 6509021916 verificada: 430€ vs 609€ de calendario).
- Hallazgos clave: Genius dinámico 0-30% ACTIVO en 3 de 4 pisos (House Sevillana en «No» → su
  exposición máx. es −23,5% vs −37/−46,5% del resto); Luxury Busto con NR a −15% (resto −10%);
  país+móvil no se acumulan (misma categoría); sin campañas activas; Luxury sin precios por ocupación.
- Alimenta la Fase 3 del estudio de posicionamiento (PR #1448): decidir dinámico sí/no ANTES del +20%.

### 💓 (16/08/2026) Sonda del verificador de eventos + guarda de regresión (PR #1447)
- El parte «Sin poder comprobar» decía la verdad: `sivra_eventos_verificar` se declaró en
  `AGENTES_VIGILADOS` (12/08) sin su sonda en `PROBES` del cron `agentes-latido` — el agente SÍ
  late (verificado en BD: hoy 05:30, «3 previstos revisados · 3 confirmados»), el vigía no tenía
  query para leerlo. Fix: sonda gemela de `sivra_eventos`; la sonda exacta probada contra la BD real.
- **Guarda nueva en `latidos.test.ts`**: todo id de `AGENTES_VIGILADOS` debe tener clave en `PROBES`
  (verificada en rojo contra el estado pre-fix). tsc 0 · 1227 tests · build OK.
- Docs al día: regla en `apps/plataforma/CLAUDE.md` (§Latidos) y `docs/RUTINAS-PROGRAMADAS.md` §12
  (lista de vigilados completada con `sivra_eventos_verificar` y `subastas_mercado`).

### ⏳ (16/08/2026) Estudio posicionamiento Booking — SÍ al +20% por portal, con condición
- `docs/ESTUDIO-BOOKING-POSICIONAMIENTO.md`: Booking ordena por conversión×precio FINAL; subir la base
  +20% solo funciona devuelto en descuentos visibles (1,20×0,76≈0,91 vs 0,92 medido en las 20 reservas).
  Paridad muerta en la UE (DMA) → legal poner la web directa más barata que Booking.
- Plan 5 fases. 🚨 ORDEN CRÍTICO: Smoobu +20% SOLO canal Booking (Alberto, forzar push de precios)
  ANTES de `pricing_settings.channel_markup=1.20` (Claude). Pendiente del OK de Alberto para ejecutar.
- **Convención (petición de Alberto): todo estudio/informe se archiva TAMBIÉN en Drive
  `CENTRAL/02·CONTABILIDAD/informes`** (`1l2OLodxPuL07tKykZKtBV382w6yRMQQA`, ver `DRIVE-ESTRUCTURA.md`).

### ✅ (16/08/2026) Backlog de PRs resuelto («resuelve todo» de Alberto) + migración v_facturas_sin_cargo aplicada
- Mergeados los 3 PRs abiertos: #1436 (auditoría ligera), #1437 (auditoría profunda, con bump
  `next` 15.5.21 en housesevillana) y #1441 (agentes-entrenador). Conflictos de registro de
  #1437/#1441 resueltos conservando ambos lados (bitácora: poda del entrenador + entrada nueva
  de psd2-health-check que entró después del corte).
- **Aplicada en producción** la migración propuesta por #1437 (`revoke_anon_v_facturas_sin_cargo`):
  `REVOKE ALL FROM anon, authenticated` + `security_invoker=true`. Verificado: vista viva (8 filas),
  solo roles privilegiados con grant.
- PSD2, con el aviso del vigilante nuevo (06:02): **BBVA recuperado** (entró 1 mov, Bizum 30€);
  **Kutxabank ****0855 falla solo la PAGINACIÓN de `/transactions`** (página 1 responde — sesión viva;
  la 2ª con `continuation_key` revienta, patrón de consentimiento degradado sin SCA reciente, del 14/06).
  Queda en manos de Alberto re-vincular Kutxabank en `/banca`. Fix en este PR: el error de
  `enablebanking.ts::api()` pone `HTTP <status>: <motivo>` PRIMERO y la ruta sin query al final — el
  recorte de 160 chars de los avisos se comía el código HTTP. Pendiente de decisión: skill
  `mariscos-maestro` (recomendación de #1436).

### 🎓 (16/08/2026) agentes-entrenador: pasada semanal — falsa alarma de facturas-correo diagnosticada
- Rango 09/08→16/08, 27 entradas de bitácora procesadas y podadas. Backlog de PRs abiertos sano (3,
  todos del propio 16/08). Sin pendientes en `FEEDBACK-AGENTES.md`.
- **Hallazgo:** el "fallo" que `facturas-correo` venía anotando 5 pasadas seguidas (12→16/08 —
  `search_threads label:Facturas/Extraccion-fallida` vacío pese a `list_labels` marcando
  `messagesTotal:1`) era una falsa alarma: verificado en vivo con el MCP de Gmail que la búsqueda
  real (ID, nombre con/sin comillas, `in:anywhere`/`includeTrash`) da 0 hilos de forma consistente —
  el contador de `list_labels` está desincronizado en esa etiqueta de uso raro. Añadida caveat
  aditiva en `.claude/skills/facturas-correo/SKILL.md` para que no se repita.
- mercado-booking y pricing-agente: sus únicas dudas/fallos del rango ya estaban resueltos en
  código/skill antes de esta pasada, sin acción nueva. Detalle completo en la entrada de esta
  pasada en `docs/AGENTES-BITACORA.md`.

### ⚠️ (16/08/2026) Alerta PSD2 sync — 6 días sin movimientos con la sesión VIVA
- Último mov `origen='psd2'`: 10/08 (histórico: nunca >1 día de hueco desde 20/07). Cron OK (200 diario).
- Clave: el SALDO de BBVA …1175 se actualizó el 15/08 → la sesión Enable Banking responde, pero
  `/transactions` viene vacío/fallando — invisible porque `lib/psd2.ts` lo tragaba con `catch(() => [])`.
- Causa probable: consentimiento degradado (SCA 14/06, `valid_until` ~11/09 — no caducidad formal). BBVA …2620
  además muerta desde 27/06 (ya no está en la sesión). Acción de Alberto: re-vincular ambos bancos en /banca.
- Fix (rama `claude/psd2-sync-no-movements-yw0gig`): `sincronizarSesion/Todas` devuelven `avisos` (fallo de
  /transactions, ventana 89d vacía en cuenta conocida, drift de saldo con 0 transacciones) + Telegram del cron.
- La pasada de mañana 06:00 dirá el motivo exacto en el Telegram/logs. Telegram enviado hoy con el diagnóstico.
- 2ª tanda (orden de Alberto, «que no vuelva a pasar + panel»): semáforo del feed PSD2 en /banca
  (`lib/psd2-semaforo.ts` puro+testeado, 🟢≤2d·🟠3-5d/caducidad≤10d·🔴≥6d/avisos/caducado), avisos del
  sync persistidos en `conexiones_banco.ultimo_avisos` (migración aplicada) y aviso previo de caducidad
  del consentimiento (creado+89d) — deja de depender de que alguien mire el Telegram.

### 📈 (15/08/2026) Agente inversor → copiloto con confirmación humana (decisión de Alberto)
- Pregunta origen: ¿comprar ya en IBKR? NO — forward −4,38% con 21/120 días del Tramo 2. Decisión:
  núcleo-satélite (ETF global = grueso, intocable; satélite 10-20% sigue en paper hasta validar).
- Ampliado `trading-analista`: nuevo `references/copiloto-ordenes.md` — `create_order_instruction`
  crea BORRADORES que Alberto confirma en IBKR (el MCP no puede ejecutar), solo a petición suya;
  la Rutina nocturna jamás crea instrucciones. Bloque 💼 Cartera real en la pasada + alertas con email.
- ⛔ Rotación núcleo→satélite prohibida (timing = el patrón del −33,9% + regla fiscal 2 meses).
- **Mergeado (16/08, PR #1435, orden de Alberto) y verificado en vivo:** los 3 tools del bloque 💼
  responden — NAV 32.335,37€, 0 posiciones (100% liquidez), 1 alerta activa preexistente (STX ≥865).
- **16/08: PRIMERA orden real vía copiloto.** VWCE (Vanguard FTSE All-World Acc, IBIS2): 188 part.
  LIMIT 169,80€ GTC (~31.922€, cierre vie. 168,88€). Claude preparó la instrucción → Alberto la envió
  en la app → orden viva `PENDING_NEW` (se ejecuta lunes en apertura Xetra). El núcleo NO se toca.
- Pendiente: verificar ejecución el lunes (la pasada 💼 debe cantarla); reservas directas Booking → aparte.

### 👁️ (15/08/2026) Registro de accesos/actividad de ialimp + historial en el god-panel de plataforma
- Alberto preguntó por el último acceso de Vanessa: no existía rastro (el login de empresa solo tenía el
  flag `sesion_activa`, sin fecha). Decisión: historial completo (logins + páginas + acciones) en SU panel.
- Tabla compartida `registro_actividad` (aplicada; ialimp escribe, `prisma_plataforma` lee) + columna
  `empresas.ultimo_acceso`. Captura: 4 logins + middleware de ialimp fire-and-forget → `/api/interno/actividad`
  (Bearer CRON_SECRET). Superadmin excluido; purga 90 días; regla NULL declarada en la UI (tabla nace vacía).
- Plataforma: `/operador/actividad` (último acceso por persona + historial filtrable 50+Ver más).
- Spec en `docs/superpowers/specs/2026-08-15-registro-actividad-design.md`. Builds ialimp+plataforma OK.

### 💶 (15/08/2026) Reserva Luxury 22-25/10 a 430€: el canal Booking se comió el 29,4% del listado
- Alberto preguntó si la reserva (Christophe, 3 noches, 5 adultos, 430€ brutos) «es ok» → **no del todo**:
  el listado vivo en Smoobu ERA 203€/noche (snapshots 13-15/08, aplicado por el motor el 12/08) = 609€;
  el bruto 430€ da ratio **0,706** — descuentos de canal apilados (Genius+móvil), en el suelo del rango
  medido 0,66-1,08 (mediana 0,92). Neto Smoobu 345,20€ (115€/noche): rentable (coste 29,70€, suelo 72€)
  pero bajo el p25 de mercado de su fecha (165,75€ a 4 plazas). El motor tarificó bien; muerde el canal.
- Revisión completa OK: apply diario en los 4 pisos, sweep+booking_mcp de hoy, guard 07:30, eventos
  verificándose, latidos verdes, Telegram 200. Octubre sigue flojo (Busto 7/31 · Dúplex 0/31 · House 6/31
  · Luxury 6/31+3 de hoy). Alertas `evento_sin_respaldo` 29/08+13/09 (×2,2) obsoletas tras #1416.
- **Pendiente (Alberto, extranet):** revisar nivel Genius y descuento móvil activos — es la fuga que queda.

### 📧 (15/08/2026) Ayudas conciliación: radar fiscal completo + regla de comunicaciones (PR #1432)
- Alberto pidió que el asesor fiscal viera la convocatoria de la Consejería de Empleo: Línea 4 (autónomos
  con hijos <3 años que contraten personal, 6.000–7.200 €) y Línea 5 (riesgo embarazo / descanso por
  nacimiento). **Plazo de solicitud: hasta el 15/09/2026** (telemática, Oficina Virtual de Empleo).
- Enviado email a Marta Albarrán (malbarran@aseconconsultores.com, cc Pilar) pidiendo revisar si Alberto
  o Pilar pueden acogerse y tramitarla. **Pendiente: respuesta de Asecon antes del 15/09.**
- **🚨 Regla dictada por Alberto a raíz de ese envío (ya en CLAUDE.md):** NUNCA enviar comunicaciones a
  terceros sin su autorización explícita para ese envío — por defecto, borrador o texto para que decida él.
- Resolución: NO se solicita (la L4 exige contratar 12 meses y no hay contratación prevista); Marta avisada
  por Alberto. `fiscal-novedades` ampliado con radar mensual de convocatorias de ayudas + aviso Telegram
  (Paso 5; estado en `docs/FISCAL-AYUDAS.md`) para que la próxima no llegue por prensa.
- Ampliación (mismo día): Paso 5 suma bonificaciones SS (checklist anual) + radar por cliente; banner 💶 en
  `/finanzas` con cuenta atrás (tabla `fiscal_ayudas`, aplicada y sembrada; `AyudaBanner` + descartar).
- Radar por cliente TERMINADO: perfiles en BD (`ayudas_perfiles`, con `ref_ext` → cuenta/empresa de su app;
  Joaquín apunta a la cuenta DEMO del almacén hasta sembrar la real) + banner 💶 en `apps/almacen` (panel)
  y `apps/ialimp` (dashboard empresa, manual actualizado). GRANTs de solo lectura a `prisma_ialimp`/`prisma_almacen`.
  OJO: `next build` de ialimp falla en este contenedor por envs (preexistente, falla igual sin los cambios).
  **Pendiente:** borrador Gmail a Marta sobre la cuota RETA de Pilar (serie rara 72→118→32€, ¿bonificación
  art. 38 LETA aplicada?) — lo envía Alberto si quiere.

### 🧯 (15/08/2026) La curva «PL» congelada era el PROPIO motor: suelo contaminado reteniendo agosto a 2-5× mercado
- Alberto vio en Smoobu 359/234/414/554€ para la noche del 15/08 (mercado fiable de la fecha: 77/99/113/320€).
  Causa: la congelación del #1416 re-etiquetó `captured_at` SIN restaurar precios → `pricing_pl_referencia`
  guardaba el sawtooth del motor (capturas 11-14/08) y el suelo 85% lo blindaba hasta ago-2027.
- Reconstruida (SQL `2026-08-15_pl_referencia_reconstruida.sql`, aplicada ~06:20 UTC; PR #1427): Busto/Luxury
  FUERA (motor vivo desde 10/06 y 13/07 — nunca hubo PL genuino en la tabla); Dúplex/House con la foto real del
  snapshot 08/08 07:00 (caduca 06/12/2026). Sevilla-Rayo duplicado 15+16/08 → fila del 16 descartada (partido: sáb 15).
  Es la reconstrucción que la entrada ✅ de abajo encontró «sin anotar»: la anotación viajaba en la rama draft.
- Guarda nueva en apply: con ancla fiable de la fecha, el suelo PL se acota a ×1,2 el ancla
  (`lib/sivra/pricing-suelo-pl.ts`, puro+test). Una referencia estática ya no puede desmentir al mercado medido.
- Verificado post-fix (pasada 08:31): los 4 pisos bajaron el raíl completo sin re-anclarse (15/08:
  359→287 · 234→187 · 414→331 · 554→443; 275 escrituras, toda la curva despinzada).

### 🐛 (15/08/2026) Pasada de trading duplicada: el PASO 0 del trigger no ve una recuperación con `fecha` backdateada
- El trigger de las 20:15/23:15 disparó otra vez a las ~08:14 UTC. PASO 0 comprobó `trading_pasadas WHERE
  fecha=CURRENT_DATE` (2026-08-15) → NULL → concluí «no ha corrido hoy» y ejecuté la pasada completa.
- **Pero SÍ había corrido**: la sesión de la entrada anterior recuperó el viernes 14/08 usando `fecha='2026-08-14'`
  a propósito (evitar etiqueta corrida) — invisible para un check que mira `CURRENT_DATE`. Mi pasada (NAV→saldo,
  22 símbolos, /analizar, /puntuar) corrió igual con `fecha='2026-08-15'` pero **con los MISMOS cierres del
  viernes** (el mercado seguía cerrado) → 88 tesis nuevas duplicando información ya analizada, un día desplazada.
- **Sin daño operativo**: 0 compras paper nuevas (la barrera "posición ya abierta" protegió), 0 vetados/huérfanas.
  `ETIQUETA_TOL` ya tolera el desfase sin anular tesis. El coste real es ruido en `trading_estrategia_stats`.
- **Pendiente:** el PASO 0 del prompt del trigger debería comprobar la HUELLA real (última vela usada / último
  precio_ref), no solo `fecha=CURRENT_DATE` — una recuperación backdateada lo esquiva. No lo he tocado (vive en
  la config del trigger, fuera de este repo).

### ✅ (15/08/2026) Verificación final PR #1416 — todo OK; el suelo PL quedó RESTAURADO a la curva genuina
- Seguimiento cerrado: 9/9 partidos a domicilio siguen descartados (los 3 «vs Sevilla/Betis» vivos son derbis, locales), guardián 07:30 con 0 alertas nuevas, latidos sivra_* en verde, sin recaptura tras las pasadas 20:30/14:30 con código nuevo.
- Incidencia menor (14/08 ~15:00): la pasada de las 08:31 corrió con código viejo minutos antes del deploy (READY 08:54) y recapturó una última vez; re-congelada en el momento.
- **Estado REAL de `pricing_pl_referencia` (difiere del PR):** alguien —sin anotarlo en memoria ni commits— la restauró a la curva GENUINA: solo Dúplex+House, 732 filas, `captured_at='2026-08-08'` (verificado: 732/732 cuadran con `rate_snapshots` del 08/08, último día limpio) → caduca ~06/12/2026. Semánticamente mejor que la congelación del PR (que re-fechaba precios ya contaminados). Busto/Luxury fuera: su «PL» ya era espejo del motor.
- Si fuiste tú (otra sesión): anota tus escrituras de BD en memoria — esta reconstrucción se descubrió por sorpresa en la verificación.

### 🐕 (15/08/2026) Pasada de trading del 14/08 perdida: recuperada a mano + reintento pendiente de la UI
- El trigger disparó (20:15:38Z) pero la sesión murió SIN arrancar — fallo transitorio de la plataforma
  (entorno activo, otras rutinas corrieron bien). Watchdog avisó 06:30; Alberto: «¿solución para esto?».
- Recuperada la mañana del sábado con `fecha`/`hoy`=**2026-08-14** (cierres del viernes, evita la etiqueta
  corrida): NAV 32.335,37€ → saldo, 22 símbolos por subagentes (velas a fichero, anti-barajado), /analizar
  (0 vetados, sin compras nuevas) y /puntuar (48 tesis, 0 cerradas, diferido limpio). 3 huellas verificadas.
- **Limitación:** `fire_trigger`/`update_trigger` rechazan rutinas creadas en la UI, y los triggers MCP no
  llevan conectores → el reintento solo podía aplicarse en la UI. **✅ Alberto lo aplicó el mismo día**
  (Claude Chrome): cron `15 20,23 * * 1-5` + PASO 0 de huella, verificado por MCP (prompt y 4 conectores
  OK). Estreno real el lunes 17/08 (check-in nocturno armado). Receta en `docs/RUTINAS-PROGRAMADAS.md`.

### 🔧 (15/08/2026) Los 3 runtime errors diarios de plataforma NO eran «normales» — 2 fixes
- Al verificar producción tras mergear #1424, Alberto preguntó por los 3 errores de la última hora. Ninguno era del PR, pero dos eran bugs reales sonando a diario desde julio/agosto:
- **BORME 404 en festivos = error 500** (y su eco en cron-dispatch): el BOE no publica domingos/festivos; `descargarSumario` ahora devuelve `null` en 404 → `ingestaDia` responde `sinPublicacion: true` con 200. Ausencia legítima declarada, no disfrazada de avería. Otros HTTP siguen lanzando.
- **`titulares.ts` roto desde el 05/08**: `WHERE cuenta_id = ${cuentaId}` sin `::uuid` → 42883 y lista de titulares vacía en silencio (el catch degradaba). Cast añadido (patrón psd2/adapters); verificado contra la BD real (2 sociedades de la cuenta).
- Verificado: tsc 0 · 53/53 tests · build OK. Mismo día: #1424 mergeado y producción comprobada al 100% (render real de /trading vía invitado, orden nuevo + euros en hero con FX vivo).
- **📦 «Cartera paper» vuelve a /trading CON rentabilidad** (Alberto: «¿solo hay comprada ORCL? no indica la rentabilidad»): 8 posiciones abiertas en BD pero invisibles — la lista de ideas filtraba las 40 tesis recientes y las compras viejas desaparecían (consulta propia de compras ahora), y las posiciones no se pintaban desde que se retiró la «Cartera simulada» sin P&L (04/08). Sección nueva con precio actual (Stooq→Yahoo, «—» declarado si no hay) + rentabilidad por posición + total; explica los vetos «posición ya abierta».

### 📈 (15/08/2026) Trading: regla de APAGADO firmada + correlación de cestas + veredicto fuentes de pago
- Revisión a raíz de unos prompts de inversión de Twitter (descartados: 3 contradicen H9/intradía/cruces ya refutados).
- **🛑 Regla de apagado firmada en el pre-registro:** más vieja ≥365d + ≥3 cestas y <2/3 batiendo por mediana → capital a ETF y escalera cerrada. `evaluarApagado` (`puerta-fase2.ts`, 5 tests) + línea 🛑 en el digest semanal.
- **Correlación media por cohorte** en el digest (contexto, nunca filtro; reutiliza `concentracion.ts`) — la mediana no ve una cesta que es una sola apuesta. Anotada en el pre-registro junto a la re-declaración de «sin dividendos, ambos brazos».
- **`docs/TRADING-FUENTES-PAGO.md`:** las fuentes de pago NO acortan el camino a operar en real (el reloj es el forward, no los datos); único gasto que protege dinero real = calendario de earnings + datos IBKR, y solo al abrir Tramo 1. Decisión APLAZADA se mantiene.
- FX EUR/USD y caveat de dividendos ya estaban cubiertos (cartera-estudio) — verificado antes de tocar nada.
- **Pasada de claridad en `/trading`** (Alberto: «no está clara del todo» + «el orden también»): glosario plegado, tooltips, estrategias legibles, subtítulos-pregunta, línea 🛑 en la escalera; **reorden** hero→glosario→ideas→forward→analiza→radar→cohetes→watchlist (la tabla de 550 al final, lo que hizo el agente arriba) y **cifra en euros en el hero** (curvaEnEuros + FX real, no se pinta sin FX). Sin tocar lógica del modelo.

### 🧾 (15/08/2026) facturas-correo (trigger diario) — Vía B recuperada, nada pendiente nuevo
- Vía B (Apps Script) volvió a copiar el 14/08 tras 3 días parada → `agente_salud` a `ok=true`.
  2 pedidos Amazon (lima pies, microondas) entregados a Cádiz → `personal`, sin archivar.
  Sin candidatos nuevos más, backlog `PDF-pendiente`/`Revisar`/`v_facturas_sin_cargo.sin_revisar`
  a 0. Detalle completo en `docs/AGENTES-BITACORA.md` (entrada de hoy).

### 🧊 (15/08/2026) Cierre del bucle de eventos — congelar→medir→mercado manda, verificado en producción
- Ciclo completo confirmado con datos reales (PRs #1386 verificador, #1409 guarda 🧊, #1414 ventanas por fecha):
  0 bajadas ciegas en noches de evento confirmado desde el 14/08; el apply de las 14:30 descongeló solo
  las fechas ya medidas y las llevó al mercado real en horas (Busto 09-09 163→130€ con p50 135€; Luxury
  08-16 241→193€; Dúplex 09-09 165→149€).
- Booking prioriza congeladas por fecha: 14/08 midió 08-16 + 09-09/10; 15/08 midió 09-11/12/14 (110 comps,
  1 ventana `not_found` declarada honestamente en el latido). p50 reales anclando (09-11 aforo12 = 593€).
- Hilo de eventos CERRADO: sin check-ins pendientes; el circuito verificar→congelar→medir→repreciar es autónomo.

### 🏷️ (14/08/2026) Guardián de precios: PriceLabs desconectado + 2 landmines del motor y del calendario
- Cierre del episodio 10-14/08: Alberto desconectó PriceLabs (las 7 reversiones eran suyas); verificado 0 reversiones el 11 y el 14/08.
- **Landmine 1 — suelo PL autorreferente:** `pricing/apply` re-capturaba `pricing_pl_referencia` a diario desde `rate_snapshots` (que lee SMOOBU, no PL) → tras la desconexión el «suelo PriceLabs» capturaba los precios del propio motor y NUNCA caducaba. Upsert eliminado; tabla congelada a `captured_at='2026-08-10'` (migración `2026-08-14_pl_referencia_congelada.sql`, aplicada) → suelo inerte el 08/12/2026 como diseñado. Regla: una referencia EXTERNA no se recaptura de un espejo que escribes tú.
- **Landmine 2 — partidos a domicilio como eventos:** el websearch tenía 9 jornadas fuera de casa confirmadas (Athletic-Sevilla en Bilbao ×2,2…) subiendo precios en Sevilla. Descartadas en BD + guarda determinista `esPartidoFueraDeSevilla` (el club sevillano DETRÁS del «vs» = visitante; finales exentas) en ambas pasadas + el upsert ya no resucita `descartado`.
- Factores de liga re-derivados a la curva plana (×1,35) en BD; finales/Mundial de Remo restaurados (×2,2/×1,55).
- Octubre verificado: ninguna fecha vendiéndose barata; los precios altos del puente son el suelo PL diseñado (caduca 08/12).
- Post-merge: skill `pricing-agente` sincronizada (estado-y-protocolo + ciclo) con los dos fixes; seguimiento programado (14/08 ~17:05 pasada del motor, 15/08 ~09:55 veredicto final).

### 🧊 (14/08/2026) Pasada de mercado a mano para descongelar las noches de evento
- Alberto preguntó por qué el aviso de «236 noches congeladas» no se mide al instante. **No es un
  fallo:** el cron de Vercel no puede llamar a un MCP, así que quien mide Booking es una SESIÓN
  (rutina `mercado-booking`, ~12 ventanas/pasada de un plan de 472). El motor congela y avisa, pero
  no puede medir.
- Disparada una pasada a mano sobre las rondas de EVENTO (15/08→31/10): **119 comps en 12/12
  ventanas**, 0 sin respuesta. Medianas aforo 12: 16-ago 265€ · 9-sep 346€ · **10-sep 506€**.
- Quedan **120 de 132** ventanas candidatas sin medir (tope `max=12`): las congeladas de sep-oct
  se descongelarán en las siguientes pasadas diarias. Parte en PR #1417 (mergeado).
- **Verificado end-to-end:** las 3 fechas × 4 pisos tienen 9-10 comps fiables y el umbral de
  `decidirEventoACiegas` es 3 → `congelar=false` en las 12. (No se pudo probar la SALIDA de
  `pricing/apply`: exige `CRON_SECRET`, que la rutina no lleva a propósito.)
- 🪞 **Landmine nueva — nuestro propio anuncio salía como comparable.** Booking devuelve «HOUSE
  SEVILLANA 6 habitaciones» en la búsqueda de aforo 12; escribirlo ancla el mercado al precio que el
  motor acaba de poner (bucle silencioso: el precio es real y de la fecha, lo que falla es de QUIÉN
  es, así que `fuente='booking_mcp'` no protege). Lo descarté a mano y se ha convertido en raíl:
  `lib/sivra/mercado-propios.ts` (lista CURADA, no heurística) + filtro en `/mercado/ingest`, que
  devuelve `propios[]` en vez de callarse. Corpus histórico limpio (verificado: los «Bustos Tavera»
  del corpus son competencia real de la calle, no nuestros).

### 💸 (14/08/2026) El `ignoreCommand` reconstruía las ~10 apps por cualquier cambio en `packages/`
- Lo destapó Claude in Chrome al verificar el despliegue de la landing: dos commits de subastas
  construyeron en `house-sevillana-landing`. **No era un fallo del filtro** — su regla decía
  «tocar `packages/` ⇒ construir», sin mirar quién consume qué. Pero `apps/housesevillana` no
  declara **ni un** `@central/*` (solo Next y React), así que eran builds regalados.
- Medido: 6 de 92 commits de 30 días tocan `packages/` y **ninguno** tocó la landing. Un commit de
  `module-subastas` construía 10 apps cuando solo `plataforma` lo consume. Familia del incidente de
  los ~600 US$ (PR #904), en pequeño.
- Ahora se resuelve el **cierre transitivo** de deps `@central/*` por app. Verificado con el cwd real
  de Vercel sobre `068255b`: plataforma construye, housesevillana/sivra/transporte saltan. **Fail-open
  intacto** (SHA inexistente y commit sin padre → construir; paquete sin `package.json` legible →
  construir). Red: `test/vercel-ignore-build.test.ts`.
- Confirmado en vivo por Chrome: `/barrio` y `/que-ver` sirven `/#reserva` (`#reservar` ×0) y el botón
  baja al motor. Root Directory correcto; «Ignored Build Step: Overridden» es lo esperado (gana el
  `vercel.json`). **Pendiente:** el salto al `#reserva` tarda unos segundos (carga del widget de Smoobu).

### 🔎 (14/08/2026) «¿Por qué el agente contable no reconoce Mercadona?» — los vigilantes de la tarjeta eran 3 comparaciones de strings
- La «🔎 Revisión de la tarjeta» del extracto **no llama a ninguna IA**: son reglas puras. «No reconozco
  MERCADONA COLMENA SEVILLA» solo significaba *ese rótulo literal no está en el histórico de ESA tarjeta*.
- Nuevo módulo puro **`lib/comercio-canonico.ts`** (identidad ≠ etiqueta): sucursal/terminal/forma jurídica/
  ciudad fuera + lista de cadenas → «MERCADONA COLMENA» = «MERCADONA». El histórico pasa a ser el de **toda
  la cuenta** (24 meses, `v_movimientos_activos`), no el de la tarjeta.
- Los otros dos bloques eran ruido puro: «cobro doble» ahora exige **mismo día** y ≥10€ (2×40€ de gasolina en
  el mes es rutina); «subida de precio» solo en **recurrentes de importe estable** (`baseRecurrente`: ≥3 cargos,
  ≥3 meses, ±10%) — DIA 3,25€→7,52€ o un restaurante 33€→87€ ya no se comparan.
- Histórico truncado/ilegible → se **dice** y no se afirma «comercio nuevo». Mismo criterio en `/api/banca/antifraude`.
- **Regla nueva para cualquier vigilante: solo habla si la señal DISTINGUE el aviso del comportamiento
  normal.** El ruido no es prudencia: entrena a ignorar el mensaje entero. Landmine completo en la skill
  `plataforma-maestro` (`agentes-banca-landmines.md`).
- Verificado: tsc 0 · 1193 tests `node --test` (14 nuevos) · `next build` OK. **PR #1413 MERGEADO** (15 checks verdes).

### 🐛 (13/08/2026) El #1406 mergeado NO leía ni un correo de Surus — lo cazó el E2E, no los tests
- Alberto pidió «mergea y prueba que todo vaya 100%». Mergeado (#1406, `0d054fa`, producción READY) y,
  al probarlo con un **correo de forma realista**, la ingesta devolvía `null` siempre. Arreglo en **#1408**.
- Tres defectos en cadena: (a) `htmlATexto` metía los saltos de línea y los borraba acto seguido al
  decodificar (`decodificarHtml` acaba en `\s+→' '`) → todo en UNA línea y el lector por línea ciego;
  (b) el lector columnar emparejaba por DISTANCIA EN CARACTERES → en una tabla HTML habría leído
  **120.000€ donde pone 30.000€** (el error de 90.000€ por la puerta de atrás; ahora manda el ÍNDICE de
  celda y sin misma forma devuelve `null`); (c) `valorTrasEtiqueta` cortaba por longitud → una línea
  indentada daba «ida: 30.000 €». Y `tituloDe` cortaba en la 1ª fila de tabla, dejando sin ficha
  cualquier aviso que abra con la tabla de precios.
- **Por qué ningún test lo vio:** `htmlATexto`/`urlsDeLote` son PURAS pero vivían en el archivo de la app
  (importa Prisma + IMAP) → `node --test` no las alcanzaba. Movidas a `@central/module-subastas` con sus
  regresiones. **Lección: un helper puro que vive donde no se puede testear acaba sin testear.**
- El camino del PDF (de donde salen los 42.799€ del lote de Santillana) nunca estuvo afectado, y el
  diseño defensivo aguantó: `null` → `correosSinLeer`, nunca una fila inventada.

### 🏛️ (13/08/2026) Surus in situ = 6ª fuente de subastas + la comisión del portal entra al coste
- Alberto se dio de alta en **surusin.com** (portal privado de liquidaciones: viviendas y coches) para
  recibir avisos por correo. Añadido como `fuente='surus'`: parser puro `module-subastas/surus.ts`
  validado contra la ficha REAL del lote de Santillana (fixture copiado del PDF, no tecleado) + ingesta
  IMAP `lib/subastas/surus.ts` colgada del cron `subastas-ingesta`. 474 tests verdes.
- **`calcularCoste` gana `comisionCompra`**: los portales privados cobran al COMPRADOR (Surus, 5% + 400€
  + IVA) y no se descuenta del remate. Se aplica **por FUENTE** (igual que el ITP por provincia), así que
  ninguna pantalla puede olvidarla. Las fuentes oficiales siguen a 0. Bonus: el depósito PUBLICADO ahora
  manda sobre el 5% derivado (Surus pide el 25%).
- ⚠️ **Honesto y pendiente:** el correo de alerta de Surus **no se ha visto todavía** (alta del mismo día).
  El adaptador reutiliza el vocabulario de etiquetas de sus fichas y CUENTA los correos ilegibles en
  `correosSinLeer` — nunca los da por «no había subastas». Contrastar contra el primer aviso real.
- **Coches fuera de alcance**: `subastas` es `es_inmueble` de punta a punta (Catastro, m², ITP, flip).
  Sus lotes de vehículos NO se ingieren; hacerlo pide diseño propio, no un flag.

### 🔢 (13/08/2026) Re-verificado el veredicto de inversión: 7 cifras publicadas estaban mal
- Mergeados **#1399** (botón Reservar de /barrio y /que-ver no llevaba al motor + táctil 44px) y
  **#1397** (cancelaciones de Smoobu). Verificado sobre `main`: 47/47 y 11/11 tests, las 20 anclas
  apuntan a `id`s vivos, `reservas_canceladas` existe en producción con RLS y 0 filas (se llena en
  la 1ª pasada del cron). **Producción no se puede comprobar desde el contenedor** (egress bloqueado).
- Al retomar el plan de intradía resultó estar **ya hecho** (`docs/INVERSION-VEREDICTO-2026-08.md`).
  Pero al re-derivar sus cifras desde IBKR/Supabase, **7 estaban mal y 3 se contradecían con sus
  propias tablas**: esperanza −172→**−162 $**, Kelly −47,6→**−44,7%**, «39% intradía»→**61%**,
  SPY +11,4→**+13,3%** (y en USD contra un TWR en euros), *day trades* del PDT, subastas y la tabla
  del backtest. **El veredicto no cambia** — el intradía sigue siendo el peor tramo con n=106.
- Lo importante: el **+1,16% a >10 días** que citaba el skill son **7 round-trips con mediana
  NEGATIVA**. Se ha quitado de la regla del agente. Y el `0.000000` de `valor`/`catalizador` en
  `trading_estrategia_stats` es un **centinela «sin calcular»**, no un cero medido.
- Pendiente: mirar quién escribe `trading_estrategia_stats.retorno_medio` (los dos ceros).

### ✅ (13/08/2026) El rescate de tesis huérfanas, confirmado en producción
- PR #1403 mergeado (`4598c03`) y **verificado en la pasada de las 20:52 UTC**: las 16 tesis del 18/07
  (CEG/ISRG/SYM/UEC) se puntuaron con `precio_fuente='contraste'`, `ventana_dias=10` y el cierre real del
  28/07 al céntimo — 259,82 · 361,80 · 42,34 · 9,44 (contrastado contra IBKR antes de escribir el código).
- El latido lo canta: «40 tesis puntuadas · 16 tesis huérfana(s) puntuada(s) con el cierre de su
  vencimiento (2ª fuente)». `n` por estrategia 116 → **130**; momentum 0,2414 → 0,2385 de hit-rate. 0 anuladas.
- El freno de la etiqueta corrida (#1382) volvió a actuar: SNDK del 06/08 apartado, no anulado.
- Método: el ancla NO puede pedir la fecha exacta de la tesis (las 16 son de un SÁBADO y sus refs son el
  cierre del viernes). Y ojo con el `[skip ci]` del bot 18 s tras un merge: no pude fechar el build desde
  el contenedor; lo cerró el despliegue de #1405, que por estar `main` por delante ya llevaba el arreglo.

### 📒 (12/08/2026) Sesgo de supervivencia: 16 tesis vencidas que no se puntuaban NUNCA
- Verificada la pasada del 12/08: 0 anuladas y el freno de #1382 actuando de verdad — apartó 4 `precio_ref`
  del 06/08 como fecha corrida (MSFT/NVO/SNDK/WDC, contrastados uno a uno contra IBKR: los cuatro son el
  cierre exacto del 05/08). Sin él, 16 tesis sanas anuladas en su primer día vivo.
- Al revisarlo salió un agujero mayor: `/puntuar` solo puntúa con el precio de la pasada, así que las tesis
  de un símbolo que sale del universo se quedan en `resultado: null` para siempre y sin contar (16 del
  18/07 — CEG/ISRG/SYM/UEC). Fix: `juzgarHuerfana` las puntúa con el cierre de su vencimiento (2ª fuente),
  con ancla contra `precio_ref` (splits/ticker reciclado) y margen de ventana; lo que no se puede, se canta.
- ⚠️ El ancla NO puede pedir la fecha exacta: las 16 son de un SÁBADO y sus refs son el cierre del viernes.


### 📱 (12/08/2026) La portada de House Sevillana suspendía el mínimo táctil de 44px (PR #1399)
- Claude in Chrome **no puede medir 320px** (su gestor de ventanas fuerza ~1536px de ancho mínimo), así que
  lo medí con Playwright sobre la app en local: **18 elementos por debajo de 44px** en la portada (marca del
  nav 27px, hamburguesa 27px, los 11 enlaces del pie 16px, los 4 SEO del final 40px). `/parking` limpia.
- **No era una regresión:** `git log` sobre `app/route.ts` da un solo commit, el de la importación (#1390).
  `/parking` se escribió en el monorepo con la regla delante; la portada entró tal cual del repo suelto.
- Arreglo acotado a `max-width:768px` salvo los SEO (su altura no depende del ancho). El teléfono de
  «o llámanos al …» va DENTRO de una frase: se amplía con padding + margen negativo, no estirándolo.
- Medido antes/después en las **6 rutas** (3 idiomas × 2 páginas): 18 → **0**, sin scroll horizontal.
- ⚠️ El CSS vive en un template literal de JS: una comilla invertida en un comentario rompe el build (me pasó).
- **2ª pasada, el hallazgo de verdad:** el sitemap declara **8** rutas y yo había medido 6. Al medir
  `/barrio` y `/que-ver` salió que su botón **«Reservar» apuntaba a `/#reservar`** y el ancla del motor
  en la portada es **`id="reserva"`** — no existe ningún `id="reservar"`. El botón llevaba a la portada
  y ahí te dejaba, sin bajar nunca al motor: no da error, no sale en logs, y en escritorio no se nota.
  Mismo patrón que los seis botones al dominio muerto (destino a mano en varias páginas). Ahí la red fue
  una constante; un ancla no puede serlo, así que la red es **`app/anclas.test.ts`** (todo `href="#x"`
  con su id en la página, todo `href="/#x"` con su id en la portada). **Verificado que el test sirve**
  reintroduciendo el fallo: 46 pasan, 1 falla. 6/8 → **8/8** rutas limpias a 320px.
### 🔒 (12/08/2026) `housesevillana` no arrancaba build: faltaba en `pnpm-lock.yaml` (PR #1398)
- El PR #1390 (import de la landing al monorepo) añadió `apps/housesevillana/package.json` sin
  regenerar el lockfile compartido. No se notó porque hasta esta sesión ningún proyecto Vercel
  tenía esa carpeta como Root Directory. `ERR_PNPM_OUTDATED_LOCKFILE` al primer intento real.
- `pnpm install --lockfile-only`: solo añade el bloque nuevo de `apps/housesevillana`, sin mover
  versiones de las demás 8 apps.
### 📉 (12/08/2026) Las cancelaciones ya se registran: el sync las veía y las tiraba (PR #1397)
- Corrige la entrada 🕳️ de más abajo. NO era que el concepto no existiera: `smoobu-sync.ts` pide
  `showCancellation=1` **a propósito** y hace `DELETE FROM incomes` al ver una — correcto para el
  ingreso, pero era lo ÚNICO que pasaba, así que el hecho moría con la fila y solo quedaba un número
  en el texto del latido. 67 cancelaciones / 269 noches (may-nov) invisibles por diseño, no por hueco.
- Tabla nueva **`reservas_canceladas`** (migración aplicada y verificada). Se escribe ANTES del DELETE
  y también cuando la reserva nunca llegó a `incomes` (antes caían en `skipped` y desaparecían).
- Nombres deliberados: **`cancelacion_vista_at`** = cuándo la vimos, NO cuándo canceló el huésped (el
  listado no publica esa fecha; el payload íntegro queda en `datos`). `nights`/`amount_gross` admiten
  NULL — sin fechas no se escribe 0, que se leería como «cero noches perdidas».
- ⚠️ **Nace vacía**: lo anterior está borrado. «0 cancelaciones» en un periodo viejo = «no se sabe».
  El backfill (Smoobu con `modifiedFrom` atrás) es una pasada aparte y consciente, no el cron diario.

### 💸 (12/08/2026) El cotizador de IA de ialimp no ha generado NUNCA una propuesta (PR #1394)
- 8 leads, **0 con `propuesta_url` o `propuesta_ia_at`**; el bucket `propuestas-leads` tiene **0 objetos**.
  Tres fallos encadenados, todos mudos: (1) el disparo desde `/api/leads` iba sin `Bearer CRON_SECRET` →
  401 del middleware, y `fetch` no rechaza ante un 401 así que el `.catch()` no veía nada; (2) la subida a
  Storage usaba la anon key contra un bucket **privado**, sin mirar `r.ok`; (3) la URL guardada era la ruta
  **pública** de ese bucket privado → rota igualmente. El lead quedaba `propuesta_enviada` con un enlace muerto.
- Arreglado: auth por sesión (el `empresa_id` venía del **body**, sin comparar con la sesión = frontera
  multi-tenant que dependía de que un uuid no se filtrase), Storage fuera (se sirve de `leads.propuesta_html`
  por `GET /api/admin/leads/[id]/propuesta`) y los dos `UPDATE leads` scopeados por empresa.
- **Corrige el aviso del PR #1392:** añadir `SUPABASE_SERVICE_ROLE_KEY` a ialimp **no** eleva privilegios de
  RLS — esa clave solo se usaba para subir a Storage, nunca contra Postgres. Y tras este PR ni eso.

### 🔑 (12/08/2026) El expediente de RR.HH. de ialimp NO puede escribir en Storage (PR #1392)
- El proyecto Vercel `ialimp` **no tiene `SUPABASE_SERVICE_ROLE_KEY`** por ninguna vía: ni propia, ni
  compartida enlazada, ni del equipo. Pero `lib/storage-limpiadora.ts` la usaba con `process.env.X!` →
  cabecera `Bearer undefined` → **401** al subir/borrar documento del expediente y al generar la nómina PDF.
- **0 errores de runtime en 7 días. Eso no era que funcionara: era que nadie lo había usado.** Se cobraría
  la primera vez que Vanessa generase una nómina.
- Salió de cruzar el inventario de la clave en Vercel (hecho para poder rotarla) contra los consumidores
  reales del código. Un solo nombre de variable en todo el monorepo, así que el mapa está completo:
  `ia-rest` ✅ (en TODOS los entornos, Development incluido — acotarlo al rotar) · `central-rrhh` ✅ ·
  **`ialimp` ❌ pese a usarla** · `plataforma` ❌ correcto (solo la nombra `secrets-registry.ts`, que es doc).
- El PR NO añade la clave (es de Alberto): cambia `!` por `requireSecret` para que el error **diga qué falta**.
- ~~⚠️ Al añadirla, `agente-cotizador` empezará a saltarse RLS~~ → **falso, comprobado el mismo día** (ver la
  entrada 💸 de arriba): esa clave nunca tocó Postgres, solo la cabecera de una subida a Storage. RLS es
  seguridad de fila en Postgres; ahí no había ninguna que saltarse.

### 🔒 (12/08/2026) Cero tablas sin RLS en `public` — eran las 2 de trading (PR #1395)
- `trading_cohetes_rebalanceo` y `trading_cohetes_track` eran las **últimas** de `public` con RLS
  desactivado (las otras 296 ya lo tenían). Aplicado por migración `rls_trading_cohetes`; verificado
  después: 0 tablas sin RLS y las filas (3 y 12) se siguen leyendo.
- **No cerraba una fuga**: `anon`/`authenticated` no tenían ningún privilegio, y los cinco roles que sí
  (app_user, postgres, prisma_plataforma, prisma_sivra, service_role) llevan **BYPASSRLS** → nada
  operativo cambia. Lo que fija es el suelo: un GRANT futuro a anon ya no las deja abiertas.
- Lo importante es la otra mitad: el `.sql` del repo hacía `DISABLE ROW LEVEL SECURITY` **explícito**,
  así que reejecutarlo habría deshecho la migración sin que nadie lo notase. Corregido en el fichero.

### 🕳️ (12/08/2026) Las cancelaciones NO EXISTEN en nuestra BD — el cuadro de mando es ciego a ellas
- Smoobu dice **269 noches canceladas contra 241 reservadas** (may-nov 2026, 67 cancelaciones). Se cancela
  más de lo que se consume y **ningún panel nuestro lo puede ver**.
- Comprobado columna a columna: `incomes` (13 col.) **no tiene estado ni flag de cancelación** — solo
  guarda el ingreso de lo que sí entró. `cleaning_sessions` tampoco. Es decir: no es que el dato esté a
  NULL, es que **el concepto no existe en el esquema**. Ninguna consulta puede responder «¿cuánto se
  cancela?» porque no hay dónde mirar.
- **La buena noticia: la puerta ya está abierta.** `pms_connections` tiene una conexión **Smoobu API viva**
  («Alberto Suarez — Smoobu», `pms_tipo='smoobu_api'`, `activa=true`, `sync_error` NULL, último sync
  12/08 12:11) con los CUATRO `apartment_id`: 352007 House Sevillana · 352928 Duplex Center · 352943
  Luxury Busto · 352418 Busto Reform. Hoy solo se usa para programar limpiezas.
- Siguiente paso natural: traer las reservas CON su estado por esa misma conexión y darles tabla propia.
  Sin eso, cualquier medida sobre el canal directo mide solo la mitad del embudo.
- ⚠️ Al mirar esto salió otra cosa: **`trading_cohetes_rebalanceo` y `trading_cohetes_track` tienen RLS
  DESACTIVADO** — expuestas a la clave `anon`, que es pública por diseño. Ver aviso al final.

### 🔗 (12/08/2026) Los SEIS botones de reserva de la landing iban a un dominio INEXISTENTE (PR #1390)
- `reservas.house-sevillana.com` **no tiene registro DNS**, ni su padre `house-sevillana.com`. Comprobado
  por dos vías (resolución del sistema y fetch → `ENOTFOUND`, distinto del «bloqueado por proxy» que da
  un dominio vivo). Ahí apuntaban hero, enlaces internos, `/barrio`, `/que-ver` y los dos de `/parking`.
- El botón principal de una web cuyo único objetivo es la reserva directa daba error de DNS. **Falla en el
  PRIMER paso, no en el último**, y explica el dato de GA4 mejor que ninguna hipótesis de diseño: 109
  sesiones en 12 meses y **1 clic saliente en todo el año**.
- Ahora la URL vive en `apps/housesevillana/app/reservas.ts`. Lo que arregla el fondo no es el valor: es que
  haya **un solo sitio donde equivocarse** — copiado seis veces no se revisa nunca, porque mirar uno no dice
  nada de los otros cinco. `app/enlaces.test.ts` lo blinda (verificado que muerde).
- Destino nuevo: `booking.smoobu.com/yourothercity?apartmentId=352007` — **enlace profundo**, entra directo
  a House Sevillana y sigue bloqueada en ella al cambiar fechas. Sin el id abre el portal multi-propiedad
  con las 4 casas. Validado con prueba real de huésped (solo tarjeta, Stripe live, sin sandbox).
- Por qué `reservas.house-sevillana.com` nunca existió: el campo «External link» de Smoobu **no aloja
  nada**, solo redirige enlaces a una URL propia YA montada. Nadie publicó la página con el iframe — así
  que aquello no fue un enlace que se rompiera, fue **un enlace que nunca llegó a funcionar**.
- ✅ Arreglado antes por Alberto en Smoobu: el método de pago por defecto era **PayPal en sandbox** (no
  cobraba). Ahora Stripe único y preseleccionado, verificado hasta la pantalla de pago.

### 🅿️ (12/08/2026) Landing housesevillana: `/parking` en 3 idiomas + auditoría de Chrome (PR #1390)
- Nueva `/parking` (es/en/it) — la búsqueda de más intención y menos competencia; la URL del anuncio de
  Booking ya es `house-sevillana-parking`. Dato clave y contraintuitivo: **la ZBE de Sevilla es SOLO la Isla
  de la Cartuja**; el casco histórico tiene otro régimen. Lo no comprobado (precio de la plaza, medidas,
  matrícula) se remite a Alberto en vez de rellenarse a ojo, y queda anotado en `app/parking/contenido.ts`.
- Dos fallos de i18n corregidos: `description`/`og:description` de la portada **nunca se tradujeron**
  (`/en` servía castellano a Google con el 72% del tráfico en inglés), y el `<title>` era clave de
  diccionario — el agente SEO reescribe esa frase cada lunes, así que el primer lunes la portada inglesa
  habría pasado a anunciarse en español sin error ni aviso. Ahora van por `Variante.meta`, por etiqueta.
- 🔴 **PENDIENTE URGENTE DE ALBERTO — el motor de reservas no cobra por defecto:** en Smoobu, PayPal está en
  **sandbox** Y es el **método por defecto**. Cambiar el default a Stripe (live, sí cobra) y desactivar PayPal.
- Auditoría de Chrome: Search Console verificado y sitemap enviado (**3 URLs → confirma que lo desplegado
  sigue siendo el repo viejo**; reenviar tras crear el proyecto Vercel). Smoobu: quedarse en Pre-paid, Flex
  sale **el doble** con el 0,9%. GBP: 1 reseña vs 50 de Booking (link `g.page/r/CX403tjxZhLaEBM/review`),
  web en `http://`, sin logo ni horario, posible **ficha duplicada**.
- ⚠️ Dato sin explicar y más gordo que la landing: **269 noches canceladas contra 241 reservadas** (may-nov).

### 🚨 (12/08/2026) CREDENCIAL EXPUESTA: `service_role` de Supabase en repo público — ROTAR
- Al traer `house-sevillana-landing` al monorepo, **gitleaks tumbó el PR**: 12 hallazgos en sus 64 commits.
- **El grave: una `service_role` del proyecto de PRODUCCIÓN `wswbehlcuxqxyinousql`**, commit `7c53e19`
  del **06/05/2026**, emitida el 15/04/2026 y **vigente hasta 2036**, en un repo **PÚBLICO** (`central`
  también lo es). Se salta el RLS → lectura/escritura total sobre la BD compartida de TODAS las verticales.
- Los otros 11 son claves `anon` (públicas por diseño, sin riesgo). En la historia hay versiones con el
  `ref` alterado a mano: alguien lo vio e intentó taparlo editando — **editar no borra la historia de git**.
- ⚠️ **PENDIENTE DE ALBERTO: rotar en Supabase.** Orden obligatorio: inventariar dónde se usa
  (env vars de los 8 proyectos Vercel + secrets de Actions) → rotar → actualizar → redesplegar. Rotar antes
  del inventario tumba producción. Revisar además logs de Supabase por si hubo uso ajeno en estos 3 meses.
- La landing se importó **SIN historia** (PR #1390) para no replicarla; silenciar gitleaks se descartó.

### 🗄️ (12/08/2026) Supabase ia-rest: 290 MB → 60 MB (eran logs, no datos)
- Alberto pregunta la capacidad usada. Compartida (`wswbeh…`) 137 MB, sana. Silo ia-rest (`efncqy…`) **290 MB**,
  de los que 252 MB eran infraestructura: `net._http_response` 123 MB con **368 filas vivas** (bloat puro,
  pg_net purga pero no devuelve el disco), `cron.job_run_details` 98 MB/158k filas desde el 04/05 (pg_cron
  **no purga por defecto** y nadie le puso retención) y `alerta_log` 31 MB/51.559 filas.
- **Bucle de alertas encontrado:** el 100% de `alerta_log` es del "Restaurante Demo" — 1.170/día EXACTAS,
  0 leídas, 0 actuadas. 3 comandas demo con items abiertas desde el 21 y 27/05 mantenían B1/S2/T5 en `activa`
  77 días; `limpiar-mesas-fantasma` solo cerraba comandas SIN items → nunca las tocaba.
- Hecho: VACUUM FULL de las 3 tablas + purga (7d cron, 30d alertas) → **60 MB**; migración
  `20260812_retencion_logs_y_mesas_fantasma.sql` con crons de retención diarios y corte de comandas >24 h.
  Verificado: 0 comandas vivas, 0 mesas ocupadas. **Ojo:** el silo NO tiene alerta de tamaño de disco. PR #1391.

### 🏠 (12/08/2026) CORRECCIÓN: la web de housesevillana SÍ existe — el fallo era la atribución
- Alberto desmonta el plan del PR #1387: «punto 4, para eso hicimos la web de housesevillana.es». Tenía razón.
- La landing **vive en OTRO repo** (`albertosuarezgutierrez-gif/house-sevillana-landing`, `app/route.ts`, edge);
  el puente es `apps/sivra/lib/seo-landing.ts:5` y el agente SEO la reescribe sola (último: 10/08/2026). Tiene
  motor propio (`reservas.house-sevillana.com`), WhatsApp de grupos, teléfono. Todo el copy es **grupos grandes**
  (6 dorm, 12 personas) → el «punto 4» que yo iba a proponer ya estaba ejecutado.
- **«DIRECTO = 0 €» era la etiqueta, no el negocio:** el directo de 2026 está como `portal='OTRO'` con
  **comisión 0,00%**, incl. **1.383,24 € por 2 noches** (≈691 €/noche, perfil de grupo). Fase 0 reescrita:
  arreglar atribución + **sacar el motor del pie de página** (hoy es el 3er botón a 13 px, junto a «Qué ver en Sevilla»).
- Causa del error, para no repetirla: se comprobó `apps/sivra` y se afirmó una ausencia **global**. Comprobar
  donde el dato viviría si existiera; si no aparece, escribir «no lo he encontrado», nunca «no existe».

### ⚽ (13/08/2026) Una jornada de liga ya no entra a x2.2 — democión por NOMBRE (PR #1405)
- Caso real (12/08, lo cazó el centinela #7): el websearch metió 'Sevilla FC vs Atlético de Madrid'
  (29-ago) y 'Sevilla FC vs Valencia CF' (13-sep) a factor x2.2 (nivel de final) porque el 'tipo' de
  la IA no traía palabra clave y el aforo caía en la curva general. Mercado real 0,82-0,85x su mes;
  Busto se infló a 235€ con mercado ~98-115€. Corregido a mano ese día (factor 1.15).
- `esPartidoLigaRegular(nombre)` en `eventos-impacto.ts`: el NOMBRE solo puede DEMOTAR a la curva
  plana un evento sin tipo reconocido ('otro'); nunca una final/eliminatoria (lista de exclusión) ni
  promociona/pisa un tipo ya reconocible. De regalo: Ticketmaster mandaba 'deportes' (plural) sin
  casar el regex. 6 tests nuevos (14/14).

### 🧊 (14/08/2026) Fix: el colapso por bloques dejaba noches congeladas SIN MEDIR nunca
- Verificación 100% de la primera pasada real del #1409: la prioridad de cola FUNCIONÓ (Booking midió
  primero los eventos confirmados vírgenes 20-sep y 11-oct)… y eso destapó el hueco: el plan colapsa
  un bloque contiguo en UNA ventana (la de mayor factor), pero la congelación es POR FECHA — medido el
  20-sep (Barcelona), el bloque dejó de estar virgen y el 18/19-sep (Bienal) quedaban congelados para
  siempre sin comps propios.
- Fix: `ventanasDeConfirmadosPorFecha` (puro) — el plan de BOOKING añade una ventana por cada fecha
  confirmada ≥1,15 sin colapsar (solo candidatas; el tope 12/pasada acota el coste). El sweep de
  Serper mantiene el colapso (paga por búsqueda y su corpus no descongela). Ensayado con datos reales:
  la próxima pasada dedica 12/12 huecos a noches congeladas (16-ago, 09/10-sep…).

### 🧊 (13/08/2026) Guarda «evento a ciegas»: una noche de evento confirmado sin mercado fiable NO baja
- Primera pasada real del verificador: 6 noches de la Bienal confirmadas solas (0,072€, 0 fallos, 0
  descartes indebidos)… y el motor las siguió bajando −20%/día hacia el ancla global — esas fechas
  tienen 0 comps fiables y el «no sé nada de esta noche» moría en `evaluado:false` sin oyente.
- **Decisión DELEGADA a Fable 5 por Alberto** («que el analice todo y tome la decisión»): congelar la
  bajada (subir sí) mientras la fecha no tenga ≥3 comps fiables; descongelado automático al medirse.
  Dato que decidió: la única noche de evento de sept. medida (26-sep) da p50 264€ vs ~104€ el mes.
- `decidirEventoACiegas` (centinela #5, puro) + guarda en `apply` (solo confirmados; generaliza la de
  Karol G a factor ≥1,15 y por FECHA) + cola de Booking prioriza evento confirmado sin medir + aviso
  🧊 agrupado con dedupe 7d (tabla `pricing_avisos`, migración aplicada). NO se bajó el umbral de
  `evento_sin_respaldo` (ruido). Los `descartado` ya no gastan ventanas del plan de barrido.

### 🔍 (12/08/2026) Los eventos PREVISTOS se verifican y deciden SOLOS (PR #1386)
- Alberto, ante el aviso 🔮 con 3 fechas de Mangafest: «esto tiene q ser automático, yo no sé de esta
  información». **Retirado ese Telegram**; decide el cron nuevo `/api/sivra/eventos/verificar` (05:30 UTC).
- Tres señales independientes (`lib/sivra/eventos-verificacion.ts`, puro, 23 tests): fila ya confirmada
  de la misma fecha con nombre parecido · búsqueda dirigida (confirma ≥0,8; desmentido → descarta) ·
  mercado real de esa noche (+25% sobre la línea del mes). **Caducidad a 21 días.**
- 🚨 Con la búsqueda caída NO se decide nada (solo cuentan las verificaciones ÚTILES) y el latido nuevo
  `sivra_eventos_verificar` se pone en rojo. Migración `2026-08-12_eventos_verificacion.sql` **aplicada**.
- Decisiones de Alberto: verificar y decidir solo (incl. auto-confirmar) · Telegram solo para pelotazos
  (factor ≥1,4) y para el latido. `decidido_por='alberto'` bloquea al cron. Diseño en `docs/superpowers/specs/`.

### 💸 (12/08/2026) Veredicto: intradía NO, y la mejor inversión no está en bolsa — `docs/INVERSION-VEREDICTO-2026-08.md`
- Alberto pregunta si meter toda la cuenta a intradía al 0,5-1% diario, y luego por cruces de medias.
  **No, con sus propios datos:** 227 ejecuciones reales 2026 → −34,0% YTD, acierto 17,2%, PF 0,28,
  esperanza −172 $/op (Kelly negativo). Retorno monótono por horizonte: **−1,88% a <1 día vs +1,16% a >10 días**.
- Cruces de medias ya medidos: `momentum` (EMA12/26+MACD) es la PEOR del torneo (hit 24,1%, ret −0,63%).
  Backtest propio SPY 30 min/77 sesiones: ninguna variante bate comprar-y-no-tocar (+8,43%).
- **Hallazgo grande:** comisión Booking = 19,72% real (`amount_gross−amount`), **120.635 € en 5 años**;
  en 2026 (22.504 €) supera la pérdida bursátil (16.698 €). DIRECTO en 2026 = 0 € con `apps/sivra` y la
  skill SEO ya construidas. Booking = 92% de facturación (riesgo de canal: Airbnb 42.460 €→1.219 €).
- Regla dura añadida a la skill `trading-analista`. Decisión de no operar en real SIGUE vigente. PR draft #1387.
- **Plan de reservas directas** (`docs/PLAN-RESERVAS-DIRECTAS.md`). Palanca clave: Booking renunció a la
  paridad de precios en el EEE el 02/12/2024 (DMA art. 5(3)) → **legal ser −10% en web propia**.
  Meta año 1: 20% directo ≈ 5.000 €. ⚠️ **Diagnóstico inicial CORREGIDO el mismo día — ver entrada 🏠.**

### 📧 (12/08/2026) facturas-correo — pasada diaria sin novedades
- Vía B sana (`dias_caido=0`), backlog `PDF-pendiente`/`Revisar` vacío, 0 candidatos Gmail y 0
  subidas manuales nuevas.
- Paso 4.0: única fila `sin_revisar` (Endesa-Dúplex marzo, 69,21€) ya estaba conciliada de antes
  (mismo `factura_ref`) — solo faltaba el FK `movimiento_id`, backfilleado en Supabase.
- PR draft #1383 (solo bitácora) abierto y en seguimiento (`subscribe_pr_activity`).
- Pendiente sin resolver: `search_threads label:Facturas/Extraccion-fallida` (Label_16, 1 mensaje
  según `list_labels`) devuelve vacío — posible lag del índice del conector Gmail, revisar a mano.

### 🏷️ (12/08/2026) El contraste diferido casi anula tesis BUENAS: el ref con la fecha corrida
- Mergeado **#1370** (contraste diferido, opción (a)). La pasada del 11/08 —primera con #1363 en prod—
  salió perfecta: **22 símbolos** (13 la víspera), **0 vetados**, 0 anulados, 4 huellas + 2 latidos,
  1 sola pasada. El arreglo del veto falso funciona en real.
- Al probarlo contra IBKR apareció un fallo del propio #1370: una pasada que corre ANTES del cierre
  guarda bajo la fecha de hoy el **cierre de AYER**. El repaso manual del 06/08 (09:34 UTC) dejó MSFT
  en `precio_ref` 487,46 con cierre real 499,86 → **−2,48%, por encima del umbral: habría anulado esas
  tesis**. Y 487,46 es al céntimo el cierre del 05/08 (CVX igual, pero su desvío se quedó en −1,49% y
  no llegó a saltar: no se vio antes por suerte del mercado, no porque no estuviera).
- Arreglo (**PR #1382**): `ETIQUETA_TOL` — si el ref se parece al cierre de la sesión ANTERIOR mucho más
  que al de la suya, es la etiqueta corrida, no un precio malo: no se juzga ni se anula, y se canta.
  Un precio envenenado no se parece a ninguno de los dos, así que sigue cayendo. 50/50 tests.
- Skill `trading-analista`: sección nueva **«cuándo se corre y por qué importa la hora»** (repasos a mano,
  SIEMPRE después del cierre americano).

### ⏰ (11/08/2026) Recordatorios de seguimiento del laboratorio de inversión (decisión: seguir en paper)
- Alberto, tras el informe de la auditoría: **seguimos en paper** («ok seguimos entonces») + recordatorios.
- Trigger **quincenal** `trig_01FJtQFiEMVGnEj9vpdBYA3f` (días 1 y 15, 08:00 UTC, sesión nueva + push):
  informe del forward vs SPY, escalera con cobertura, cohetes y veredicto sobre dinero real. Solo escribe
  en memoria/PR si hay cambio material. **One-shot** `trig_014V3ytMp9JZPwnbkEPxZRWu` el 16/11/2026
  (hito ~4 meses de la cohorte 18/07 → evaluar Tramo 2; push+email).
- ⚠️ Limitación: los triggers por MCP no almacenan conectores en esta org → el prompt lleva plan B
  (leer el hero de `/invitado/trading` con el token de `trading_acceso_token`; si se rota el token,
  `update_trigger`). Documentado como rutina 14 en `docs/RUTINAS-PROGRAMADAS.md`.

### 🛡️ (11/08/2026) Auditoría completa del laboratorio de inversión + guardián de datos en TODOS los caminos
- Origen: Alberto vio a RDY nº 1 (score 6,03) — EY 682% (ADR en rupias, familia ORCL #1189). **#1373**: la página
  puntuaba la caché CRUDA (el guardián `calidad-datos.ts` solo lo aplicaban cron y analisis-simbolo) →
  `neutralizarUniverso()` + backfill BD (RDY/BMNR/VRSN). Verificado en prod: nº 1 ahora SNDK, RDY score null.
- **#1374**: mismo agujero en `/api/trading/seleccion` (¡la ruta que congela cohortes!), caza-cohetes y `/factores`.
- Auditoría (agente + SQL): 🔴 PENDIENTE GORDO — el walk-forward que alimenta la 🪜 escalera mide con ventanas
  DESALINEADAS (series truncadas de Stooq → retorno de otra ventana; riesgo cesta vs bench en longitudes distintas)
  y sin declarar cobertura. 🟡 momentum sin ventana declarada ni guarda de costuras; Piotroski NULL→0 regala puntos;
  cohetes sin precio se congelan a precio de entrada; `/analizar` se cree el nav del body; Dataroma caído = «sin gurús».
- Track real (23 días): cesta mediana +0,24% vs SPY +4,20% (baten 3/8) · cohetes −2,6% (alpha −7,2%) · torneo hit 26-28%
  ret ~0 (n=460) · Tramo 1. Sin señal de ventaja aún — la decisión de no operar en real sigue vigente.
- **El 🔴 gordo ARREGLADO en la misma sesión:** nuevo `module-trading/medicionAlineada.ts` (series FECHADAS,
  misma ventana cesta/bench, cobertura declarada — serie truncada de Stooq → `sinDatos`, nunca un retorno de
  otra ventana); `paper-tracker` migrado y la escalera gana gate `cobertura ≥ 80%` (enmienda de
  operacionalización, `COBERTURA_MIN_ESCALERA`). Quedan 🟡: momentum/costuras, Piotroski NULL→0, cohetes
  a precio de entrada, nav de `/analizar` sin contrastar, Dataroma caído = «sin gurús».

### 🔁 (11/08/2026) FK real facturas↔banco y el barrido del backlog como paso OBLIGATORIO
- Cierre del hilo de la factura 47/2026 (#1372). El fallo de fondo no era de dato sino de método: la pasada
  solo miraba el correo nuevo, así que su «sin novedades» era cierto sobre la bandeja y falso sobre la
  contabilidad — 11 facturas archivadas llevaban desde enero sin cargo casado.
- **Causa estructural:** `facturas_drive` y `movimientos_bancarios` no tenían relación; el único puente era
  `factura_ref`, texto libre con 4 formatos. **FK APLICADA** (Alberto: «tira con la FK»):
  `facturas_drive.movimiento_id` + `sin_cargo_motivo` (migración `2026-08-11_facturas_drive_movimiento_fk.sql`).
  **Tres estados**: casada · `revisada_sin_cargo` (con motivo) · `sin_revisar` — un NULL ya no es «no hay».
- Backfill 2026 de las 38: **29 casadas** (25 automáticas + 4 a mano), **8 revisadas sin cargo** (Pepephone
  ene–jun y Giraldillo mayo `sin_cargo_localizado`, CREATE junio `duplicada`), **1 sin revisar a propósito**
  (Endesa Dúplex marzo: su cargo se separa 9,70€ y no 5,78€ del patrón → que alguien abra el PDF).
- Nuevo **Paso 4.0** en la skill: toda pasada abre `v_facturas_sin_cargo` ANTES de conciliar lo del día, y
  al conciliar escribe la FK (o el motivo). PR #1376. Pendiente de Alberto: Pepephone (¿cuenta de la SL?) y
  si el Giraldillo de mayo está sin pagar.

### 🧾 (11/08/2026) Conciliada la factura 47/2026 de Jaime Salas (electricidad Socorro 24)
- Alberto preguntó por el cargo `TRANSF. 2100 FACTURA 472026 REPARACIN ELECTRICIDAD` −278,30€ (Kutxa, 07/08),
  que salía ❌ en `/finanzas`. La factura SÍ estaba archivada desde el 07/08 (Drive `1BNr2lF0…`, fila en
  `facturas_drive`, proveedor `jaime-salas-electricidad`); lo que faltaba era la conciliación bancaria.
- Causa: la pasada del 07/08 archivó la factura ANTES de que el cargo entrara por PSD2 (feed iba por el 06/08),
  y al importarse después cayó con `destino='personal'` por defecto — nadie volvió a recogerlo.
- Movimiento `1b1204d7` actualizado: `turistico_pisos` · `prop_house_sevillana` · `conciliado=true` ·
  `destino_confirmado=true` · `factura_ref` al PDF de Drive. Deducible al 100% (gasto corriente).
- **Barrido del mismo fallo en todo 2026** (Alberto: «mira si hay más facturas sin conciliar»): 10 más
  casadas — 8 recibos EMASESA (ene/mar/may, los 3 pisos, con `propiedad_id`; los de mar y may traen el
  nº de factura en el propio concepto), CREATE ventilador Socorro 123,45€ e IONOS 1,82€.
- **PriceLabs resuelto por Alberto (11/08): «es por el cambio».** Factura SIEMPRE 64,96 USD el día 8 de
  cada mes (feb–jul) y el banco carga el euro del día — 54,99 · 55,91 · 55,59 · 55,38 · 56,38 · 56,98€.
  La diferencia es solo FX, no un descuadre. Conciliado el cargo de junio (56,38€) con su PDF; feb, mar,
  abr, may y jul siguen sin PDF archivado (hay que bajarlos del portal). El deducible es el EURO cargado.
- Quedan 4 avisos SIN tocar (necesitan a Alberto): Pepephone ene–jun (6 PDF archivados y **ningún**
  cargo suyo en las cuentas de Alberto → probablemente se carga en la cuenta de la SL); lavandería
  Giraldillo mayo 504,57€ sin cargo (paga el mes vencido; el de abril sí está); Endesa Dúplex 24/07
  87,42€ con cargo pero sin PDF archivado; fila duplicada en `facturas_drive` del ticket CREATE
  (`create-socorro` + `create_ventilador`, mismo importe y fecha, distinto fileId — el banco solo tiene
  UN cargo).

### 📈 (11/08/2026) /trading rediseñado: hero con las 2 respuestas (empresas + rentabilidad)
- Petición de Alberto: la página daba mucha info; lo que importa es qué empresas interesan y cómo va la cartera.
- Hero doble arriba (💡 señales 📈 + top ranking + compras del agente · 📊 mediana vs SPY + curva + tramo escalera);
  onboarding condensado a 1 línea; forward paper, cartera cohetes y caza-cohetes PLEGADOS.
- Nuevo `DetallePerezoso.tsx` (details con montaje perezoso — la cartera de estudio ya no paga fetch+Recharts si nadie la abre).
- Honestidad de datos: banner «datos parciales» si falla una query (antes un fallo de BD pintaba el 🌱 vacío),
  alpha/IPO null ya no salen como ⚠️/0€, celda de señal «no calculado» fuera del top-20; fixes móvil 320px + hex→tokens.
- **PR #1368 MERGEADO y verificado en producción** (hero servido, 0 errores runtime; revisión previa con
  agente de diseño). Follow-up: 401 de `/api/trading/cartera-estudio` al invitado ya no se pinta como «fuente caída».

### 🔀 (11/08/2026) Rescatados los 2 PRs con semanas en conflicto: #755 y #1055 MERGEADOS
- Orden de Alberto tras el FYI de la auditoría. Conflicto en ambos = memoria (sus entradas de julio
  chocaban con la rotación mensual) + radiografía generada; las entradas se archivaron en
  `docs/memoria/2026-07.md` (05/07 CSV con su caveat; 21/07 mariscos) y se regeneró la radiografía.
- **#755** banca: importar extractos CSV (tests 6/6; ⚠️ caveat: re-importar el export completo sin IBAN duplica el ledger).
- **#1055** NUEVA vertical `apps/mariscos` + `@central/module-pesca` (Fase 1 trazabilidad/etiquetado, 8/8 tests, build OK).
  **Pendiente para darla por viva:** proyecto Vercel (Root `apps/mariscos`), ejecutar su SQL en Supabase
  (preview→prod), sembrar cuenta real de Mariscos González; Fase 2 báscula/etiquetadora.

### ⚖️ (11/08/2026) Contraste diferido: la 2ª fuente juzga AYER, que es lo que sí ha publicado
- Mergeado **#1363** (el contraste del mismo día dejaba de vetar precios buenos) y desplegado en prod.
  Efecto colateral asumido: a las 20:30 UTC la fuente casi nunca tiene el cierre del día → contraste inerte.
- Alberto elige la **opción (a)**: comparar el cierre que la fuente SÍ publica de la sesión D contra
  nuestro `precio_ref` de D. Siempre disponible, cero falsos vetos; el remedio cambia — en vez de vetar
  el precio de hoy, **anula la tesis de ayer** (y su resultado) antes de recalcular el walk-forward.
- `juzgarDiferido` (puro, 9 tests) con dos frenos: un **split** desplaza TODAS las sesiones por el mismo
  factor → no se anula; si discrepa en **>½ de los símbolos** (≥4 con dato) la sospechosa es la FUENTE y
  tampoco se anula nada. El mínimo de 4 salió de un fallo real: sin él el interruptor se disparaba con un
  solo símbolo y la guardia quedaba muda justo en el caso que existe para cazar.

### 🔧 (10/08/2026) Pricing: el reparto mes/global del factor de demanda deja de perderse (#1361)
- `factorDemandaFecha` decidía por fecha si la demanda se mueve con la ocupación DEL MES o la anual,
  pero esa decisión solo viajaba en la respuesta HTTP del cron (nadie la guarda) — y su `.catch(() => [])`
  hacía que un fallo de la consulta cayera TODO a factor global sin un solo error en el log.
- Fix: `pricing_applied.demanda_fuente`/`demanda_gateada` por fecha (filas viejas a NULL a propósito) +
  aviso Telegram si la ocupación mensual es ilegible. `ok` no pasa a false (degradación, no fallo).
  Migración `2026-08-10_pricing_applied_demanda.sql` aplicada antes que el código. Detalle en skill
  `pricing-agente` (`estado-y-protocolo.md`).

### 🛡️ (10/08/2026) La 2ª fuente vetaba precios BUENOS: el contraste comparaba contra la sesión anterior
- La pasada del lunes 10/08 corrió **entera y por primera vez con las 4 huellas + el latido
  `trading_analizar`** (20:33 UTC). Pero vetó 8 de 21 símbolos en `/analizar` y descartó 5 precios
  en `/puntuar` — **ninguno estaba mal**.
- Causa: la pasada corre a las 20:33 UTC, media hora tras el cierre de Wall Street; Stooq/Yahoo aún
  publicaban el cierre del **viernes 07/08** (verificado contra IBKR) y `DIAS_CONTRASTE_MAX = 5` lo
  aceptaba *como si fuera el de hoy*. Cada «divergencia» era el hueco viernes→lunes de esa acción.
- Arreglo (**PR #1363**): el contraste **solo acepta el cierre de la MISMA sesión** (`juzgarPuntos`,
  puro y testeado con los datos reales del 10/08); si la fuente va por detrás → `desfasados`, que no
  veta y se canta en el latido. Consecuencia asumida: **el contraste queda inerte casi todas las
  noches** a esta hora — visible, no silencioso. Pendiente de decisión de Alberto: contraste diferido
  (comparar el cierre publicado contra nuestro `precio_ref` de ESA fecha) o cron aparte unas horas después.

### 💸 (10/08/2026) Decisión: Alberto deja de operar en real hasta aviso del agente
- Dos operaciones manuales reales en IBKR hoy con stops demasiado pegados: SPCX (270 acc.
  a 134,25 $, stop −2,35% saltó en 1 h, −855,10 $; luego recuperó POR ENCIMA de la entrada)
  y PLTR (200 acc. a 178,04 $, stop −0,72% saltó en 46 min, −258,77 $). Total −1.113,87 $.
  Confirmación en vivo de H9: el stop convierte el bache temporal en pérdida cerrada.
- **Decisión (sesión de solo charla, anotada a mano):** no operar más en real por impulso;
  esperar los avisos del agente `trading-analista`. OJO: el agente sigue en Fase 1 (paper) —
  sus ideas por Telegram son simuladas y la puerta a Fase 2 sigue cerrada (decisión de Alberto).
- Alberto pide **aviso explícito cuando el forward justifique plantear Fase 2** (hoy lejos:
  hit rate 26-29%, retorno medio ~0 sobre n=103 en `trading_estrategia_stats` al 08/08).

### ✅ (10/08/2026) Confirmación final: motor 100% operativo y probado tras la baja de PriceLabs
- **Prueba reina:** snapshot Smoobu 10/08 = últimas escrituras del motor del 09/08 **al euro en
  604/604 fechas** (129/205/103/167 por piso). PL mudo post-pausa (0 divergencias 14:30↔20:30).
- Alertas «precio_revertido» del guard 07:31 = restos PRE-pausa (últ. escritura 08/08, PL las pisó
  antes de las 15:00 del 09/08); la pasada 08:30 de hoy ya re-escribió las 7 → se autolimpian.
- Pasada 08:30 sana: 455 escrituras, 0 bajo suelo, 0 bajadas fuera del raíl (106 subidas sobre-raíl
  = suelos/eventos/ancla, legales por diseño). Previstos v2 verificado en vivo (House 25-nov 467 =
  base×1,25 ASEICA). 1ª reserva House bajo el motor: 11-13/09, 672€/noche ≈ 1,4× p50 fiable.
- **Vigilancia diaria 09:00 UTC** (`trig_01Eagedr...`) sigue hasta el OK de Alberto; PR #1345 mergeado.

### 💶 (10/08/2026) Pricing sivra — ciclo semanal completo (4 pisos)
- Ciclo semanal del agente de pricing: los 4 pisos (no solo los ya en vivo). Mercado real Booking
  (aforo real) para may/jun/jul-27 (estaban con 1 sola fecha, rancios) — 120 comps nuevos, ninguno a 0.
  Propuestas dry-run aplicadas por los raíles en los 4 pisos; circuit-breaker sano.
- Hallazgo: el bucket MENSUAL de junio-27 queda inflado por Karol G (11-13 jun) — el finde normal
  (25-27 jun) vale 126€ real, no los 339€ del mes. Usar siempre fecha exacta, no el mes, en junio.
- Pendiente: confirmar con Alberto si la venta de Busto-Feria (17-abr-27) a 103€ es real (sin fila en
  `incomes`) o un bloqueo/desfase; revisar 3 fechas de Luxury marcadas "no_disponible" pese a libres.
- Detalle en `pricing_aprendizaje` y `pricing_decisiones` (fuente=`agente_ciclo_10_08_2026`).

---

### ⏳ (09/08/2026) Last-minute encendido · sin techo de precio (decisión) · barrido PL de baja
- **Decisión de Alberto (2 palancas):** (1) **SIN techo** — `max_price` queda NULL a propósito
  («no tope! final copa rey hay q aprovechar»; el raíl permite bajar a tiempo). NO re-proponer.
  (2) **Last-minute ON**: `lastminute_k=0.5` en los 4 pisos, con su condición «que ganemos dinero,
  si no prefiero no vender» — cubierta porque el descuento va ANTES de min_price/suelo estacional/raíl
  y las noches de evento no se rebajan. De paso `seasonal_floor_k` 0→1 en Dúplex/House (venían del
  dry-run). SQL registro: `prisma/sql/2026-08-09_lastminute_activado.sql` (aplicado ~16:00 UTC).
- **Barrido «PriceLabs de baja»** en memoria/skills/facturas-control/UI → PR #1345 (draft).

### 🌊 (09/08/2026) Lente costa norte en mercado: preferencia por viviendas de playa Asturias/Cantabria
- **Preferencia de Alberto** (con una casona en Colunga, 235.000€/257 m²/~914€/m²): «da preferencia a
  casas como estas, cerca de playa en el norte». Nueva lente PURA `costa-norte.ts` en `module-subastas`
  (litoral asturiano+cántabro, matching por palabra completa — «Isla»/«Salinas» fuera por Isla Cristina)
  + `lenteCostaNorte`: viviendas sin señales de obra AUNQUE no lleguen a chollo (en el norte casi nunca
  hay mediana de zona; referencia null SE DICE, no se calla). `lentesMercado()` en plataforma: sección 🌊
  en el Telegram del cron `subastas-mercado` y en /subastas; chollos de esas zonas etiquetados 🌊 y primero.
- **MERGEADO** (#1346 + fix #1347) y probado contra el corpus real (741 comps, 99 en zona norte — las
  alertas ya cubren Gijón/Villaviciosa/Llanes): lente 93 viviendas, 15 chollos 🌊, 0 falsos positivos del
  sur. El fix #1347: un descuento de derribo (>50%) saca de la lente (la derruida de Llanes salía 1ª con
  −73% y título limpio — la doctrina del peaje de obra aplica también aquí). Prod desplegado y verificado.
- **Refinada por Alberto y MERGEADA (#1349):** solo CASAS (pisos fuera), tope 230.000€, +Islantilla
  como zona preferente; orden rebajadas→particular→descuento (ordenan, NO filtran — exigir rebaja
  escondería el recién publicado mal preciado). `dedupeRelistados`: Idealista re-publica con ref nuevo
  (piso de Ceares duplicado en la UI, verificado en BD) — colapso por (portal,título,precio,m²) al corpus
  entero. Corpus real: 11 casas ≤230k (Villaviciosa −49%, 6 adosados Islantilla), 43 re-listados fuera.
- **3ª ronda (#1351, mergeado):** (a) la preferencia llega a SUBASTAS — vivienda en zona 🌊 suena SIEMPRE
  en `subastas-avisos` con cabecera «🌊 TU PREFERENCIA» aunque el filtro rentable/limpia la silenciara
  (honestidad: el aviso dice si va sin verificar); (b) **Matalascañas** entra como zona preferente tras
  medirla en vivo (Fotocasa: 216 anuncios vs 133 Islantilla, mediana 2.857 vs 3.308 €/m²); (c) pestaña
  **🔥 Oportunidades** default de /subastas (diseño del agente Plan): bloque 🌊 fijo + lista única
  portal+subastas por atractivo, tarjeta compacta de subasta, filtros casas/rebajados/particular/fuente.
- **4ª ronda (#1353, mergeado y READY en prod):** Alberto creó la alerta de Idealista en Matalascañas SIN
  límite de precio (casas/adosados) → `ZONAS_SIN_TOPE = ['Matalascañas']` en la lente (el tope 230k sigue
  en el resto); copy de Telegram y /subastas lo dicen. Las SUBASTAS ya iban sin tope (el aviso forzado 🌊
  nunca filtró por precio). Decisión de estrategia: Asturias = chollo puro con gestora (~20-25% comisión);
  Huelva = uso mixto autogestionado — el radar vigila ambas. Skill `plataforma-maestro` actualizada.
- **5ª ronda — rediseño de 🔥 Oportunidades** («veo muy destartalada la página y poco clara», agente de
  diseño): UNA tarjeta `TarjetaOportunidad` para chollos/preferentes/subastas (precio 20px primero, chips
  homogéneos `ChipUI` con tokens --positive/--warning/--info, evidencia €/m² siempre visible, resto plegado
  en «Más datos»); cabecera con contador real + explicación en `<details>`; 🌊 en caja --info-bg colapsada
  a 5 con «Ver todas (N)»; filtros en fila scrollable (320px OK). Solo presentación, lógica intacta.
- **Repaso 12/08 EJECUTADO — todo sano:** corpus fresco (844, último hoy 05:50) y avisos vivos (93
  chollo_avisado_at en 7d, último hoy 06:21; Islantilla/Ribadesella avisados hoy); crons subastas al día
  (ingesta 06:00 · enriquecer 06:16 · radar 06:30); 0 errores runtime en rutas subastas (48h). Matalascañas
  sigue en 2 comparables PERO la alerta de Idealista SÍ llega (digest diario: «Viviendas en Matalascañas,
  Almonte — Nada nuevo por aquí hoy») — no hay chalets nuevos publicados, no es fallo. 0 subastas vigentes
  en zona 🌊 ahora mismo (el aviso forzado no ha tenido con qué dispararse; camino fijado por tests).
- Ojo: la lente solo ve las alertas guardadas — para vigilar más norte, crear alertas de Idealista en
  esas zonas. Galicia/Euskadi pendientes (patrón Cádiz).

### 🎯 (09/08/2026) Los 4 pisos bajo el motor · PriceLabs de baja · previstos v2 · fix verificado en vivo
- **Decisión de Alberto:** «el agente coge las riendas de los 4 apartamentos». Los 4 con
  `apply_enabled=true` + `channel_markup=1.0` (SQL aplicado tras deploy del PR #1337, mergeado).
  Pasada real 14:30 verificada: 4 pisos escritos, anclas al euro de lo predicho (House 4-sep 421€,
  Dúplex 13-nov 149€…), raíl ±20% respetado vs ancla diaria; 0 alertas nuevas.
- **PriceLabs:** Alberto pausó Dúplex/House en PL ~15:00 UTC (medido: 1.140/1.653 escrituras suyas
  sin motor esa semana; Busto/Luxury ya limpios). Curva PL persistida como suelo (120 días).
  Vigilancia: test de silencio de PL tras pasada 20:30 + snapshot y guard mañana (triggers armados).
- **Previstos v2 (idea de Alberto, riesgo asimétrico):** evento `previsto` LEJANO (≥60d) sube precio
  ponderado por confianza (×0,5); cerca se retira solo; confirmado = factor pleno. Tests 1.081 verdes.

### ✅ (09/08/2026) Pasada diaria de trading completada — 2 PRs mergeados en caliente para arreglar `date - bigint`
### 🔀 (09/08/2026) Backlog de PRs revisado y drenado: 3 mergeados, 1 superado, 2 a decisión
- Revisión "que no sea antiguo lo pendiente": mergeados #1304 (informe auditoría 08/08), #1329
  (auditoría profunda 09/08 + landmines subastas en CLAUDE.md + watchdog 3 tramos en RUTINAS) y
  #1333 (entrenador: fix `fecha`→`fecha_operacion` en `psd2-health-check` + poda bitácora),
  resolviendo sus conflictos de inserción contra el vivo podado. #1340 (::int trading) ya estaba en main.
- **#1323 (demanda por mes) SUPERADO a medias:** main ya tiene OTRO `pricing-demanda.ts` (gateo por
  antelación, 09/08) con API distinta; lo que #1323 añade de más (ocupación POR MES + boost
  `mes-anticipado`) hay que rehacerlo sobre el código nuevo — no mergear tal cual (ver Estado vivo).
- #1055 (mariscos) y #755 (CSV banca) siguen a decisión de Alberto. Verificado post-merge: CI verde
  ×3, rotación 17/17 + dry-run limpio, 0 marcadores de conflicto, vivo en 17 KB.

### 🔴 (09/08/2026) Pasada diaria de trading BLOQUEADA desde el despliegue de la guardia de precios — fix en PR draft
- Rutina `trading-analista`: NAV IBKR (33.328,17€) empujado a `/banca` OK; watchlist + histórico de 16
  símbolos bajado sin incidencias. `POST /api/trading/analizar` devolvía **500 en cada intento** (payload
  completo y mínimo de prueba) → causa raíz: `lib/trading/precios-guardia`, query hace
  `fecha - DIAS_REFERENCIA_MAX` sin castear la constante, Prisma la manda `bigint`, Postgres no define
  `date - bigint`. Rota desde que se desplegó esa guardia (post-incidente CVX 03/08) — toda pasada de
  análisis desde entonces había fallado en silencio.
- Fix de una línea (`::int`), verificado byte a byte contra Supabase. **PR #1340 mergeado a petición de
  Alberto** ("mergea"); tras el redeploy se encontró el MISMO bug sin corregir en `/puntuar` (copia literal
  de la query, no cubierta por #1340) → **PR #1341**, mismo fix, mergeado también.
- Pasada completada tras los dos redeploys: 14/16 símbolos analizados (SNDK/WDC vetados por la guardia de
  suplantación), 2 compras paper nuevas (NVO 90u@47,26€, PLTR 17u@172,01€), 24 tesis puntuadas walk-forward,
  0 stops. Resumen enviado por Telegram.
- **Fase 2 (dinero real):** Alberto preguntó por adelantar el plazo — recordado que ya existe
  `docs/TRADING-HIPOTESIS-PREREGISTRO.md` § «Plan de despliegue de capital REAL» (firmada 05/08): la
  escalera la suben las SEÑALES, no el calendario (`lib/trading/puerta-fase2.ts`). Estado real hoy:
  cohortes paper en 14-16 de los 120 días que exige el Tramo 2 (~12%). Verificado que el cron semanal
  `paper-tracker` (lunes 10:00 UTC) NO está roto — el dato del 03/08 es el último lunes, no un fallo.
- **Watchlist ampliada** (`trading_watchlist`, capa C): +**ORCL** (a petición expresa, con caveat: la
  tesis de rebote en EMA100 mensual que la motivaba ya fue REFUTADA por H8 y tuvo un incidente de datos
  serio el 31/07); +**BKNG**/+**APP** (únicos `guru:true` del top-20 del radar factorial 03/08 no
  presentes en la watchlist); +**SQM**/+**CHT** (mejor calidad restante del top-20, sector diverso —
  litio/materiales y telecom, sin solapar con lo ya cableado). `trading_cantera` (pipeline de
  descubrimiento IBKR-temas+FMP) sigue vacía — no se ha ejecutado ese flujo, es un mecanismo distinto
  del radar factorial usado aquí.
- **Decisión explícita: NO maximizar la watchlist.** Alberto preguntó por meter "el máximo posible" de
  símbolos; se explicó y se decidió NO hacerlo — más símbolos no acelera Fase 2 (gate por antigüedad de
  cohorte, tabla `trading_paper_track`, no por nº de tickers de la watchlist diaria), y sí infla el
  fetch secuencial de IBKR (techo 300s en `/analizar`) y arriesga meter ruido/correlación en las
  estadísticas de `trading_estrategia_stats`. Watchlist final: **21 símbolos** (3 índices, 10 capa B,
  8 capa C). Alberto delegó la decisión final ("lo dejo en tu decisión").

### 🛡️ (09/08/2026) Auditoría PROFUNDA semanal — todo verde, PR #1329
Pasada completa `auditoria-central` (no solo la ligera): typecheck 0 errores en las **8 apps**, tests
sin fallos, sin secretos con fallback literal, Supabase advisors 0 ERROR, heartbeat de crons/agentes
limpio, automerge de rutinas sano. Único hallazgo: 21 vulns de `pnpm audit`, ninguna explotable
(documentado). Reconciliados 2 docs desactualizados que #1328 (ligera, mismo día) no cubrió:
`apps/plataforma/CLAUDE.md` (subastas sin los PRs #1324/#1325/#1327) y `docs/RUTINAS-PROGRAMADAS.md`
(watchdog de trading descrito con 2 tramos en vez de 3, huella de pricing desactualizada). Informe
completo `docs/AUDITORIA-2026-08.md`.

### 🤖 (09/08/2026) agentes-entrenador — pasada semanal (29/07→09/08): backlog sano, un fix trivial
- Backlog de PRs `claude/*` abiertos: **5** (bajando desde 73→31 del barrido de Alberto de 29/07) —
  sin crecimiento, sin necesidad de escalar. `FEEDBACK-AGENTES.md` sin pendientes.
- Único fix: `psd2-health-check/SKILL.md` usaba la columna `fecha` (no existe; real
  `fecha_operacion`, confirmado contra Supabase) — señalado el 05/08, corregido ahora.
- Resto de fallos del rango (tope real de mercado-booking, sonda pricing en verde falso) ya
  resueltos por PRs de sus propias sesiones (#1314, #1318) antes de esta pasada.
- 🔇→✅ Canal Telegram mudo (401, `ALERTA_TOKEN` desincronizado) — a petición de Alberto, resuelto en la
  misma sesión SIN tocar Vercel: registrado el token que ya lleva esta rutina en `rutina_tokens`
  (3ª vía de `docs/AVISOS-AGENTES.md`). Verificado end-to-end (200 + Telegram real recibido). Ningún
  tool de Vercel MCP expone env vars — la sincronización byte-a-byte en Vercel sigue sin ser algo que
  una sesión pueda ejecutar.

### 🧹 (09/08/2026) «Estado actual» podado: el vivo baja de 121 KB a ~15 KB por sesión
- La sección acumulaba 42 bloques (1.212 de 1.329 líneas, ~30k tokens de peaje en CADA
  sesión) porque la rotación mensual no la tocaba. Contenido ÍNTEGRO movido a
  `docs/memoria/2026-08.md`; queda solo el bloque «Estado vivo» (pendientes/decisiones).
- Reglas nuevas en la cabecera: qué admite «Estado vivo» y formato de cabecera de entrada
  (las entradas `## ` del 08-09/08 se convirtieron a `### ` — `rotar-memoria.mjs` no
  reconoce `## ` como entrada y las habría archivado fundidas con la anterior).
- Verificado: tests de `rotar-memoria` + `--dry-run` sobre el archivo nuevo. El dry-run cazó
  además un título con «16-18/10» al final que la rotación habría archivado en 2025-10 (la
  fecha de la cabecera es la ÚLTIMA que aparece) — reescrito «16-18 de octubre».

### 🔧 (09/08/2026) Reparadas las 3 causas de la venta bajo mercado del finde (motor pricing)
- **El `channel_markup` 1,16 NO existe en el escaparate** (20 reservas: bruto/listado 0,66-1,08,
  mediana 0,92; la del 06/11 a factor 1,004 exacto). La «confirmación» del 01/08 usó el importe
  corrupto pre-fix de la doble comisión. Guardas `>= 1` (con `> 1`, un 1.0 se ignoraba) en
  apply/settings/pricing-engine + `prisma/sql/2026-08-09_channel_markup_sin_recargo.sql` →
  **aplicar SOLO tras desplegar el código**.
- **Ancla suave por fecha** (`pricing-ancla-fecha.ts`): finde con mediana fiable (≥5 comps) ya no se
  tarifica al bucket del mes. **Demanda gateada por antelación** (`pricing-demanda.ts`): sin descuento
  por ocupación en fechas fuera de la ventana de venta. Detalle: adenda 09/08 en
  `docs/AUDITORIA-2026-08-precios-dinamicos.md`. tsc 0 · 1.067 tests · build OK.

### 🔎 (09/08/2026) Auditoría subastas 100% + captura de resultados por fin validada con la 1ª real
- Auditoría completa del módulo: 6 crons 200 hoy · corpus 41 vigentes sano (0 sin valor/docs/semáforo,
  18/18 con puja_minima) · barrido umbrales/coste/ITP sobre las 41 filas → 0 excepciones · 447+1054 tests.
- Hallazgo 🔴 (arreglado, PR): `capturarResultados` NUNCA capturó nada — la ficha concluida real
  (SUB-JA-2026-264154, El Puerto) publica el estado como BANNER, no como par, y el desenlace vive en el
  **certificado de cierre** (PDF público). Nuevos `resultadoDeBanner`/`parsearCertificadoCierre` (fixtures
  reales) + fetch del certificado en el cron; `con_pujas` calibra como adjudicada. E2E: las 2 concluidas
  reales resuelven con su puja máxima oficial (170.627,72€ / 161.712,72€).
- 🟡 sin tocar: dispatcher marca timeout en subastas-mercado si desborda 280s (2 veces/7d, el job acaba).

### ⚖️ (09/08/2026) Seguimiento subastas: backfill puja_minima + fix starvation de la cola
- Check-in post PRs #1324/#1327: parser OK (las 2 fichas releídas hoy → `puja_minima=0`), pero la cola
  del cron `subastas-enriquecer` (LIMIT 12/día) la monopolizaban re-pasadas NO-OP de la Junta (23 filas
  ya geocodificadas que solo refrescaban `enriquecida_at`) → las fichas del BOE se releían cada 3-4 días.
- Backfill manual con el parser real del módulo: 16 fichas vivas → `puja_minima=0` (18/18 al día).
- Fix (PR draft): la cola solo coge fuentes sin ficha si les queda trabajo real; `max` default 12→24;
  `REFRESCO_HORAS` 24→23 (el umbral exacto de 24 h hacía saltar un día sí/uno no por segundos).
- Verificado: cierre 09:00 → 200; sin errores runtime nuevos; Cancienes al ITP 8% asturiano = 95.112€.

### 💶 (09/08/2026) Verificación reserva Luxury 16-18 de octubre: 3ª venta bajo el p50 de fecha exacta
- Reserva Booking (Genius, 5p): 341,74€/2 noches = 170,87€/noche efectivo; lista 194€ (el motor
  bajó 208→194 el 08/08 14:30, reserva entró el 09/08 08:36). p50 real de esas fechas (comps 5p,
  barrido 09/08): 275€ (vie) / 258,50€ (sáb) → −27% en lista, −36% efectivo, bajo el p25.
- Causa: hueco conocido finde-sin-evento — ratio fecha/mes 1,1 < umbral 1,5 del premio de mercado
  → tarifica por bucket octubre (p50 250€) + descuento de demanda (ocupación ~12%). Mismo patrón
  que 06/11 (−43%) y 18/09 (−40%). Margen sano (coste 29,70€/noche); no ruinosa, sí barata.
- Sin cambios de código; el guardián debería avisar `reserva_bajo_mercado` en su cron. Pendiente
  (ya apuntado en skill): bajada last-minute real + revisar si el premio 1,5× deja escapar findes.
- Vía B sana (`dias_caido=1`), sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`, 0
  candidatos nuevos en Gmail ni subidas manuales.
- Cerrado 1 pendiente de días atrás: recibo Anthropic/Claude Max (180€, 05/08) archivado en Drive
  y conciliado contra el cargo bancario del 07/08.
- Sigue pendiente: Roborock Amazon -247,92€ aún sin aparecer en `movimientos_bancarios`. Detalle
  completo en `docs/AGENTES-BITACORA.md`.

### 🏛️ (08/08/2026) Subastas 3ª tanda: coste autoexplicativo, ITP valenciano al 9% y presupuesto del vigía — PR #1327
- «Coste real estimado: 806.015,16€» se leía como valoración de mercado (pregunta de Alberto sobre
  SUB-JA-2026-264062): es el coste puerta abierta simulando el remate al 100% de la salida — el
  titular y el aviso de Telegram lo dicen ahora explícitamente («…si rematas a la salida»).
- ITP Comunidad Valenciana corregido: 10%→**9%** (Ley 5/2025), tabla de tipos por CCAA re-verificada
  contra fuentes vigentes. `subastas-cierre` gana presupuesto de tiempo (mismo patrón que #1281/#1296).
- Rediseño de la ficha de subasta con la información de las tandas anteriores (ITP, umbrales, simulador).

### 📬 (08/08/2026) Subastas: cursor incremental por UID — la ingesta dejaba de releer 300 correos/día — PR #1296
- El cron diario pedía «últimos 30 días, hasta 150 correos/portal» siempre — como el corpus de
  Idealista/Fotocasa es acumulativo, relía ~300 correos para encontrar los pocos nuevos y se comía el
  presupuesto de tiempo (latido 07/08: «cortado tras 0 fichas»). Ahora cada portal guarda hasta qué UID
  leyó (`subastas_correo_cursor`, tabla propia — NO `correo_cursor`, que es el latido del triaje de correo).
- `lib/subastas/correo-incremental.ts` (puro, testeado): filtro `>lastUid` en cliente (RFC 3501),
  `uidvalidity` distinto → vuelve a ventana por fecha, cursor solo se confirma tras ingerir (at-least-once).
  BOE (`leerAlertas`) queda intacto, sin cursor. 826 tests, tsc 0, build OK.
- **VERIFICADO en producción (10/08/2026, 2ª pasada — la 1ª fue el bootstrap):** 34 correos leídos
  (23 idealista + 11 fotocasa, «desde uid N») frente a 300, **55s** frente a 284s, y **cero cortes por
  presupuesto** — fichas de anunciante y zonas se enriquecen enteras por primera vez desde el 05/08.

### 🧮 (08/08/2026) Subastas 2ª tanda: ITP por CCAA, puja en vivo, vivienda habitual y simulador
- **ITP por CCAA** (`module-subastas/src/impuestos.ts`): `calcularCoste` deja de aplicar el 7% andaluz a
  todo — la provincia elige el tipo general de su CCAA (Asturias 8%: Cancienes pasa de 94.248€ a 95.112€),
  con aviso del tipo aplicado y de las escalas progresivas. `params.tipoItp` explícito sigue mandando.
- **Vigía de pujas en vivo** en `subastas-cierre`: `mejorPujaViva()` (1 llamada/ficha, seguidas a ≤3 días)
  → `subastas.mejor_puja(_at)` (migración `2026-08-08_subastas_mejor_puja.sql`, aplicada) + Telegram 🔥 una
  sola vez si superan tu techo (`sobrepuja_avisada_at`). NULL nunca pisa un valor visto.
- **Vivienda habitual** (ya se extraía del edicto): `viviendaHabitualDeNotas` (round-trip testeado) afina la
  nota del art. 671 en umbrales/ficha. **Simulador «¿y si pujo X?»** en la ficha (módulo puro + financiación
  de criterios; banda de aprobación, admisibilidad, tramos). Tests 443 módulo + 1045 app, tsc 0, build OK.

### ⚖️ (08/08/2026) Subastas: deuda, puja mínima y umbrales LEC 670 en la ficha
- Pregunta de Alberto («¿se puja por la deuda? ¿el 70%?»): la «salida» YA es el valor de puja (tipo del
  BOE, no mercado); el 70% legal es del VALOR DE SUBASTA, no de la deuda (LEC 670). SUB-JA-* = judicial.
- 3 huecos arreglados: `cantidad_reclamada` era campo muerto (ahora en ficha), `puja_minima` sin consumidor
  (la puja máxima marca inadmisible/sin aprobación automática), y «Sin puja mínima» → centinela `0`
  (≠ NULL no publicada; COALESCE-safe, backfill solo vía relectura 24h del cron).
- Nuevo `module-subastas/src/umbrales.ts` (`umbralesPuja`/`estadoPujaMinima`) + `escenariosCoste` (70% del
  tipo + mediana provincial real). Score/coste siguen conservadores al 100% (decisión de Alberto).
- Telegram avisos con línea de umbrales+deuda. Migración documental `2026-08-08_puja_minima_centinela.sql`.
## 💹 (09/08/2026) La palanca de DEMANDA ya mira el MES, no el año — PR #1323 (draft, rehecho sobre #1337)
- #1337 (mergeado el 09/08) quitó el castigo a las fechas sin abrir, pero el `occ` de `pricing/apply`
  seguía siendo UNA ocupación anual por piso: el mes que se LLENA no podía subir el precio.
- #1323 se rehízo encima: consulta nueva de ocupación por piso+mes y `factorDemandaFecha`
  (`pricing-demanda.ts`) decide las dos cosas a la vez. Módulo único, +8 tests (1.075 verdes).
- 🚨 Trampa medida ANTES de darlo por bueno: usar el mes sin poder juzgar su ventana es PEOR que el bug
  — con muestra de antelación <10 (House jun/jul-2027) el 0% de un mes sin abrir hundía al suelo 0,92.
  Regla: la ocupación del mes solo se usa si la ventana es JUZGABLE; si no, factor global de siempre.
- Efecto real medido: 41 de 1.460 noches. House sept **+4,1%** (30 fechas); 11 fechas de agosto bajan
  ≤1,4%. Mucho menor que el +7,6% que se midió antes de #1337: aquel ya se llevó casi todo.
- Pendientes ya declarados: buckets feb→jul-2027, 23-oct/27-nov sin catalogar, `seasonal_floor_k` 0 vs 1.

### 🧱 (08/08/2026) Bandeja «cargos duplicados» de /banca responsive en móvil — PR #1319
- Captura de Alberto: en móvil las filas desbordaban (chips `flexShrink:0` + importe fuera de pantalla).
- Fix CSS-only en `BancaClient.tsx::DuplicadosBandeja`: media query ≤768px, concepto a ancho completo,
  fecha+chips+importe con wrap, botonera con wrap y botones ≥44px (`#duplicados`). Igual en «Ya resueltos».
- Mismo patrón que la bandeja «Gastos por revisar» del mismo archivo.
- Verificado 320/360px con Playwright (0px overflow). OJO: `next build` en el contenedor falla en
  page data de `/api/admin/clientes/[vertical]/[id]` YA en main (envs ausentes), no es del cambio.


- **📌 Estado vivo — pendientes y decisiones abiertas (actualizado 16/08/2026).** Detalle en
  `docs/memoria/2026-08.md` y en los PRs citados.
  - **Ayudas/subvenciones (15/08, #1432):** pendiente respuesta de Asecon (Marta Albarrán) sobre la
    convocatoria de conciliación antes del **15/09/2026** (plazo de solicitud). Pendiente además un
    borrador (sin enviar, a decisión de Alberto) sobre la cuota RETA de Pilar (serie 72→118→32€,
    ¿bonificación art. 38 LETA aplicada?).
  - **Pricing SIVRA — canal Booking (15/08):** reserva Luxury 22-25/10 mordida 29,4% por
    Genius+descuento móvil apilados (motor tarificó bien, la fuga es de canal). Pendiente que
    Alberto revise el nivel Genius y el descuento móvil activos en la extranet.
  - **Pricing SIVRA (motor vivo en los 4 pisos, resuelto desde el 09-10/08):** #1323 (ocupación
    POR MES) rehecho y mergeado sobre `pricing-demanda.ts`, `channel_markup_sin_recargo.sql`
    aplicado, last-minute encendido (`lastminute_k=0,5`) y reparto mes/global ya se persiste en
    `pricing_applied` (#1361, 10/08). Sigue abierto: el bucket mensual mezcla Serper+Booking sin
    filtrar `fuente` (propuesta: preferencia condicional + `bucket_fuente`, informe
    `docs/AUDITORIA-2026-08-precios-dinamicos.md`). feb→jul-2027 sin bucket (fallback de diseño;
    la rutina Booking lo va rellenando). A vigilar: 23-oct y 27-nov muy por encima de su mes sin
    evento catalogado.
  - **Mercado SIVRA:** `sivra_mercado_sweep` con latido rojo A PROPÓSITO hasta que la Rutina Booking
    consolide (Serper no distingue fecha). Incidente sin diagnosticar: 2º disparo de `mercado-booking`
    el mismo día sin huella del 1º (08/08, `docs/AGENTES-BITACORA.md`). Tope real ≈10-12 ventanas por
    pasada (las respuestas del conector no caben en contexto).
  - **Trading (solo paper):** auditoría del laboratorio 11/08 — el 🔴 gordo (walk-forward de la
    escalera desalineado entre cesta y bench) YA ARREGLADO en la misma sesión (`medicionAlineada.ts`,
    gate `COBERTURA_MIN_ESCALERA=0,8`, PR #1377). Quedan 🟡: momentum sin ventana declarada ni guarda
    de costuras, Piotroski NULL→0 regala puntos, cohetes sin precio se congelan al de entrada, nav de
    `/analizar` sin contrastar, Dataroma caído = «sin gurús». Contraste DIFERIDO (la 2ª fuente juzga el
    cierre de AYER en vez del de hoy) mergeado (#1370, 12/08). Rescate de tesis huérfanas (símbolo
    fuera del universo → se puntúa con el cierre de su vencimiento) mergeado y **verificado en
    producción** (#1403/12/08, contrastado 13/08: 16 tesis del 18/07 puntuadas al céntimo). Veredicto
    de inversión (`docs/INVERSION-VEREDICTO-2026-08.md`) re-verificado 13/08: 7 cifras publicadas
    estaban mal, corregidas; el veredicto (intradía NO) no cambia. H9 (stop −10%/trailing −15%) sigue
    sin decisión de Alberto. Decisión vigente (10/08): no operar más en real por impulso, esperar
    aviso explícito del agente cuando el forward justifique Fase 2 (hoy lejos: hit rate 26-29%, alpha
    ≈0 sobre n grande). FMP sin créditos y redundante (Yahoo cubre); NO recargar. Solo el DCF sigue
    sin fuente. Pendiente (13/08): averiguar quién escribe `trading_estrategia_stats.retorno_medio`
    (dos filas en `0.000000` — centinela «sin calcular», no cero medido). Pendiente nuevo (15/08,
    #1431): el PASO 0 del prompt del trigger comprueba `fecha=CURRENT_DATE`, que una recuperación
    backdateada esquiva (duplicó 88 tesis sin daño operativo) — debería comprobar la huella real
    (última vela/precio_ref usado); vive en la config del trigger, fuera de este repo. Trigger
    reprogramado por Alberto (15/08) a `15 20,23 * * 1-5`; estreno real lunes 17/08.
  - **Subastas:** lente 🌊 (costa norte + Matalascañas sin tope) MERGEADA y en prod (#1346/#1349/
    #1351/#1353); pestaña 🔥 Oportunidades rediseñada (#1358 — una tarjeta, chips homogéneos,
    €/m² siempre visible). 🟡 el dispatcher marca timeout en `subastas-mercado` si desborda 280 s
    (2×/7d, el job acaba). **Surus (6ª fuente, 13/08, #1406/#1408):** portal privado de liquidaciones
    con comisión al COMPRADOR (`comisionCompra` en `calcularCoste`, por fuente). El primer bug real
    (ingesta IMAP no leía nada por saltos de línea/columna) ya arreglado y con regresión — pero el
    correo de alerta de Surus **aún no se ha visto en producción** (alta del mismo día): pendiente
    contrastar el parser contra el primer aviso real que le llegue a Alberto.
  - **Facturas/banca sin conciliar:** Roborock −247,92€ (House) sin aparecer en banco; Booking Dúplex
    587,23€ vence 16/08; Socorro 24 julio sin factura de comisión; Endesa Dúplex 24/07 87,42€ con
    cargo pero sin PDF archivado; fila duplicada CREATE (`create-socorro` + `create_ventilador`,
    mismo importe/fecha, distinto fileId — el banco solo tiene un cargo). PriceLabs: la diferencia es
    SOLO el cambio USD→EUR (confirmado por Alberto 11/08), junio ya conciliado; feb/mar/abr/may/jul
    sin PDF archivado (bajar del portal). Pepephone ene-jun (6 PDF, **ningún** cargo en las cuentas de
    Alberto — probable cuenta de la SL) y lavandería Giraldillo mayo 504,57€ (paga el mes vencido)
    marcados `revisada_sin_cargo`, a la espera de que Alberto confirme. Casos abiertos sin respuesta:
    Bernardi −466,70€ (House) y Valantin −84,61€ (Busto). Desde #1376 hay FK real
    `facturas_drive.movimiento_id` + `sin_cargo_motivo` (3 estados: casada · revisada-sin-cargo ·
    sin-revisar) y el Paso 4.0 abre `v_facturas_sin_cargo` en cada pasada, antes de conciliar lo del
    día. El cron `facturas-scan` sigue archivando TODO en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` —
    revisar su resolución de carpeta algún día.
  - **Infra/entorno:** el proxy de egress del contenedor da 403 al CONNECT contra `*.vercel.app` y
    `script.google.com` → el raíl HTTP de plataforma no sirve desde sesiones (usar SQL o `pg_net`
    desde Supabase) hasta abrir la allowlist de red del environment. NIM tier gratis degradado
    (p50 ~25 s); pendiente suplente de `meta/llama-3.3-70b-instruct` (`buscador-ia`). Gemini apagado
    por defecto (gates `GEMINI_TEXTO`/`GEMINI_WEBSEARCH`). Pendiente en Vercel (fuera del repo):
    `SEO_AGENT_ENABLED=true` + bajar `SEO_MIN_IMPR` a 3-5 (ia-rest); PAT de Alberto sin
    `contents:write` sobre `house-sevillana-landing`; confirmar `CONTABLE_MODEL` con `NVIDIA_API_KEY`.
    Trial Tuya IoT Core caduca ~04/02/2027 (recordatorio one-shot creado para el 04/01/2027).
  - **Deuda de doc:** los datos vivos del CRM de ia-rest están en la BD COMPARTIDA (schema `iarest`);
    su AGENTS.md aún dice silo.
