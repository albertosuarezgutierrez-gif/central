# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo en "Registro de sesiones" y actualiza "Estado actual" y
> "Pendientes" si algo cambió. Un hook `Stop` (`.claude/hooks/persist-memoria.sh`)
> commitea y empuja este archivo automáticamente.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

- **📈 PRICING: +3 fuentes de datos GRATIS (rama `claude/dynamic-pricing-uhvnak`, PR #440) — 23/06/2026**
  Diagnóstico de la sesión: el motor MALVENDE las ventanas lejanas (Busto abril'27 vendido a 99€ vs mercado
  real ~150-179€; 270/349 noches futuras a suelo ~94€). Causa = DATOS: `market_rates` se nutre de una sola
  fuente (Serper→Booking, ~8 meses) y no cubre fechas lejanas; `pricing_eventos_auto` vacía. Plan aprobado
  por Alberto: "todo lo gratis y estudiamos resultado". Implementado:
  - **Fase 1 (skill):** `pricing-agente/SKILL.md` paso 2 — barrer hasta 12 meses + semanas altas, **triangular
    2-3 OTAs** (Booking APARTMENT + Expedia + lastminute; Trivago/Tripadvisor solo fallback) y **persistir por
    `POST /api/mercado/ingest`** (idempotente) en vez de SQL a mano.
  - **Fase 2 (código):** nueva ruta `app/api/sivra/eventos/websearch/route.ts` (Gemini + google_search, gated
    `GEMINI_API_KEY`) → upserta LaLiga/ferias/congresos/festivos en `pricing_eventos_auto` (`fuente='websearch'`),
    complementando a Ticketmaster. Cron lunes 5am en `vercel.json`. El motor ya combina por MAX → 0 cambios en él.
  - **Fase 3 (código, INERTE por defecto):** señal de demanda por vuelos a SVQ. Migración `prisma/sql/2026-06-23_pricing_flight_demand.sql`
    (tabla `pricing_flight_demand` + columna `pricing_settings.flight_demand_k` default **0**), ruta `POST /api/sivra/mercado/flights`,
    y gancho en `pricing/apply/route.ts` que solo actúa si `flight_demand_k>0` (k=0 ⇒ comportamiento idéntico). Migración YA aplicada a la BD.
  - **Fase 4 (RapidAPI de pago): APLAZADA** por Alberto. El stub `ingest-auto` ya existe.
  - **Datos en BD esta sesión:** sembrado `market_rates` abril'27 (6 comps Tripadvisor, p50 €179, search_date 06-15 para
    no contaminar el global) → abril re-ancla; aprendizaje en `pricing_aprendizaje` (`abril_pre_feria`).
  - **Pendiente medir** (~1 semana): cobertura (noches que salen del suelo), ADR antes/después, conversión (`was_booked`).
  - tsc verde en los ficheros tocados.

- **🎟️ PRICING/EVENTOS: reparado el auto-eventos de Ticketmaster — 22/06/2026 (rama `claude/dynamic-pricing-uhvnak`)**
  Alberto: "Ticketmaster esto hay q reparar y usar". Diagnóstico contra la BD real (`pricing_eventos_auto` **vacía**, 0 filas; índice único `(fuente,nombre,rate_date)` OK; `events_enabled=true` en los 4 pisos; cron `/api/sivra/eventos/sync` vive en `apps/plataforma/vercel.json`, lunes 4am).
  - **Bug de código reparado** (en las 2 copias: `apps/plataforma/app/api/sivra/eventos/sync/route.ts` + `apps/sivra/app/api/eventos/sync/route.ts`): el aforo se sacaba de `accessibility.seatCount`/`venues[].capacity`, campos que la Discovery API **casi nunca devuelve** → aforo caía SIEMPRE a 2000 → factor SIEMPRE 1.15 (una final en La Cartuja/Pizjuán jamás disparaba el pelotazo +60%). Añadido **mapa de aforo por NOMBRE de recinto de Sevilla** (`AFORO_VENUE_SEVILLA` + `aforoEvento()`): La Cartuja/Villamarín 60k, Pizjuán 43k, Plaza de Toros 12k, FIBES/San Pablo 7k, etc. Diagnósticos mejorados (cuerpo del error HTTP — distingue 401 key mala —, contador `sinFecha`).
  - **PENDIENTE DE ALBERTO (la parte "usar"):** la env **`TICKETMASTER_API_KEY` NO está en el proyecto Vercel `plataforma`** (la tabla vacía = rama no-op `configured:false`; el valor es secreto, no copiable por MCP). Copiarla desde el proyecto `ia-rest`. Verificar con `GET https://plataforma-ten-flame.vercel.app/api/sivra/eventos/sync?secret=<CRON_SECRET>` → debe devolver `configured:true` + `upserted>0`.

- **✅ FINANZAS: badges X/Y verificación movimientos + export gestoría mejorado — MERGEADO PR #431 — 22/06/2026**
  Alberto pidió más desglose en `/finanzas` para cruzar ingresos con movimientos del banco. Se implementaron 2 features:
  1. **Badge X/Y verificación por card:** campo `destino_confirmado boolean` en `movimientos_bancarios` (migración aplicada en Supabase). Cada card (Correduría, Pisos, Personal) muestra "X/Y ✓" en verde/ámbar. Botón "✓" por movimiento llama a `POST /api/banca/confirmar` (scoped por `cuenta_id`). UI actualiza sin reload.
  2. **Export CSV gestoría mejorado:** retención calculada POR FILA (`bruto = neto / 0,85`) en vez de solo totales, pisos separados por banco (Kutxa vs BBVA Duplex), gastos personales incluidos (antes faltaban), resumen fiscal con deducciones y resultado a pagar/devolver.
  - Archivos: `lib/finanzas.ts`, `FinanzasClient.tsx`, `app/api/banca/confirmar/route.ts`, `app/api/finanzas/export/route.ts`, `prisma/sql/2026-06-22_mov_destino_confirmado.sql`
  - Vercel: todos los proyectos rebuilding con el nuevo commit en main.

- **🧾 facturas-correo: lectura de PDF RESUELTA por vía B (Apps Script → Drive) — 22/06/2026**
  Tras la pasada del 22/06 (única factura nueva: recordatorio BSH 56,05 € → **Monte Carmelo, personal,
  NO deducible**, etiquetada `Facturas/Procesada`) se cerró el agujero de leer importes dentro de PDF.
  - **Fix de correctitud:** la etiqueta real es `Facturas/Procesada` (femenino), no `Procesado` → corregido en `SKILL.md`.
  - **El conector Gmail gestionado NO baja adjuntos** (solo cuerpo + IDs). Resuelto con **VÍA B (activa)**:
    Apps Script de Alberto **`Facturas a Drive`** (trigger horario) copia los PDF de correos recientes a
    **Drive `FACTURAS Apartamentos / _buzon_pdf`** (fileId **`1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh`**) con
    nombre `YYYY-MM-DD_remitente_archivo.pdf` y etiqueta el hilo `PDF-guardado`. El agente los lee con
    `read_file_content` (probado: BSH, Cabify, Glovo legibles) y cruza por fecha+remitente. Sin token, sin red.
    ⚠️ El script copia CUALQUIER PDF reciente (p. ej. boletines del cole) → el Paso 2 los descarta.
  - **Vía A (cableada pero NO activa):** `/.mcp.json` declara `gmail-adjuntos` (`@gongrzhe/server-gmail-autoauth-mcp`)
    + `scripts/setup-gmail-mcp.sh` + guía `SETUP-adjuntos.md`. La cubre la vía B; usar A solo si se quita el Apps Script.
  - **Dato fiscal visto en PDF:** el recibo de Glovo factura a **Punto y Coma SL (Socorro 24, NIF B90446683)**.
  - Cambios solo de config/docs, sin tocar apps. PR #428 (vía A) mergeado; este PR = activar vía B en la skill + memoria.

- **🚨 CRONS CONGELADOS 5 DÍAS — el middleware de plataforma bloqueaba `/api/sivra/*` — 22/06/2026**
  - **Síntoma:** auditando "que Busto funcione 100%" se vio que el motor de pricing llevaba **parado
    desde el 16-17 jun**: `rate_snapshots`, `pricing_applied`, `incomes` (sync Smoobu), `market_rates`,
    `pricing_alerts`, etc. sin filas frescas. NO era el motor ni la clave Smoobu (la conexión
    `pms_connections` id `c8c1fb07…` está activa con key válida).
  - **Causa raíz:** `apps/plataforma/middleware.ts` gatea TODO tras la cookie `plataforma_session`
    y solo exime `PUBLIC` (incluye `/api/cron` pero **NO** `/api/sivra`). Los crons migrados a
    plataforma (#348) viven bajo `/api/sivra/*` → el cron de Vercel (sin cookie, con `Bearer
    CRON_SECRET`) se **redirige 307 → /login** y el handler nunca corre. Patrón confirmado en BD:
    **todos los `/api/cron/*` vivos, todos los `/api/sivra/*` muertos** (murieron el 16-17 jun = últimas
    corridas en el proyecto sivra antes de retirarlo en #413). Todos los handlers de cron ya aceptan
    el Bearer (`isCronAuthorized` o `secretOk || getSession()`), así que el ÚNICO bloqueo era el middleware.
  - **✅ Fix (esta sesión):** `middleware.ts` deja pasar el gate a las peticiones con `CRON_SECRET`
    válido (Bearer o `?secret=`) ANTES del chequeo de cookie. Cubre todos los crons de cualquier ruta,
    sin exponer los endpoints de datos (el navegador sin secreto sigue gateado). Surte efecto solo en
    **producción de plataforma** (los crons corren sobre el deploy de prod) → tras mergear a `main`.
  - **✅ Heartbeat (esta sesión):** nuevo paso **2-bis** en `/auditoria-diaria` — query de frescura por
    Supabase MCP que marca 🔴 cualquier cron mudo (diarios > 36h) y avisa a Alberto. Agnóstico a la causa
    (cubre middleware, clave, bug, caída Vercel…). Doc en `docs/RUTINAS-PROGRAMADAS.md`.
  - **✅ Verificado en producción (22-jun):** tras mergear #429 y disparar los Run en Vercel,
    `pricing_applied` = **205 filas de hoy** (apply-auto) y `rate_snapshots` = **1.464 de hoy**
    (4 pisos × 366d, **Busto 366**). El fix del middleware queda probado end-to-end (antes esas
    peticiones morían en /login). El hueco de mercado de 5 días es irrecuperable.
  - **⚠️ Lección operativa:** NO dispares los 3 crons de Smoobu a mano **a la vez** — `snapshot`
    dio 0 filas la 1ª vez por **rate-limit de Smoobu** (apply-auto ganó la carrera); relanzado SOLO
    → 200 OK y 1.464 filas. En operación normal van **escalonados** (`updates/sync` 05:00 ·
    `rates/snapshot` 07:00 · `apply-auto` 08:30 UTC), así que no chocan. `updates/sync` solo mueve
    `incomes.createdAt` si entra una reserva nueva → su "0 hoy" no es fallo.
  - **🔭 Observación pendiente (Busto):** lo que se aplica live (~116€) ≈ PriceLabs (~118€) y 373/851 veces
    POR DEBAJO de PL → Busto sigue/infraprecia a PL en vez de ganarle (el motor calculaba ~201€). Revisar
    el gap motor-vs-aplicado y poner `max_price` (hoy `null`) cuando se retome.

- **💸 PRICING / baja de PriceLabs — seguimiento semanal + fix de pipeline — 22/06/2026**
  - **Recalibración del motor (8-jun) funcionó:** ratio `price_ours`/PriceLabs (snapshots reales)
    bajó de 2-3× a Duplex **1.39×**, Luxury Busto **1.61×**, Busto Reform **1.75×**. ⚠️ House Sevillana
    se quedó **corto** (0.61× — PL le pide ~821€ vs 433€ nuestros): revisar aparte.
  - **🐛 Pipeline de experimentos estaba ROTO:** la función `update_experiment_results()` (la llama el
    cron `check-results`) referenciaba `incomes.property_id`/`incomes.total_price` (columnas inexistentes:
    son `"propertyId"` y `amount`/`amount_gross`) → fallaba en cada ejecución, **ningún experimento se
    cerraba**. `incomes` NO está obsoleta (1.964 filas, sync Smoobu vivo hasta 16-jun); la unificación de
    `/finanzas` es el consolidado **fiscal/IRPF** (`lib/finanzas.ts`), cosa distinta de las reservas.
  - **✅ Arreglado (22-jun):** función reescrita sobre `rate_snapshots.was_booked` (señal noche-a-noche,
    capta mitad de estancia). SQL versionado en `apps/sivra/sql/2026-06-22_fix_update_experiment_results.sql`
    + aplicada a mano en Supabase. Backfill hecho: Duplex 14/15-jun → **libre** (estaban a 3-4× PL, no
    entraron), Luxury Busto 17-oct → pendiente.
  - **🔎 Mejora de la revisión (v3):** `revenue_realized` pasa a ser el **ADR bruto REAL** del income que
    cubre la noche (`amount_gross / (checkOut-checkIn)`; OJO: `incomes.nights` viene a 0, hay que calcular
    las noches de las fechas). Así "reservado ≥ PL" es fiable: se verifica si la reserva entró a NUESTRO
    precio (`revenue_realized ~ price_set`) y el margen real vs PL (`revenue_realized` vs `pe.price_pricelabs`).
    ⚠️ Aprendizaje de datos: `rate_snapshots.price_ours` es el precio HIPOTÉTICO del motor (`calcOurs`), NO
    el live; el precio publicado real (lo que controla PriceLabs en Smoobu) es `price_pricelabs`. Validado:
    las reservas recientes entraron a precio PL (~92€ Luxury Busto), no a los 400+ del motor.
  - **🚀 Mejoras "todo" (22-jun) — auto-registro + digest + estudio:**
    - **Hallazgo clave:** solo **`busto_reform` tiene `apply_enabled=true`**; los otros 3 (duplex, luxury,
      house_sevillana) OFF → PriceLabs los controla de facto. `pricing_applied` tiene **851 escrituras live**
      (source `market-anchored`, el cron), **0 del agente manual**. Por eso no había experimentos.
    - **Idea 1 — auto-registro (HECHO):** función `auto_register_experiments()` (SQL en
      `apps/sivra/sql/2026-06-22_auto_register_experiments.sql`) crea un experimento por cada fecha futura con
      escritura live; baseline PL = snapshot MÁS ANTIGUO (resuelve contaminación de `price_pricelabs`, idea 4).
      La llama el cron `check-results` a diario. Backfill: **344 experimentos** (Busto Reform), todos pendientes.
    - **Idea 3 — digest+criterio (HECHO):** endpoint `GET /api/sivra/pricing/experiments/digest` (plataforma)
      + cron semanal (lun 9:00). Por piso: cerrados≥PL, reservados≥PL, ocupación, ADR real vs baseline PL,
      `revenue_extra_vs_pl` y `listo_para_baja` (≥10 cerrados≥PL, ocupación≥50%, ADR≥PL baseline). Criterio explícito.
    - **Idea 2 — House Sevillana (estudio):** motor 542€ vs PL 397€ (120d), ocupación 40%, PL NUNCA superó al
      motor en pasado → históricamente **infrapreciado vía PL**; reserva real de ADR 610€ lo confirma. NO
      enchufar el motor a ciegas: hace falta estudio de mercado dedicado (skill `pricing-agente`) de ese piso.
    - **Pendiente real para cancelar PL:** ya cableado, la evidencia se acumula sola a medida que pasan las 344
      noches de Busto Reform. Para extender la baja a los otros pisos hay que poner `apply_enabled=true`
      (decisión de negocio; en House Sevillana, antes el estudio). El raíl `/api/pricing/*` sigue en `apps/sivra`.
- **📝 ia-rest BLOG SEO: timeout 504 arreglado (modelo rápido 8B) + botón "Generar ahora" + acceso /super restaurado — PR #302 (mergeado 21/06)**
  A raíz del aviso de Telegram "❌ Error generando artículo blog: NIM falló: NVIDIA timeout".
  - **Causa raíz:** `/api/cron/blog-seo` se corta a **~60s** (el plan de Vercel **NO respeta `maxDuration=300`** en el
    proyecto ia-rest, aunque sí en plataforma). Generar ~1800 palabras con `llama-3.3-70b` (no-stream) tarda >60s →
    Vercel mata la función con **504** (devuelve texto plano, no JSON → el front petaba al parsear "Unexpected token 'A'…").
    El primer intento (PR #254: timeout interno 110s + reintento + `maxDuration=300`) **no servía**: la plataforma corta antes.
  - **Fix (PR #302, en producción):** generar con el **modelo rápido `meta/llama-3.1-8b-instruct`** (~30-40s),
    `max_tokens` 3000, timeout interno 45s (salta antes del corte de Vercel → fallo = JSON limpio, no 504). `callAI`
    acepta un 6º arg `model?` (sobrescribe el modelo NIM por llamada) y, si se fuerza `model`, **salta la pasarela
    central** (que usa su modelo por defecto e ignoraría el 8B). Verificado en preview: "va ok". *Tradeoff:* 8B < 70B en
    calidad; el artículo es **borrador** que se revisa. Para recuperar 70B: subir el límite de función en Vercel (plan) o
    job en background.
  - **Botón "⚡ Generar ahora" (PR #283):** el tab Blog de `/super` (`BlogSuperTab` en `app/super/page.tsx`) no tenía
    generación manual (solo el cron de los lunes). Llama a `/api/cron/blog-seo` con `x-ia-session` (sin exponer `CRON_SECRET`).
  - **🚨 Hueco de la migración Fase A2 (credenciales `personal`):** en la BD unificada (`wswbehlcuxqxyinousql`, schema
    `iarest`), `personal` tenía **`email` y `password_hash` en NULL en TODAS las filas** → el login por email de
    `super_admin` daba 401 con cualquier clave. **Restaurada** la fila super_admin (`alberto.suarez.gutierrez@gmail.com`).
    **PENDIENTE (verificar, no urgente):** owner/camarero/cocina/running/jefe_sala/gestor siguen con email/password NULL;
    probablemente entran por **PIN/código** (no por email) → seguramente no roto, pero conviene confirmar antes de migrar.
  - **Datos viejos NO migrados (por diseño, A2 = solo-esquema):** la BD vieja `efncqyvhniaxsirhdxaa` conserva 8
    `blog_borradores` (TODOS `publicado` → **vivos como ficheros** `app/blog/<slug>/page.tsx`, se sirven en iarest.es/blog),
    395 leads y 142 comandas. La unificada arranca vacía → por eso `/super → Blog` dice "No hay artículos". Proyecto viejo a **jubilar**.

- **🧹 Limpieza de PRs draft abiertos (merge masivo) + fix test destino — 21/06/2026**
  Petición de Alberto ("mergea todo y prueba todo"). Se cerraron los 10 PRs draft pendientes de
  otras sesiones a estado terminal: **mergeados** #416 (memoria Groq), #410 (competencia ia-rest +
  VeriFactu 2027), #406/#405/#402/#387 (auditorías), #392 (skill perfil-fiscal), #413 (retirada
  sivra Fase 1). **Cerrada** #302 (blog-seo: su fix ya estaba en main vía `c4db1df`, superada).
  **Retenida #307** (`@central/core-receipts`): NO es "solo spec" como decía — trae el paquete
  nuevo + refactor de `apps/ia-rest/src/lib/courier.ts` (−473 líneas, impresión térmica ESC/POS);
  cambio de código gordo sin revisar → pendiente de decisión de Alberto (no mergeado).
  Conflictos resueltos (CONTEXTO/MATRIZ/skills/generados) preservando lo ya en main.
  **Regresión cazada y corregida:** `destino.test.ts` fallaba 1/7 porque una aserción de #392
  (`LIQ. OP.→seguros`) chocaba con la regla deliberada de hoy (`LIQ. OP.` de BBVA = Booking dúplex).
  Test alineado al comportamiento vigente → 8/8. Suite repo verde (guardián 21, packages, vitest 40).

- **🗑️ RETIRADA DE `apps/sivra` — Fase 1 HECHA (sin riesgo) — 21/06/2026**
  Sivra ya está 100% consolidado en `apps/plataforma` (`/sivra/*`, APIs, crons); la app standalone
  `housesevillana.vercel.app` está **deprecada**. **Fase 1 (esta sesión, rama `claude/dynamic-pricing-uhvnak`):**
  - **Quitada la dependencia de `SIVRA_URL`**: `app/api/sivra/mensajes/reply/route.ts` ya NO hace `fetch` HTTP
    a la app sivra para el aviso de early check-in/out. Se portó la lógica a `lib/limpiadoras-early.ts`
    (`registrarAvisoHuesped`) + nuevo endpoint `app/api/sivra/limpiadoras/early-checkin/route.ts` (POST+PATCH,
    auth `getSession()`); el caller la llama **directa** (sin red, sin 404 si se apaga sivra).
  - **Deduplicado `pricing-calendar`**: borrado `lib/sivra/pricing-calendar.ts` (idéntico a `lib/pricing-calendar.ts`);
    repuntados imports en `pricing/apply`, `pricing/apply-auto`, `pricing/pilot-track` a `@/lib/pricing-calendar`.
  - **Dashboard**: el card de negocio "sivra" enlaza ahora a `/sivra/income` interno (antes `SIVRA_URL`).
  - Marcado deprecado en `apps/sivra/CLAUDE.md` y `MATRIZ.md`.
  - *(Merge previo: se fusionó `claude/plataforma-url` — que traía la consolidación de 81 archivos sivra — en
    `claude/dynamic-pricing-uhvnak`; conflictos solo en docs/generados, resueltos.)*
  - **FASE 2 — GATE RESUELTO + parte destructiva CANCELADA (21/06/2026):**
    - **(B) Limpiadoras reales — confirmado:** Alberto confirma que las limpiadoras las crea la **empresa en
      ialimp**, ahora mismo solo **Sique Brilla**. Verificado contra la BD real (`wswbehlcuxqxyinousql`):
      las **16** limpiadoras (15 activas) son **todas de `Sique Brilla SL`** (empresa de ialimp); las **36
      sesiones/90d** (6 limpiadoras distintas, último 14-jun) son **100% Sique Brilla**, 0 huérfanas/otro
      origen. → El flujo de limpiadoras de sivra no tiene usuarias reales; seguro retirarlo.
    - **Pricing — confirmado:** los crons de pricing/mercado/limpiadoras ya están **todos en
      `apps/plataforma/vercel.json`**; `apps/sivra/vercel.json` tiene `crons: []`. Apagar sivra NO tumba el pricing
      automático. **PERO** el raíl del **agente de pricing** (`/api/pricing/aplicar-propuesta` + `/api/pricing/pisos-zona`)
      **sigue SOLO en sivra** (no portado a plataforma) → razón adicional para no apagar sivra.
    - **🚫 PERO la parte destructiva NO se hace (decisión de Alberto: "eso no tocar"):** `apps/sivra` también
      es la **web PÚBLICA de reserva directa de House Sevillana** (`housesevillana.es`: landing multidioma
      `app/[locale]`, SEO `sitemap.ts`/`robots.ts`/schema). Esa parte **NO está en plataforma** y **se queda
      viva**. Por tanto: **NO redirigir el dominio, NO borrar `apps/sivra`, NO borrar el proyecto Vercel
      `sivra` ni la env `SIVRA_URL`.** Una sesión futura NO debe ejecutar el viejo plan de "borrar y redirigir".
    - **Lo que sí queda hecho:** Fase 1 (quitar dep `SIVRA_URL` en runtime, dedup pricing-calendar, dashboard
      interno) + esta nota de gate. Sivra queda como **app pública de reservas únicamente**; la gestión interna
      vive en plataforma.
- **🧾 GROUND TRUTH FISCAL de Alberto persistido — 19/06/2026** (rama `claude/tax-deductions-personal-finance-e098a7`)
  - Sesión de revisión de la **Renta 2025** (borradores AEAT, libro de familia, Excel gastos/reservas,
    PDFs IBKR y seguro, hilos con la asesoría Asecon). Salieron hechos que el repo tenía mal/ausentes
    y se han persistido en **4 sitios** (datos sensibles SOLO en BD; en git solo estructura).
  - **Hechos clave aclarados:**
    - **Cónyuge = Pilar Piña Franco** (el repo asumía "Carmen"). **3 hijos** → **familia numerosa general**.
    - **Villasís = el Dúplex = Duplex Center** = Pasaje Villasís 1 / Pasaje Francisco Molina 4 (**mismo
      piso**, dos accesos). Tributa en **IRPF personal**.
    - **Socorro** (House Sevillana) → **IRPF personal 50/50** Alberto+Pilar, **aunque** cobre en cuenta
      de **Punto y Coma SL** (sin contrato de cesión → riesgo de paralela; recurrente desde 2024).
    - **Asesoría = Asecon Consultores** (renta personal + sociedad). **Interactive Brokers**: ganancias
      no salen en el borrador → declarar + **revisar Modelo 720**.
    - Reglas de gasto: trading/FTMO = personal; notaría/registro de compraventa = adquisición;
      mobiliario/obras = amortizar; los ~19,5 € del Ayto = tasa de basura (NO IBI).
  - **Cambios (git):** nueva skill **`.claude/skills/perfil-fiscal/`** (+ índice en `docs/SKILLS.md`);
    `facturas-correo/SKILL.md` y `apps/sivra/docs/contabilidad.md` corregidos (alias Villasís, cónyuge,
    regla Socorro-personal); `apps/plataforma/lib/destino.ts` reconoce "Villasís/Francisco Molina" como
    dúplex; caveat del **prorrateo de maternidad** documentado en `lib/fiscal-deducciones.ts`.
  - **Cambios (BD, NO git):** `fiscal_perfil` de Alberto → `gasto_guarderia_anual` real (escuela infantil
    autorizada) y `fiscal_descendientes` con las **fechas reales** de nacimiento (años 2018/2024/2025) en
    vez de placeholders. (Fechas exactas e importes viven solo en la BD, no aquí.)
  - **Pendiente:** confirmar si Busto Reform/Luxury Busto van por Punto y Coma SL; decisión individual vs
    conjunta (la herramienta tiene `declaracion_conjunta=true`); (opcional) prorrateo mensual de maternidad
    en el motor. La asesoría tiene aún pendiente meter familia numerosa, hijo nov-2025, guardería e IBKR.
- **🗂️ CONTROL DE FACTURAS + FIX BANCA CORREDURÍA — 18/06/2026** (PR #384 + PR #385 mergeados a `main`)
  - **PR #384** — `fix(plataforma/banca)`: los ingresos de la correduría no cuadraban (~€10.026 ocultos en P&L). Causa: en abonos Norma 43, el banco rotula la contraparte con el TITULAR → la regla 'titular ⇒ traspaso_interno' escondía comisiones. Fix: lógica pura extraída a `lib/destino.ts` (nuevo, testeable `node --test`, 7 casos reales del extracto). ABONOS se clasifican por CONCEPTO (`LIQ.COMISIONES`/aseguradoras ⇒ `seguros`; pensión/nómina/Bizum ⇒ `personal`). CARGOS sin cambios (el titular sí marca traspaso en salidas). `lib/categorizar.ts` reexporta. SQL de reclasificación aplicado a BD compartida (`prisma/migrations/2026-06-16_reclasificar_abonos_correduria.sql`).
  - **PR #385** — `feat(plataforma)`: panel `/sivra/facturas-control` (entrada 🗂️ Facturas en sidebar, sección Mis pisos). Estado por proveedor/mes: ✅ En Drive / ⏳ En plazo / ❌ Falta. 17 proveedores recurrentes (mensual/bimestral_impar/anual_marzo) en `lib/sivra/facturas-control.ts`. API `GET/POST /api/sivra/facturas-control` (sube PDF → Apps Script → Drive → tabla `facturas_drive`). Alerta `facturasFaltantes` del mes anterior en `getAlertas(lib/banca.ts)` → banner en `/dashboard`.
- **🛡️ CORREDURÍA — Reconciliación Modelo 190 IRPF 2025 + gestión cobros pendientes — 21/06/2026**
  - **Análisis Modelo 190 vs BD completo:** Modelo 190 bruto €8.593,76 → neto esperado €7.305. BD tras correcciones: €6.176,53. Gap ~€1.128 = timing (dic-2025 cobrado ene-2026).
  - **Compañías identificadas definitivamente:**
    - Occident: `Saldo. m00171` + `Saldo. 8/92361` ✅
    - Mapfre: `Liq.comisiones YYYYMM` ✅
    - Caser: `fra-comis` ✅
    - Generali: `G.65792 liq.XXX generali se` + `Pago saldo cta` ✅
    - Pelayo: `COMISIONES [nombre] [7 dígitos]` ✅
    - ASISA: **M1454** (~€46/mes) ✅ confirmado por Alberto
    - Aegon: `REMSALDO` ✅
    - AXA: `Liq. saldo cuenta` ✅ (importe pequeño, ~€41 neto)
    - Reale: `Liquidacion de comisiones` ✅
    - Fidelidade: probable `Pd005 saldo agente` (pendiente confirmar)
  - **Compañías con dinero retenido sin pagar:**
    - **Allianz (mediador 18638/PA342520):** saldo **€521,53** a abr-2026. Extractos en Gmail desde mediador@allianz.es asunto "Cuenta Agente".
    - **Helvetia:** trámite cambio cuenta iniciado mar-2025 (Nieves Calvo → Cac.corredores@helvetia.es + Elena Pérez) nunca completado.
    - **AXA (mediador 634471):** sin comercial asignado, importe pendiente desconocido.
  - **3 borradores Gmail creados** (Allianz/Helvetia/AXA) con IBAN ES34 0182 9465 6002 0233 1175 y enlace Drive.
  - **⚠️ Certificado BBVA:** el PDF guardado en Drive era un justificante Bizum (equivocado). Pedir certificado de titularidad real desde app BBVA (Mis productos → cuenta → Documentos → Certificado de titularidad) y adjuntar manualmente a los 3 borradores.
  - **Google Apps Script** creado para salvar adjuntos Gmail→Drive (script.google.com, función `guardarCertificadoBBVAenDrive`).
  - **Pendiente Alberto:** obtener certificado titularidad BBVA real → adjuntar a los 3 borradores → enviar.

- **🕵️ ia-rest: inteligencia competitiva (comandiavoz.com) — 21/06/2026**
  - **Disparador:** Alberto pasó un anuncio de Meta/Instagram (`fbclid`) de **comandiavoz.com**
    (parece comanda-por-voz para hostelería = competidor directo de ia.rest) y pidió estudiar competencia.
  - **Bloqueo del entorno:** egress de red cortado en la sesión web (`WebFetch` → 403 "Host not in
    allowlist" para TODOS los hosts; `WebSearch` US-only no indexa el dominio). **No se pudo leer
    comandiavoz.com** → su perfil queda pendiente (ver checklist §11 del doc).
  - **Hecho:** `apps/ia-rest/docs/competencia.md` — mapa del mercado VERIFICADO (Veovox, Storyous,
    Qamarero, SmartBar; precios TPV ES: Glop/Ágora/Revo/Last.app/Tipsi/Cuiner; dolores cuantificados),
    battlecard ia.rest y checklist para cerrar el perfil de comandiavoz. Rama `claude/competitor-research-rca1fz`.
  - **🚨 VeriFactu APLAZADO a 2027 — CORREGIDO:** el RD-ley 15/2025 (BOE 3-dic-2025) prorrogó un año
    (sociedades 1-ene-**2027**, resto 1-jul-**2027**). Corregido en este PR: maestro/skill (`SKILL.md`
    §VeriFactu) **y** código `apps/ia-rest/src/lib/verifactu.ts` (`VERIFACTU_STATUS`, solo info en API,
    no gatea lógica). **Pendiente Alberto:** confirmar en sede oficial AEAT antes de uso legal/comercial.
  - **Para cerrar:** habilitar egress (o pegar el contenido de comandiavoz.com) y rellenar §2/§7/§11 del doc.
- **📝 Doc drift corregido — crons de sivra — 21/06/2026**
  El `CLAUDE.md` de sivra y el skill `sivra-maestro` decían "10 crons en vercel.json", pero es
  **obsoleto**: el `vercel.json` de sivra solo tiene **1 cron** (`/api/seo-refresh` semanal, #419).
  Los ~18 crons de negocio (pricing/apply-auto, mercado, limpiadoras, expenses, eventos, mensajes,
  updates…) se **migraron a plataforma** (#348/#288) y viven en `apps/plataforma/vercel.json` como
  `/api/sivra/*` (plataforma tiene 25 crons en total). Corregidos ambos docs; **no re-programar esos
  crons en sivra** o correrían por duplicado. (Solo documentación, sin cambio de código.)

- **🔎 Agente SEO de housesevillana.es (sivra) — Bloque A (paridad con ia-rest sin Google) — 21/06/2026**
  Spec/plan en `docs/superpowers/{specs,plans}/2026-06-21-agente-seo-housesevillana-bloqueA*`.
  - **Contexto:** housesevillana.es es una **landing estática de un fichero** (`app/route.ts` en repo
    aparte `house-sevillana-landing`), editada por la GitHub API desde `apps/sivra/app/api/seo-refresh`.
    No aplica el modelo "cambios como datos en BD" de ia-rest; la paridad = **seguridad + revert + schema**.
  - **Hecho (Bloque A):** helpers extraídos a `lib/seo-landing.ts` (DRY, compartidos con revert);
    **kill switch** `SEO_AGENT_ENABLED` (solo gatea el cron; el botón manual con sesión funciona siempre);
    **snapshot+revert** (nueva columna `seo_proposals.currentOgDescription` + endpoint `/api/seo-revert`
    que re-commitea title/desc/OG anteriores + botón "Revertir" en `/seo` + estado texto `REVERTED`);
    **JSON-LD conservador** (solo reemplaza si ya existe bloque `ld+json` en la landing; si no, lo guarda
    en `schemaDescription` y sigue). El análisis ya iba por `aiSearch` (pasarela/Gemini, fallback NIM).
  - **Migración aplicada** a Supabase `wswbehlcuxqxyinousql` (`seo_proposals_revert`, aditiva): solo
    `add column currentOgDescription text`. OJO: `seo_proposals.status` es **text** en la BD (NO hay enum
    `SeoStatus` real) → `REVERTED` es solo a nivel Prisma/app; no se alteró ningún tipo.
  - **Verificado:** lógica pura de `applySeoReplacements` (7 checks, vía node) ✅, `next build` sivra ✅.
  - **⚠️ PENDIENTE de despliegue:** `GITHUB_TOKEN` en el Vercel de sivra (acceso a `house-sevillana-landing`)
    y `SEO_AGENT_ENABLED=true` para activar el cron. Sin ellos: error claro / cron inactivo.
  - **Bloque B pendiente:** conectar **GSC+GA4** de housesevillana.es (datos reales) — requiere OAuth de
    Alberto; mismo trabajo que la **Fase 0 de ialimp** (compartir fontanería GSC/GA4).
- **💶 FINANZAS — Reconciliación BBVA 2025 con Modelo 190 IRPF + correcciones masivas BD — 21/06/2026**
  - **Importación completa:** Kutxabank XLS (581 filas) + BBVA XLSX (379 filas) Jan 2025–Jun 2026 en `movimientos_bancarios`. Total BD: Kutxa 733, BBVA 458, Tarjeta 434, N26 1 → 1.626 filas. Autocategorización SQL de 848 filas NULL.
  - **Dúplex BBVA 2026 corregido a €12.195,38:** filas XLS duplicadas de PSD2 marcadas `ignorado`; 8 "Transferencia recibida" Jan-Mar 2026 (antes de cobertura PSD2) reclasificadas a `turistico_duplex`.
  - **Correcciones BBVA 2025 — "Transferencia recibida" = Booking dúplex:** Alberto confirmó que TODAS las "Transferencia recibida" en BBVA son pagos de Booking (dúplex). Reclasificadas 57 filas → `turistico_duplex` (€19.188). Dúplex BBVA 2025 recuperado.
  - **Otras correcciones BBVA 2025:** Traspaso €6.000 + Cuenta cancelada €1.014,72 → `traspaso_interno`; Deuda €600 + Abono devolución €47,90 → `personal`; ANULACION RECIBO OCCIDENT (Kutxa) €627,01 → `personal` (devolución prima, no comisión).
  - **Seguros BBVA 2025 limpio:** €6.176,53 neto (bruto estimado €7.267 ÷ 0,85). Modelo 190 bruto: €8.593,76 → neto €7.305. Gap ~€1.128 = timing (comisiones dic-2025 cobradas en ene-2026 que el pagador ya declaró en 2025).
  - **`porCompania` mejorado (`finanzas.ts` líneas 441-475):** añadidos patrones Plataforma m00171, 8/92361, Liq.comisiones, Fra-comis, Comisiones mensuales, Pd005, Remsaldo, M1454, Liq. saldo cuenta, Pago saldo cta, Liquidación comisiones. Ya no todo va a "Otras comisiones".
  - **Matches exactos Modelo 190 vs BD:** AXA €41,80 neto (Liq. saldo cuenta) ✓ | Reale €47,66 neto (Liquidacion comisiones) ✓ | Generali pequeño €32,24 (Pago saldo cta) ✓.
  - **Pendiente:** Identificar a qué compañías corresponden los códigos de plataforma (m00171, liq.comisiones, M1454, etc.) para el desglose completo del Modelo 190. Necesita que Alberto lo confirme con su gestoría o extracto detallado de la plataforma.

- **🧹 CONCURSOS (plataforma) — auto-saneo de provincia en la ingesta + skills actualizadas — 21/06/2026**
  - **Bug visto:** buscar Sevilla daba 0 aunque había 3 (Autoridad Portuaria/EMASESA): eran filas de una
    ingesta vieja, ya fuera del feed, con `provincia=NULL` → el filtro estricto las ocultaba. Backfill manual aplicado.
  - **Arreglo permanente:** la ingesta (`lib/concursos-ingesta.ts`) ahora **auto-sanea** en cada pasada:
    rellena la provincia de las EN PLAZO sin ubicación deduciéndola del órgano (`provinciaDeTexto`); y el
    `ON CONFLICT` usa `COALESCE(EXCLUDED.provincia, …)` para no pisar una provincia ya conocida con NULL.
  - **Skills sincronizadas:** `ialimp-maestro` (concursos YA NO viven en ialimp), `central-maestro` (concursos→plataforma),
    `plataforma-maestro` (nueva entrada de concursos en "Dónde vive cada cosa").
  - **Diferencia Buscar vs Actualizar:** Buscar = filtra el corpus ya guardado (instantáneo); Actualizar = descarga
    lo último de PLACSP (solo trae datos en Vercel; 403 fuera).

- **🎯 CONCURSOS (plataforma) — filtro por zona ESTRICTO, probado en vivo — 21/06/2026**
  - Tras poblar provincia por código postal del órgano (#418), el filtro de zona pasa a **estricto**: al elegir
    zona se muestran SOLO las ubicadas en ella. Verificado en la BD: **Andalucía → 6 resultados, todos andaluces,
    0 de Canarias** (antes se colaban por la inclusión de NULL).
  - **Límite de la fuente:** el feed PLACSP solo trae ubicación en ~56% de los anuncios; el ~44% restante queda
    sin provincia y aparece solo en "Toda España" (no se cuela en otras zonas). Backfill de normalización aplicado
    en la BD (`provincia` = provincia oficial o NULL; se limpiaron municipios crudos de la versión anterior).

- **🎯 CONCURSOS (plataforma) — filtro por ZONA fiable vía CÓDIGO POSTAL + desplegable de provincia — 21/06/2026**
  - **Problema:** al elegir zona (Andalucía) salían licitaciones de otra región (Canarias) porque la
    provincia estaba vacía en el corpus y el filtro incluía las de ubicación desconocida (recall sobre precisión).
    Deducir la provincia del NOMBRE del órgano solo cubría ~30%.
  - **Solución de raíz:** la provincia se deduce del **código postal del órgano** (PostalZone del feed) →
    `provinciaDeCP` (mapa oficial 52 prov., 04=Almería…41=Sevilla…35=Las Palmas). Extracción **recursiva**
    (`buscarValor`) para no depender de la ruta exacta del XML (PLACSP da 403 fuera de Vercel, no se pudo inspeccionar).
    Precedencia: CP → CountrySubentity → CityName → nombre del órgano.
  - **UI:** el campo "Provincia" pasa de texto libre a **desplegable** dependiente de la zona (`provinciasDeComunidad`).
  - **Pendiente de dato:** se rellena al **reingerir** (cron 6 h o botón "Actualizar ahora"); el corpus viejo
    queda null hasta entonces. El filtro sigue incluyendo las de ubicación aún desconocida (residuo pequeño).

- **🍽️ ia-rest PREAVISO de marcha — Fase 1 MERGEADA + voz + Fase 2 auto en marcha — 21/06/2026**
  - **Fase 1 (PR #408, MERGEADO en main):** botón 📣 en `/kds` → push + banner Realtime en `/edge`
    → camarero confirma "mesa lista" → cocina lo ve. Tabla `preavisos` (schema iarest), gate
    `restaurantes.preaviso_activo` (off por defecto, toggle en `/owner`). Migración aplicada en prod.
  - **Voz en los cascos (Capa 1-2, en #408):** `/edge` lee el preaviso en voz alta (reutiliza
    `speak()` VOX+WebSpeech) + vibración si la pantalla está visible y `!ttsOff`. Bloqueado en
    navegador = solo tono del push (iOS imposible). Spec: `2026-06-21-preaviso-voz-cascos-design.md`.
  - **Fase 2a — DISPARO AUTOMÁTICO (nuevo, rama `claude/plate-change-server-alert-n8prlu`):**
    modelo v1 = umbral fijo por restaurante `restaurantes.preaviso_auto_min` (0=solo manual,
    configurable en `/owner`). Cron `/api/cron/preavisos-auto` (cada 2 min) dispara el preaviso solo
    para comandas en cocina que superan el umbral y no tienen preaviso (`emitido_por='auto'`). Lógica
    crear+push extraída a `lib/preaviso-server.ts` (compartida con el POST manual). Migración
    `preaviso_auto_min` APLICADA en prod. **Build verde.** Los preavisos manuales registran
    `emitido_at` vs comanda `created_at` → base para aprender antelación por plato en el futuro.
  - **Fase 2b — VOZ NATIVA bloqueado (APK Android, PENDIENTE construir):** spec
    `2026-06-21-preaviso-voz-nativa-apk-design.md`. SÍ hay proyecto Android editable en
    `apps/ia-rest/android/` (Kotlin, WebView + `BridgeService` foreground con Realtime Supabase, sin
    FCM). Plan: extender `BridgeService` para escuchar `preavisos` por Realtime y hablar con el TTS
    nativo de Android con la pantalla apagada. Caveat: compilar/firmar/publicar la APK (keystore) es
    paso manual de Alberto; Claude escribe el Kotlin.
  - **Docs de usuario (#414):** actualizada la ayuda en app (`help-prompts.ts`, roles camarero/cocina/owner)
    y `public/manual.html` (subsección Preaviso) con la voz + el disparo automático. Los PDF de
    `public/manuals/*` son binarios → pendientes de regenerar por Alberto (texto listo).
  - **Auto-mantenimiento de manuales:** ampliado `/auditoria-diaria` (paso 4) para que el agente nocturno
    también reconcilie los manuales de usuario (help-prompts.ts + manual.html) cuando haya features nuevas,
    y deje los PDF como acción manual. Antes solo cubría memoria/skills/CLAUDE.md/SKILLS.md.
  - **Fase 2b — VOZ NATIVA bloqueado: CÓDIGO ESCRITO (no compilado) en #414.** Nuevo
    `android/.../PreavisoVozService.kt` (foreground `specialUse` + Supabase Realtime sobre
    `preavisos` + TTS `es-ES`, habla solo si la app NO está visible → no duplica la voz web).
    `BridgeInterface.setPreavisoSesion(...)`, `MainActivity` set `appVisible` en onResume/onPause,
    manifest con permiso `FOREGROUND_SERVICE_SPECIAL_USE`. La WebView pasa las credenciales
    Supabase ACTUALES (no hardcode). **Pendiente: build+firma+publicar APK (v13/v3.1) por Alberto.**
  - **✅ HALLAZGO (pre-existente) ARREGLADO:** `BridgeService.kt` tenía hardcodeado el proyecto
    Supabase viejo `efncqyvhniaxsirhdxaa` (sin schema `iarest` ya) para el Realtime de impresión.
    La app vive en `wswbehlcuxqxyinousql` (BD unificada, schema `iarest`). Arreglado: la WebView
    inyecta URL/anon/schema actuales vía `IaRestBridge.setSupabase` (desde `AppBadge`, todas las
    páginas privadas); sin creds → omite Realtime y sigue por polling (sin regresión). Llega en APK v3.1.
  - **📋 Acciones de Alberto:** `docs/ACCIONES-ALBERTO-preaviso.md` (merge #414, activar toggle,
    build+firma+release APK v3.1, regenerar 3 PDF). BD y web ya hechos/automáticos.
  - **Texto PDF manuales:** `docs/manuals-texto-preaviso.md` (camarero/cocina/owner) listo para
    pegar al regenerar los PDF (binarios, no los toca Claude).
  - **⚠️ Aclaración BD:** ia.rest en PROD usa `wswbehlcuxqxyinousql` (schema `iarest`), NO el
    proyecto `efncqyvhniaxsirhdxaa` (ese es el viejo standalone, ya sin tablas iarest).
  - **⚠️ Correción de nota previa:** el código de ia.rest SÍ vive en `central` (`apps/ia-rest`), buildea
    en Vercel y se mergeó por #408. La nota antigua de "repo aparte" está desactualizada.

- **🤖 IA: fallback de TEXTO restaurado con Groq (mismo Llama 3.3 70B, gratis) — 21/06/2026**
  - **Contexto:** Alberto preguntó si los modelos gratis de moda (Llama 3, Groq, Mistral, Cohere, HF…)
    valdrían para el proyecto. Auditoría: **casi todo ya integrado y gratis** — texto/visión = Llama 3.3
    70B + 3.2 11B Vision por **NVIDIA NIM**, voz = **Groq Whisper**, búsqueda web = **Gemini Flash**.
    El hueco real NO era falta de modelos sino **falta de redundancia**: tras retirar Anthropic (sin saldo,
    17/06), NIM quedó como **punto único de fallo** del texto (`callAI` lanzaba error si NIM caía).
  - **Hecho:** adaptador puro `groqText`/`groqChat`/`groqChatTools` en `@central/core-ai`
    (`packages/core-ai/src/groq.ts`, espejo de `nim.ts`, endpoint OpenAI-compat de Groq, default
    `llama-3.3-70b-versatile`). Cableado fallback automático **NIM → Groq** en `apps/ia-rest/src/lib/ai-client.ts`
    (`callAI` y `callAITools`). Reutiliza `GROQ_API_KEY` (ya existía para Whisper); override opcional
    `GROQ_BRAIN_MODEL`. Visión sigue NIM-only (Groq no tiene vision model gratis equivalente). `noFallback`
    pasa a ser legacy (ya no bloquea el fallback gratis). Doc en `docs/IA-busqueda-web-y-proveedores.md`.
  - **✅ MERGEADO (PR #415, squash en `main`):** 11/11 checks verdes (typecheck de las 4 verticales,
    tests, build, los 5 previews de Vercel Ready). Incluyó también un fix de CI ajeno: shim de tipos
    `apps/plataforma/types/pdf-parse.d.ts` (deuda preexistente de `lib/concursos.ts`, #403).
  - **Reconciliadas skills/docs** (que describían "NIM → Anthropic/Haiku fallback", ya obsoleto):
    `.claude/skills/ia-rest-maestro/SKILL.md` (STACK IA), `packages/core-ai/README.md` (exports `groq*`
    + scope `@central`), `docs/SKILL-proyecto-claude.md`, `docs/HANDOFF-unificacion-casa-marcas.md`, y
    specs/planes forward-looking (maître-ia, consolidación/duplicados bancarios). Todos → "NIM → Groq, gratis".
  - **Propagado a sivra/ialimp/plataforma (misma PR #415):** el fallback NIM → Groq se metió en el
    **wrapper compartido** `aiComplete`/`aiTools` de `packages/core-ai/src/client.ts`. Como las rutas-servidor
    de la **pasarela** (`apps/plataforma/app/api/ai/{chat,tools}/route.ts`) llaman a esos wrappers, UNA edición
    cubre a la vez (a) el camino directo de las 3 verticales y (b) el tráfico por pasarela. En el chat de
    pasarela queda **NIM → Groq → Gemini** (Gemini ya existía). Visión NIM-only. Verificado: tsc 0 errores en
    plataforma/ia-rest/sivra (sivra tras `prisma generate`).
    - ✅ **`GROQ_API_KEY` puesta en el Vercel de plataforma** (Production+Preview) y redeploy de prod
      **READY** → el fallback **NIM → Groq → Gemini queda ACTIVO en producción** (host de la pasarela,
      por donde va casi todo el tráfico de sivra/ialimp/plataforma). ia-rest ya la tenía (Whisper).
      Override `GROQ_BRAIN_MODEL`. **Opcional pendiente:** la misma key en **sivra** e **ialimp** solo si
      se quiere cubrir su camino directo SIN pasarela (por pasarela ya están cubiertas).
    - Recordatorio de arquitectura: la IA vive en el núcleo compartido `@central/core-ai` (añadir un
      proveedor nuevo = un solo sitio, lo heredan todos los módulos), pero las **claves son por vertical**
      (cada proyecto Vercel inyecta las suyas) — por eso `GROQ_API_KEY` se configura por proyecto.
  - **Pendiente (futuro):** **Cohere Rerank/Embed** para mejorar RAG (buscador de
    comparables en sivra `app/api/mercado/*` y concursos LCSP en plataforma) — ese es el hueco de
    CALIDAD real. Mistral solo si se quiere diversidad de modelo; Ollama solo si self-host.

- **🌐 URLs de producción (no perder) — 16/06/2026**
  - **plataforma** (web principal: dashboard + chat 🤖 Agente IA en `/agente`): **`https://plataforma-ten-flame.vercel.app`** (login `/login`).
  - **sivra** (motor de pricing dinámico + endpoints `/api/pricing/*`, `/api/mercado/*`, etc.): `housesevillana.vercel.app` (la pantalla de login es la verde "SIVRA").
  - Son **apps distintas** (no confundir): el chat del agente está en *plataforma*; aplicar precios a Smoobu se hace por el endpoint de *sivra* (logueado o por el cron con `CRON_SECRET`).

- **🍽️ idea ia-rest: PREAVISO de marcha cocina⇄sala — SPEC escrito — 21/06/2026**
  - **Idea de Alberto:** avisar al camarero con tiempo de un cambio de plato (sale carne caliente →
    desbarasar y montar el cubierto/plato ANTES de que salga, para que no se enfríe esperando).
  - **Diseño (brainstorming, todo delegado a mi criterio):** Fase 1 botón manual "📣 Preaviso" en `/kds`
    (cocina manda) → push al camarero de la mesa (infra `qr-call-waiter`) → aviso nombra los platos
    (info ya en la comanda, cero config) → camarero confirma "mesa lista" en `/edge` (dos direcciones)
    → cocina lo ve por Realtime `kds-{id}` y emplata. Tabla nueva `preavisos` (schema `iarest`).
    Fase 2 (futuro): automático por tiempos aprendidos (el botón manual genera esos datos) + menaje por producto.
  - **Hecho:** spec en `docs/superpowers/specs/2026-06-21-preaviso-marcha-cocina-sala-design.md`
    (commit en rama `claude/plate-change-server-alert-n8prlu`). **Pendiente revisión de Alberto** antes
    de sacar el plan (`writing-plans`).
  - **⚠️ Ojo al implementar:** el código de ia.rest vive en su PROPIO repo (`albertosuarezgutierrez-gif/ia.rest`),
    no en `central`. Esta sesión solo tiene scope sobre `central` (ahí está el spec). Para construirlo hay que
    abrir/añadir el repo de ia.rest.

- **🐛 CONCURSOS (plataforma) — buscador daba 0 al filtrar por zona — 20/06/2026**
  - **Causa:** el feed PLACSP a menudo NO trae `provincia` (0/57 de las en-plazo la tenían), pero el
    buscador filtraba en duro `provincia ILIKE …` → cualquier CCAA/provincia seleccionada = 0 resultados.
    (El corpus SÍ tiene datos: 201 filas, 57 en plazo, con CPV y FTS OK.)
  - **Fix 1 (inmediato):** `api/concursos/radar/buscar` incluye también las de ubicación desconocida
    (`provincia IS NULL OR ''`) al filtrar por zona → deja de dar 0.
  - **Fix 2 (a futuro):** el parser `lib/concursos-radar.ts` saca la provincia como fallback de la
    dirección del órgano de contratación (`LocatedContractingParty.Party.PostalAddress`), no solo de
    `RealizedLocation` (que el feed omite). Se rellena al re-ingerir (cron cada 6 h, UPSERT por dedupe_key).

- **🔀 AGENTE DE CONCURSOS — PORTADO de ialimp → PLATAFORMA (y borrado de ialimp) — 19/06/2026**
  - **Por qué:** las licitaciones son **transversales a los negocios de la cuenta** (fontanería, catering JJ,
    limpieza…), no de la vertical de limpiezas. Decisión de Alberto: el agente va en **plataforma**, no en ialimp.
  - **Plataforma (nuevo):** sección de usuario **🏛️ Concursos** (`/concursos`, sidebar *Mi negocio* + command palette).
    Scope = **CUENTA** (`requireEmpresaId()` shim → `requireSession().id` = `cuenta_id`; las tablas guardan ese id en
    su columna `empresa_id`). Corpus `concursos_licitaciones` GLOBAL. Consume `@central/module-concursos`.
  - **Shims clave en plataforma** (para reusar el código de ialimp sin reescribir): `lib/prisma.ts` (→`lib/db`),
    `lib/tenant.ts` (`requireEmpresaId`), `lib/mailer.ts` (`getTransporter`/`MAIL_FROM` sobre `@central/core-email`),
    y `aiComplete()` añadido a `lib/ai-client.ts` (NVIDIA `nimChat`). Crons de email hacen `JOIN cuentas` (no `empresas`).
    OCR NO portado (deps pdfjs/canvas). 4 crons en `vercel.json` (ingesta/radar/avisos/cierre).
  - **ialimp (borrado):** eliminadas páginas `/admin/concursos`, rutas `api/admin/concursos`, 4 crons, libs
    `concursos*.ts`, y entradas de menú (`DashboardClient` NAV/NAV_MODULO). Las **tablas se quedan** (las usa plataforma).
  - **Verificado:** build de plataforma ✓ y de ialimp ✓ (tras el borrado). Sin migraciones nuevas (reusa tablas).
  - **PENDIENTE para que los emails salgan:** poner `SMTP_*`/`RESEND_API_KEY` en el proyecto Vercel **plataforma**
    (hoy viven en ialimp). `NVIDIA_API_KEY`/`CRON_SECRET` ya están en plataforma.

- **🟢 AGENTE DE CONCURSOS (ialimp) — FASE 3+4: del hallazgo a la oferta + usabilidad — 19/06/2026** (PR #400 mergeado a `main`)
  - **H "Preparar candidatura 1 clic":** botón en cada resultado del buscador → `POST /api/admin/concursos/preparar`
    crea un `concursos` con **ficha mínima** desde el anuncio (sin pliego) y lo abre en el workspace (evento DOM
    `concurso-preparado` → `FichaView`). El sobre administrativo (DEUC+declaración) ya funciona con perfil+biblioteca;
    para Go/No-Go, criterios, memoria y oferta hay que subir el pliego.
  - **D "¿Me conviene?":** (1) **resumen IA** por anuncio (`POST radar/resumen`, `aiRunner`, cacheado en
    `concursos_licitaciones.resumen_ia` — migración `2026-06-19_concursos_licitaciones_resumen.sql`, aplicada); (2)
    **semáforo de encaje DETERMINISTA** (módulo puro `encajeConcurso(anuncio, criterios)` vs criterios del radar →
    🟢/🟡, sin IA). 96 tests del módulo en verde (+6 de encaje).
  - **K "Búsqueda en lenguaje natural":** caja "✨ Describe lo que buscas" → `POST radar/interpretar` (la IA traduce a
    `{cpv, ccaa, provincia, presupuesto, q}`) → rellena los filtros y busca; degrada a búsqueda por texto si la IA falla.
  - **Nota:** "🏛️ Concursos" YA está en el menú lateral del panel (`DashboardClient.tsx` NAV, sin gating por rol).
    El agente está COMPLETO salvo extra opcional (BOE como fuente adicional + unificar el radar sobre el corpus).

- **🟢 AGENTE DE CONCURSOS (ialimp) — FASE 2: proactivo (seguimiento + avisos) — 19/06/2026** (PR #398 mergeado a `main`)
  - **El agente pasa de *pull* (buscar) a proactivo (te trae y te avisa).** Tres piezas:
  - **G "Mis concursos" (seguimiento):** tabla `concursos_seguidos` (scope `empresa_id`, `dedupe_key`,
    `licitacion` jsonb = snapshot, `estado` interesado→adjudicado/perdido, `notas`, `fin_presentacion`,
    `recordatorio_cierre_at`). API `app/api/admin/concursos/seguidos` (GET/POST/PATCH/DELETE por `dedupe_key`).
    UI: botón "📌 Seguir" en el buscador + panel "📌 Mis concursos" (sincronizados por evento DOM
    `concursos-seguidos-changed`). El buscador devuelve `dedupe_key`.
  - **C "Recordatorio de cierre":** cron `/api/cron/concursos-cierre` (diario 9:00) → email a `empresas.email`
    de los seguidos (interesado/preparando) que cierran en ≤3 días, idempotente vía `recordatorio_cierre_at`.
  - **B "Avisos de nuevos":** cron `/api/cron/concursos-avisos` (diario 7:30) → digest por email de los matches
    del radar (`concursos_radar_anuncios`) aparecidos en 48 h y no enviados, empresas con `radar_activo`.
    Idempotente vía columna nueva `avisado_email_at`; >2 días sin enviar se marcan sin email (sin backfill-blast).
  - **Sin push** (las suscripciones son de limpiadoras) → todo por email (`lib/mailer.ts`), patrón cron-impagos.
  - **Migraciones aplicadas a mano en Supabase:** `2026-06-19_concursos_seguidos.sql`, `2026-06-19_radar_anuncios_avisado.sql`.
  - **OJO crons en `vercel.json`:** `concursos-cierre` (0 9 * * *) y `concursos-avisos` (30 7 * * *), auth Bearer `CRON_SECRET`.
  - **Pendiente Fase 3:** H "preparar candidatura 1 clic" (wire al análisis F1-F6) + D resumen IA "¿me conviene?"; luego K lenguaje natural; BOE como fuente.

- **🟢 AGENTE DE CONCURSOS (ialimp) — buscador por sector/zona + ingesta a demanda — 19/06/2026** (PRs #393, #394, #396 mergeados a `main`)
  - **Contexto:** Alberto quería que el buscador de concursos le trajera catering/fontanería **en Andalucía**. El corpus
    `concursos_licitaciones` estaba vacío y **PLACSP bloquea por IP (403)** cualquier fetch que no venga de Vercel
    (por eso no se puede sembrar desde el contenedor de dev; la ingesta real solo corre en preview/prod).
  - **#393 — Selector de sector (CPV):** catálogo puro `packages/module-concursos/src/sectores.ts` (32 sectores
    PYME → divisiones CPV) + chips "Tu sector" en el buscador (`apps/ialimp/app/admin/concursos/page.tsx`).
  - **#394 — Fontanería + fix CPV:** añadido sector **Fontanería** (`4533`). **Bug corregido:** varios sectores
    usaban prefijos CPV **con punto** (`79.7`, `92.4`…) que el buscador (`LIKE 'prefijo%'` sobre códigos sin punto)
    **no casaba nunca** → normalizados a `797`/`924`/`374`/`7934`. Test que prohíbe puntos en los prefijos.
  - **#396 — Agente F1:** (A) botón **"⟳ Actualizar ahora"** = ingesta a demanda. Lógica extraída a
    `apps/ialimp/lib/concursos-ingesta.ts` (`descargarAtom`/`ingerirAnuncios`), reutilizada por el cron
    `concursos-ingesta`, el cron `concursos-radar` (quitada duplicación) y el nuevo `POST /api/admin/concursos/ingesta`.
    (F) **Filtro por zona/CCAA**: mapa puro `packages/module-concursos/src/provincias.ts`
    (`COMUNIDADES`/`provinciasDeComunidad`/`comunidadDeProvincia`, tolerante a acentos), filtro `?ccaa=` en el
    buscador (expande a provincias por `ILIKE`) + selector "Tu zona" recordado en `localStorage`. Probado el filtro a
    nivel BD (Andalucía + sector) con filas de prueba (limpiadas). Módulo **88/88**, build ialimp ✓.
  - **Roadmap acordado (siguientes fases, NO hechas):** F2 = G "Mis concursos" (seguimiento) + B avisos proactivos
    email/push por sector+zona + C recordatorio antes del cierre. F3 = H "preparar candidatura 1 clic" (wire al
    análisis F1-F6) + D resumen IA "¿me conviene?". F4 = K búsqueda en lenguaje natural. BOE/TED descartados (bajo ROI local).
  - **Pendiente menor:** el manual (`public/manual.html`) NO cubre el módulo de concursos (0 menciones) — documentarlo entero es tarea aparte.

- **🟢 DIETAS por COMENSALES PUNTUALES (cocina/catering JJ) — 19/06/2026** (PR #391 mergeado a `main`)
  - **Por qué:** crítica de Joaquín — las dietas son de **comensales puntuales** (5 sin gluten, 3 veganos),
    NO un filtro global que cambie el menú entero por 1 persona. Antes, "✨ Sugerir menú" pasaba
    "Restricciones" como texto libre a la IA → habría hecho TODO el menú sin gluten. Corregido de raíz.
  - **Modelo:** un evento = **menú principal** (todos los PAX) **+** grupos `{dieta, nº comensales, plato adaptado del catálogo}`.
    El plato adaptado es una receta del catálogo (la IA no inventa: si falta, lo dice en notas).
  - **DB (BD viva + repo):** `2026-06-19_cocina_dietas.sql` → `cocina_evento_elaboraciones` +`comensales int` +`dieta text`
    (NULL/NULL = menú principal, retrocompatible). El PK `(evento_id,receta_id)` impedía varias filas por receta →
    sustituido por **id sintético** (`gen_random_uuid()`) + 2 índices únicos parciales (principal / por dieta).
    *El código en producción sigue siendo compatible (inserts sin dieta funcionan igual).*
  - **Motor puro `@central/module-trazabilidad`:** `EventoInput.dietas[]`, `ElaboracionTraza.{dieta,comensales,receta_base}`;
    `generarParte` genera **elaboraciones de dieta** (agrupa receta+dieta, suma comensales, escala el escandallo por
    COMENSALES, no por PAX). Nuevo `dietas.ts`: `alergenosIncompatibles(dieta)` + `avisosDietas()` (#3). **36 tests verdes.**
  - **API:** `parte` devuelve `elaboraciones`+`dietas[]`; `eventos` POST/PATCH persisten ambos (helper
    `lib/cocina-elaboraciones.ts`); `menu-sugerido` reescrito → `{menu, alternativas:[{dieta,comensales,platos}], notas}` (#9 sustitución IA).
  - **UI `/produccion`:** EventoForm con sección "Comensales con dieta especial"; "Sugerir menú" con grupos de dieta;
    fichas de dieta con chip "🟢 sin gluten · 5 raciones"; `duracionTarea` usa comensales; reparto IA ignora líneas de dieta;
    **avisos de seguridad** (#3), **resumen de dietas para sala** (#4), **hoja de alérgenos imprimible** (#1).
  - Verificado: `tsc --noEmit` limpio + tests del paquete verdes; 5/5 previews Vercel en verde. Backlog:
    #2 etiqueta/plato, #6 lista compra resta dietas, #7 coste/margen, #8 plantillas evento, #10 histórico cliente.

- **📅 `diaHabitual` en facturas-control — 19/06/2026** (PR #389, builds Ready)
  - Usuario vio 13 facturas en estado "Falta"/"En plazo" sin saber cuándo llega cada una.
  - Añadido `diaHabitual?: number | null` a `ProveedorRecurrente` en `lib/sivra/facturas-control.ts`.
  - Los 17 proveedores recurrentes tienen ahora su día típico del mes (1, 5, 8, 10, 15, 25).
  - La UI (`sivra/facturas-control/page.tsx`) muestra "~día X" en gris debajo del nombre del proveedor.
  - La API route (`route.ts`) no necesitó cambios (spread `...p` ya pasa `diaHabitual` al JSON).
  - **Stop hook:** local branch `claude/responsive-panel` → remote `claude/nice-heisenberg-jo4vy1`.
    El hook busca `origin/claude/responsive-panel` (no existe) → cae a `origin/HEAD` (main) →
    escanea 28 commits. Fix manual: `git fetch origin claude/responsive-panel && git push --force origin HEAD:claude/responsive-panel`.

- **🟢 fix(ia-rest/blog-seo) + fix(plataforma/banca) + feat(plataforma): Control de Facturas — 18/06/2026** (PRs #384, #385 mergeados; blog-seo sin PR propio)
  - **fix(ia-rest/blog-seo):** `callAI` gana 6º arg `model` opcional. El cron `app/api/cron/blog-seo/route.ts`
    usa `meta/llama-3.1-8b-instruct` (8B) con timeout interno <60 s para no superar el límite de Vercel.
    `ia-rest-maestro` skill actualizada. Añadida spec `docs/superpowers/specs/2026-06-16-core-receipts-design.md`.
    Recrea PR #302 (stale draft, código portado directamente a main).
  - **fix(plataforma/banca) — PR #384:** Ingresos de la correduría (comisiones + liquidaciones Allianz/Mapfre)
    llegaban con signo negativo y se clasificaban como gastos, descuadrando el panel `/finanzas`. Solución:
    nuevo `apps/plataforma/lib/destino.ts` (clasificador basado en destino, no en signo) +
    `lib/destino.test.ts` (44 tests). Migración `2026-06-16_reclasificar_abonos_correduria.sql` (aplica
    `UPDATE movimientos_bancarios SET clasificacion_manual=...` a los movimientos históricos mal clasificados).
    Recrea PR #331 (stale draft).
  - **feat(plataforma): Control de Facturas — PR #385:** Panel `/sivra/facturas-control` en plataforma
    (lista de proveedores recurrentes con frecuencia esperada vs. última factura recibida).
    `GET /api/sivra/facturas-control` compara `facturas_drive` contra el registry en
    `apps/plataforma/lib/sivra/facturas-control.ts`. Alerta `facturasFaltantes` en `getAlertas`
    (`lib/banca.ts`) + banner en `/dashboard` + entrada `🗂️ Facturas` en el sidebar (Mis pisos).
    Spec `docs/superpowers/plans/2026-06-16-facturas-control.md` (741 líneas). Recrea PR #322.

- **🐛 FIXES COMUNICACIÓN + FINANZAS — 18/06/2026** (PR #382 mergeado a `main`)
  - **`/comunicacion` → Nuevo mensaje → Persona**: dropdown vacío corregido. `sivraAdapter` no
    tenía `listarDirectorio` → añadido: query `limpiadoras WHERE activa = true ORDER BY nombre`
    (single-tenant, sin filtro empresa_id). Ahora muestra las 15 limpiadoras activas.
  - **`/finanzas` → BBVA 0€ personal**: comportamiento correcto (todos los movimientos personales
    BBVA son positivos — Bizum recibido, pensiones). Añadida nota explicativa inline en
    `FinanzasClient.tsx` cuando `gastos === 0` y la etiqueta contiene "BBVA".

- **🔗 UNIFICACIÓN spine `eventos` (boda = cocina + material + CRM) — 19/06/2026** (rama `claude/jj-logistica-materiales-k5eko3`)
  - **Aclaración:** el módulo CRM de eventos (`eventos` "Eventos v2": presupuesto/espacio/fechas
    montaje) y `cocina_eventos` YA existían; lo que faltaba era **unirlos**. Hecho.
  - **DB (BD viva + repo):** `cocina_eventos.evento_id uuid REFERENCES eventos(id)` (puente, nullable).
    Migración `apps/ia-rest/supabase/migrations/2026-06-19_cocina_evento_crm_link.sql`.
  - **API nueva** `api/cocina/eventos/[id]/crm` (GET/POST): crea una ficha `eventos` mínima desde el
    evento de cocina (cliente=nombre, fecha, aforo=pax, modo_local='cerrado', requiere_appcc) o enlaza
    a una existente; **re-apunta el material** ya asignado del id de cocina → id del evento CRM.
  - **Anclaje del material:** `api/cocina/eventos/[id]/material` ahora usa `evento_id ?? cocina_evento.id`
    como `destino_ref`. Si la boda tiene ficha CRM, cocina + material cuelgan del MISMO `eventos.id`.
  - **UI `/produccion`:** botón **🔗 Ficha CRM** por evento (crea/enlaza) → chip cuando está unido;
    el panel de material indica "unido a la ficha CRM". `parte` devuelve `evento_id`.
  - **Legacy** `inventario_menaje_evento` (menaje viejo sobre `eventos`) se deja como está (no migrado).
  - Verificado: `tsc --noEmit` limpio; insert de `eventos` probado contra constraints (smoke + limpieza).

- **🔗 INTEGRACIÓN boda → cocina + material (1er corte CONSTRUIDO) — 18/06/2026** (rama `claude/jj-logistica-materiales-k5eko3`)
  - Nuevo: cada **evento de cocina** (`/produccion`) lleva su **material** (mesas/sillas/menaje). Botón
    **📦 Material** por evento → panel para añadir **kits** o **material suelto**, con descuento de stock,
    valor en riesgo (coste de reposición) y quitar (repone stock).
  - **API** `apps/ia-rest/src/app/api/cocina/eventos/[id]/material/route.ts` (GET/POST/DELETE), auth de
    cocina (`x-ia-session`), scope `local_id`. Enlace **genérico sin FK dura**:
    `materiales_asignacion.destino_tipo='evento'`, `destino_ref=cocina_eventos.id`, `destino_nombre=nombre`.
  - **UI** en `produccion/page.tsx`: panel desplegable bajo cada evento (solo responsable).
  - **DECISIÓN/DESVIACIÓN:** el v1 ancla en **`cocina_eventos`** (lo que JJ usa hoy), NO en la tabla CRM
    `eventos` que se había elegido — porque JJ no usa el módulo CRM de eventos y así es testeable ya. La
    unificación sobre `eventos` (CRM) sigue siendo el norte; migración futura = repuntar `destino_ref`.
  - **Sembrado para probar** (Catering Joaquín Jaén): owner **PIN 1369** (/owner→Materiales), montador
    **PIN 4040** (/montaje), Carmen **1234** (/produccion). 5 materiales + kit "Boda 100 pax" + 2 asignaciones.
    Enlace: `https://www.iarest.es/login?r=catering-joaquin-jaen`.
  - Verificación: pendiente preview Vercel de ia-rest (sin toolchain TS local).

- **📦 MATERIALES · Fase B aplicada a la BD VIVA + diseño integración con cocina — 18/06/2026**
  (rama `claude/jj-logistica-materiales-k5eko3`)
  - **Bug de fondo resuelto:** el código de Fase B del módulo materiales (mesas/sillas/menaje de
    catering JJ) estaba desplegado pero **solo existían 3 de 16 tablas** en la BD viva
    (`wswbehlcuxqxyinousql`, schema `iarest`). Sus migraciones apuntaban a la BD VIEJA
    (`efncqyvhniaxsirhdxaa`) y nunca se aplicaron al schema compartido → las ~15 pantallas/rutas de
    Fase B (espacios, kits, proveedores, clientes, reservas, movimientos, unidades/QR, mantenimiento,
    inventario físico, categorías, alertas) fallaban 404/500 en producción.
  - **Aplicadas las 4 migraciones** (`materiales_v2`, `_categorias`, `_ledger`, `_fase_b`) al schema
    `iarest` con `SET search_path TO iarest, public` (para que aterricen en `iarest`, NO en `public`
    de ialimp/sivra). **Verificado:** 16 tablas `materiales_*` en `iarest`, **0 en `public`**,
    `materiales` con 25 columnas (tipo/estado/proveedor_id/codigo_qr/stock_minimo OK), **RLS 16/16**.
    Añadida policy `service_role_all` a `materiales_categorias` (solo tenía la de current_setting).
  - **Repo sincronizado:** corregidos los headers de las 4 migraciones (BD vieja → compartida iarest)
    + añadido `search_path` para que reaplicarlas vaya al schema correcto.
  - **Diseño integración boda → cocina + material** (decisión Alberto: anclar en la tabla `eventos`,
    el CRM rico, NO en `cocina_eventos`): doc nuevo
    `docs/superpowers/specs/2026-06-18-eventos-spine-cocina-materiales-design.md`. Principio
    "**junto pero separado por módulo**": `eventos` = tronco común; cocina (`cocina_eventos.evento_id`,
    columna nueva propuesta) y materiales (enlace genérico `parent_tipo/destino_tipo='evento'`, sin FK
    dura) cuelgan del mismo evento sin depender entre sí. Incluye 1er corte ("Material del evento" con
    kits + `disponibilidadEnFecha`) y 17 ideas. **NO implementado aún** (solo diseño).
  - **Pendiente para sesión siguiente:** construir el panel "Material del evento" + `cocina_eventos.evento_id`.

- **📱 RESPONSIVE COMPLETO — 18/06/2026** (PR #381 mergeado a `main`)
  - Añadidas media queries `@media (max-width: 768px)` en 30+ páginas de `apps/plataforma`.
  - Lote 1: `LayoutShell`, `dashboard`, `banca` (×2), `finanzas/FinanzasClient`.
  - Lote 2: `apartamentos` (×2), `sivra/mercado`, `sivra/pricing`, `sivra/pricing-auto`,
    `sivra/income`, `sivra/expenses`, `sivra/gastos-fijos`, `sivra/fiscal`.
  - Lote 3: `sivra/limpiadoras` (×2), `sivra/mensajes`, `sivra/calendario`, `sivra/inversion`, `sivra/seo`.
  - Lote 4: `operador/clientes`, `operador/personas`, `operador/iarest/*` (8 páginas),
    `operador/rrhh/*` (2 páginas), `comunicacion` (×2), `CommandPalette`.
  - Estrategia: `<style>` JSX tags + `className` en divs estructurales. Sin Tailwind, sin reescribir
    inline styles. Breakpoints: 768px (tablet/mobile) y 480px (xs). Utilidades globales en `globals.css`.
  - Todos los CI verdes (4 typechecks + tests + 4 builds Vercel Ready).
- **🧮 DEDUCCIONES FISCALES en `/finanzas` (plataforma) — 18/06/2026** (rama `claude/tax-deductions-personal-finance-e098a7`)
  - Nuevo apartado de **deducciones IRPF** en el módulo `/finanzas`: el cálculo ya no se queda en
    los tramos, ahora llega a **cuota íntegra → mínimos → deducciones → retenciones → a pagar/devolver**.
  - **Motor PURO testeado** `apps/plataforma/lib/fiscal-deducciones.ts` (+ `.test.ts`, 6 casos, `node --test`):
    mínimo personal y familiar, maternidad (hijos <3, madre con actividad), familia numerosa,
    autonómicas **Andalucía** (nacimiento + FN), donativos, plan de pensiones. Importes en
    `IMPORTES_POR_ANIO` (con `fuente`/`revisado`). Optimizador: avisos de oportunidad, checklist
    "deducciones que te dejas", transiciones de edad, calendario fiscal.
  - **BD** (migración `2026-06-18_fiscal_perfil_descendientes.sql`, aplicada a `wswbehlcuxqxyinousql`):
    `fiscal_perfil`, `fiscal_descendientes`, `fiscal_novedades`, `fiscal_justificantes`, `fiscal_historico`.
    3 modelos Prisma nuevos. Datos de Alberto sembrados (3 hijos 2018/2024/2025, madre autónoma, FN general).
  - **UI** `FinanzasClient.tsx`: banner de novedad fiscal, tarjeta de deducciones+cuota, simulador
    "¿y si…?" (plan de pensiones), checklist, calendario, histórico interanual, y **formulario**
    de situación familiar (`PUT /api/finanzas/perfil`). CSV gestoría ampliado con el desglose.
  - **Vigilante** skill **`fiscal-novedades`** (BOE estatal + BOJA Andalucía): contrasta los importes,
    abre PR draft al actualizar la constante e inserta en `fiscal_novedades` (`beneficia`=subió) →
    la app **avisa en pantalla**. Registrada en `docs/SKILLS.md` + `docs/RUTINAS-PROGRAMADAS.md` (rutina #5,
    ~mensual). **NO** se cuelga del agente de concursos (ese sondea PLACSP por CPV, fuente distinta).
  - Pendiente: crear el **trigger** de la rutina en `claude.ai/code → Rutinas`. Importes Andalucía son
    orientativos (afinar contra BOJA en la 1ª pasada del vigilante).
- **🔍 AUDITORÍA PROFUNDA SEMANAL — 18/06/2026** (`docs/AUDITORIA-2026-06.md` addendum)
  - Estado general: **SANO**. 0 errores de tipos en las 5 apps (ia-rest, sivra, ialimp,
    plataforma, rrhh). Tests verdes (rrhh 25/25, packages 40/40, guardián 21/21). Lockfile en
    sync. Radiografía al día. 0 referencias `@iarest/` (guardián).
  - **Supabase**: 0 ERRORS mantenido. Nuevo hallazgo 🟡: bucket `documentos-contables` con
    listing público habilitado → revisar (expone índice de ficheros a agentes anon).
  - **Docs**: `RUTINAS-PROGRAMADAS.md` desync — dice "pendiente de activar" pero las rutinas
    están activas → PR #375 (draft) lo corrige. Pendiente de que Alberto lo mergee.
  - **PRs stale**: 8 drafts abiertos sin actividad (#302, #307, #312, #322, #331, #351, #364,
    #375). Revisar y cerrar los que ya no procedan.
  - **Carry-forward**: aplicar migraciones `concursos_radar` en Supabase (A3 de jun-12) + jubilar
    proyecto viejo `efncqyvhniaxsirhdxaa` (B2).
  - **Rutinas programadas** activas (confirmado por esta sesión): ligera diaria 04:00 CEST +
    profunda semanal domingos. Ambas abren PR draft; sin cambios → sin PR.

- **🧠 MEMORIA ANTI-PÉRDIDA + AUDITORÍA NOCTURNA — 18/06/2026** (rama `claude/project-review-skill-p0jrkc`)
  - **Guardián de cierre**: el hook `Stop` (`.claude/hooks/persist-memoria.sh`) ahora, si la
    sesión hizo commits que tocan algo distinto de la memoria pero NO anotó este archivo,
    **bloquea una vez** y pide anotarlo antes de cerrar. Usa el SHA base que graba el nuevo
    hook `SessionStart` `memoria-record-base.sh`. Sesiones de solo lectura nunca se bloquean.
  - **Hook `PreCompact`** (`.claude/hooks/memoria-precompact.sh`): recuerda volcar memoria
    antes de compactar sesiones largas. Ambos hooks registrados en `.claude/settings.json`.
  - **Auditoría programada**: `/auditoria-diaria` ahora tiene cadencia escalonada — **ligera**
    (diaria, reconcilia memoria/skills/docs + checks baratos) y **profunda** (`--profunda`,
    semanal, `auditoria-central` entera). Documentado en **`docs/RUTINAS-PROGRAMADAS.md`**.
  - **Índice de skills**: nuevo **`docs/SKILLS.md`** (qué skills hay y cuándo usar cada una);
    `/auditoria-diaria` lo mantiene al día contra `.claude/skills/` y `.claude/commands/`.
  - **Triggers ACTIVOS** (creados por Alberto en `claude.ai/code → Rutinas`, 18/06): diaria
    `Ejecuta /auditoria-diaria` 04:00 CEST; semanal `Ejecuta /auditoria-diaria --profunda`
    domingos. Conectores: Supabase + Vercel (**GitHub es nativo** al vincular el repo, no es
    un conector MCP aparte). PR #374 mergeado a `main`.
  - **Límite conocido:** sesiones de solo charla (decisión sin commit) no las caza el
    guardián → anótalas a mano.

- **🔍 AUDITORÍA DIARIA — 18/06/2026** (`docs/AUDITORIA-2026-06-18.md`) — **estado SANO, sin bugs nuevos.**
  - Rango #356→#372. Verde: lockfile en sync, radiografía al día, guardián 21/21, `transpilePackages`
    vs deps coherente (los 2 módulos nuevos de cocina — `module-trazabilidad`, `module-organizador-trabajo`
    — declarados en ambos), **typecheck 0 errores en las 5 apps**, tests en verde, multi-tenant OK en las
    APIs nuevas de cocina (scope `local_id` + guards).
  - Reconciliado: memoria (#372 no anotado), skill `ia-rest-maestro` (faltaban APIs `personal`/`validar-pin`),
    y sincronizado `apps/ia-rest/next.config.js` (residuo con 3 paquetes) con el `.ts` (14) como red de seguridad.
  - **Acción manual (no urgente):** opcional borrar el `next.config.js` redundante de ia-rest (ya sincronizado).
    (Nota: `rrhh` SÍ despliega como `central-rrhh` en el equipo Vercel — confirmado por el CI del PR.)
  - Vulns: 2 high `xlsx` (ialimp solo escribe → no explotable, ya documentado) + 4 moderate transitivas
    (postcss/uuid/file-type) — no se tocan (override arriesga el build de apps vivas).

- **✨ COCINA CENTRAL · GENERADOR DE MENÚS IA — 18/06/2026** (PR #379 merged, `65a68a1`)
  - **API `/api/cocina/menu-sugerido`** (`callAI`, solo responsable): describe el evento (pax/restricciones) →
    la IA compone un menú **eligiendo SOLO del catálogo `cocina_recetas` del local** (valida ids, no inventa),
    equilibra entrante/principal/postre. En `/produccion` (panel Eventos): botón **"✨ Sugerir menú"** → abre
    `EventoForm` **prerrellenado** con las elaboraciones propuestas (revisión humana antes de guardar) + notas IA.
  - Skill `ia-rest-maestro` actualizado con reparto IA / atribución / foto-recepción / generador de menús.

- **🤖 COCINA CENTRAL · REPARTO IA + ATRIBUCIÓN + FOTO-RECEPCIÓN — 18/06/2026** (PR #377 merged, `fa1e48e`)
  - **Reparto IA con aprendizaje:** tabla `cocina_asignaciones` (receta_id→trabajador_id, `origen` ia|manual).
    API `/api/cocina/asignaciones` (GET + set/bulk, solo responsable). En `/produccion`: botón **"✨ Repartir con IA"**
    (`asignarTrabajo` por partida sobre el equipo real, `requiere_rol=partida` + `trabajador.roles=partidas`; fallback a
    semilla con todas las partidas). Selector por ficha → los ajustes de Carmen quedan `origen='manual'` (señal de aprendizaje).
  - **Atribución + tiempos (APPCC real):** `cocina_registros.hecho_por/hecho_por_id/hecho_at/firma_por_id`; controles con `por`.
    La ficha y el dossier muestran "Hecho por X · hora" y el autor de cada control.
  - **📷 Foto-recepción:** `cocina_recepciones.caducidad`; API `/api/cocina/recepciones/reconocer` (`callAIVision`, reutiliza
    patrón de `/api/vinos/reconocer`): foto de etiqueta/albarán → producto/proveedor/lote/caducidad/Tª; albarán multi-producto
    registra todos. Botón "📷 Foto de etiqueta/albarán" en el panel Recepción + campo Caducidad.
  - **Aprendizaje real (análisis de overrides → ajustar la propuesta) = pendiente.**

- **🗺️ ROADMAP COCINA CENTRAL (backlog acordado — "todo menos voz") — 18/06/2026**
  - Decisión Alberto: ejecutar todo el backlog **menos control por voz** (voz → PENDIENTE). La IA hace y aprende.
  - **Pendiente por orden sugerido:** (1) **Generador de menús IA** (describe evento → propone menú del catálogo) ·
    (2) **Etiqueta de regeneración en destino** + **etiquetas APPCC imprimibles por elaboración** (lote/caducidad/alérgenos) ·
    (3) **Control de Tª de cámaras programado con alarma** · (4) **Comparador de precios de proveedores** (requiere capturar
    precio en foto-albarán) · (5) **Lista de la compra automática** (escandallo×PAX → pedido por proveedor, 1 clic) ·
    (6) **Parte/eventos desde PDF del cliente** (visión doc) · (7) **Cronograma del día "en riesgo"** (motor ya da holgura/empezar_antes) ·
    (8) **Hoja de alérgenos por evento (PDF)** · (9) **Hoja de carga/picking del furgón + Tª transporte** ·
    (10) **Costes/márgenes por evento → plataforma** · (11) **Recalibrado automático de tiempos** (usa `hecho_at`) ·
    (12) **Plantillas de evento** · (13) **Mise en place consolidada con cantidades** · (14) **No conformidades + partes de limpieza (L+D)** ·
    (15) **Modo "inspección sanitaria" (dossier total)** · (16) **QR de trazabilidad en etiqueta** · (17) **Presupuesto/PDF al cliente** ·
    (18) **Resumen diario a Carmen** · (19) **Mermas/sobrantes** · (20) **Asistente conversacional del parte** · (21) **Foto del plato terminado** ·
    (22) **Histórico de partes + dossier PDF** · (23) **Firma de entrega digital del cliente** · (24) **Ficha de cliente/CRM**.
  - **PENDIENTE explícito:** control por voz (recalibrado para cocina central, sin comandas).

- **👥 COCINA CENTRAL · GESTIÓN DE EQUIPO — 18/06/2026** (PR #372 merged, `a43fdb1`)
  - Carmen (responsable) gestiona su equipo desde `/produccion` (panel "👥 Equipo"): alta/edición/baja/borrado
    de miembros con **PIN 4 díg. único por local** + `partidas`; muestra el enlace del local + PIN de cada persona.
  - **API `/api/cocina/personal`** (GET/POST/PUT/DELETE) con guard **solo-responsable** (`cocina_rol === 'responsable'`,
    403 si no). Crea filas en `personal` con `rol='cocina'`. `/api/cocina/yo` añade `access_token` del local.
  - Cada miembro entra por el **mismo enlace del local** con su PIN; `/api/cocina/yo` le sirve su vista por rol/partida.
  - `cocina_rol` previsto `co-responsable` (aún no habilitado en el guard). Reunión Carmen: **jueves 25, 12:00**.

- **🏭 COCINA CENTRAL — CICLO COMPLETO EN BD Y EDITABLE — 18/06/2026** (Catering Joaquín Jaén, `/produccion`)
  - **Carmen** (rol `cocina`, PIN **1234** de prueba) entra por su enlace → **`/produccion`** (no al KDS de mesas).
  - **Ya NO es consultivo: herramienta completa, persistida en BD `iarest`** (service_role). PRs mergeados:
    - **#363** eventos editables (CRUD + asignación de elaboraciones) + GET `/api/cocina/parte`.
    - **#365** CRUD de **recetas/escandallo** (partida, min/PAX, muestra, controles APPCC, "depende de", ingredientes por PAX con desinf/descong).
    - **#366** **operativa del día**: tabla `cocina_registros`; cada ficha marca **hecho**, registra **Tª por control**, **muestra testigo**, **firma**; chip "✓ Lista / ⛔ Pendiente"; controles impresos en el dossier.
    - **#368** **recepción de mercancía** (`cocina_recepciones`): registrar albarán (producto/proveedor/lote/Tª/conforme); rellena Lote/Prov./Tª de la ficha por coincidencia de nombre.
    - **#369** **vistas por rol/partida** (`personal.cocina_rol`): GET `/api/cocina/yo`; responsable ve todo; **cocinero** solo su(s) partida(s) sin gestión; **preparación** = recepción + "Bases a preparar".
  - **Tablas nuevas (iarest, aditivas):** `cocina_eventos`, `cocina_recetas`, `cocina_receta_ingredientes`, `cocina_evento_elaboraciones`, `cocina_registros`, `cocina_recepciones`; `restaurantes.modo` (`cocina_central`); `personal.partidas text[]` + `personal.cocina_rol` (Carmen=`responsable`).
  - **APIs:** `/api/cocina/parte` `eventos[/id]` `recetas[/id]` `registros` `recepciones[/id]` `yo`. Auth por sesión firmada `x-ia-session` + `local_id`.
  - **CICLO COMPLETO (5 bloques):** recetas → eventos → asignar → recepción → ejecutar el día (Tª/firma/muestra) → dossier; con roles cocinero/preparación. Motor `@central/module-trazabilidad` + `module-organizador-trabajo`.
  - **PENDIENTE/MEJORAS:** dar de alta usuarios reales de cocinero/preparación (con su `cocina_rol`/`partidas`) — aún sin ellos para Catering JJ; reparto con personas reales (ahora 3 cocineros semilla); "Bases a preparar" como checklist persistido; PIN propio (ahora 1234 de prueba). Reunión Carmen: **jueves 25, 12:00**.
- **📨 FIX FORMULARIO DE CONTACTO (landing) — no avisaba NUNCA — 18/06/2026** (PR #360 merged en main)
  - `iarest.es/#contacto` (home) manda `restaurante:""` y email opcional, pero `/api/leads/landing` exigía
    `nombre && restaurante && email` → **400 en CADA envío de la home**, antes de guardar y antes de avisar
    (`tgAlert()` + `enviarEmailNuevoLead()` van en `Promise.allSettled`, no se llegaban a ejecutar). El cliente
    ignora la respuesta y muestra "Recibido" → fallo invisible. Las otras landings (catering/hostelería/espacios)
    SÍ mandan `restaurante`, por eso esas funcionaban.
  - **Fix** (solo `app/api/leads/landing/route.ts`): la API exige `nombre` + al menos un medio de contacto
    (teléfono **o** email); `restaurante`/`email` vacíos se normalizan (`'Sin especificar'` / `''` / `null`)
    respetando los NOT NULL reales de `leads_landing` (restaurante, email) y `leads` (restaurante, telefono);
    dedup CRM por email o, si no hay, por teléfono; `consent_rgpd: true`.
  - **Verificado EN VIVO** (Alberto rellenó el form real): llega **Telegram** ✅ + **email** ✅ a `hola@iarest.es`
    (alias send-as + recepción confirmada en su Gmail). → `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` SÍ están en
    Vercel y Resend tiene `iarest.es` verificado.
  - **Gotcha leads perdidos:** los envíos fallidos NO dejaron rastro en BD (400 antes del insert). El recuento de
    intentos perdidos vive en **GA4 → evento `generate_lead`** (`origen=landing-principal`), que el form dispara en
    cliente pase lo que pase con la API. GA guarda el evento, no nombre/teléfono.

- **🧾 FACTURAS CORREO · Pasada completa 60 días + fix skill — 18/06/2026**
  - **Archivadas en Drive** (`FACTURAS Apartamentos/2026/`): 7 facturas Anthropic (abr–jun) + Codeoscopic €769.56.
    - **Cuentas Anthropic** (dos, mismo NIF 28823484E, ambas deducibles `seguros`):
      - `albertosuarezgutierrez@gmail.com` → **Anthropic Ireland Ltd** (EU, API credits, IVA 21%):
        `2026-04-15` €21.78 · `2026-04-17` $6.05 · `2026-05-02` $6.05 · `2026-05-05` €142.50
      - `manuelsuarezz@gmail.com` → **Anthropic PBC** (US, Max plan 20x, Mastercard **-0341** sin identificar):
        `2026-04-13` €163.21 (KX7NRNU6-0003, crédito −16.79) · `2026-05-13` €180.00 (KX7NRNU6-0004)
    - **Codeoscopic** `2026-05-21` €769.56 (Workspace software correduría, ya pagado por transferencia).
    - Todos como documentos de texto en Drive (PDFs no subibles por MCP base64). PDFs originales pendientes de subida manual.
  - **Fix skill** (commit `e069a49`): añadida exclusión explícita de **notificaciones operativas de la correduría**
    (recibos devueltos de clientes, avisos de emisión, circulares de Allianz/Mapfre/Generali/Occident) — el agente
    rutinario había etiquetado `Facturas/Procesada` un email de "recibo devuelto de cliente" de Allianz (falso positivo).
  - **FACTURA MAPFRE** (31/05): es liquidación de comisiones (INGRESO de la correduría), NO gasto deducible → excluida.
  - **N26 sin conectar a PSD2**: Vercel ($190.93 anterior) y facturas Anthropic pagadas desde N26 no aparecerán en banco hasta subir extracto manual.
  - **Pendientes detectados en pasada 60d** (sin procesar aún):
    - EMASESA × 3 (Bustos Tavera DER, Bustos Tavera IZQ, Socorro 24) — agua pisos turísticos
    - Endesa SOCORRO 24 (Ref P26CON021029273, "Luz pendiente 2026") — luz pisos
    - Lavandería El Giraldillo (AFV-11528, 25/05/2026) — lavandería pisos, **factura pendiente de pago**
    - IONOS Correo Basic 1 (31/05/2026, ~€1.50/mes)
  - **Para tu decisión (sin respuesta de Alberto):** Registro de la Propiedad "Factura 2025/AM 2345" (¿qué propiedad?) · Amazon WORKPRO Grapadora (¿pisos o personal?)

- **🏭 COCINA CENTRAL DE CATERING ≠ RESTAURANTE — 18/06/2026** (concepto clave, decisión de Alberto)
  - **Distinción fundamental:** una **cocina central de preparación** (catering / comida para llevar / obrador) es
    un MODELO DISTINTO al de un restaurante. ia-rest nació para restaurante (mesas, comandas, voz, KDS). Para la
    cocina central **NO aplican** mesas/comandas/voz/KDS: su mundo es **eventos → parte de elaboración → producción
    → trazabilidad APPCC → recepción de mercancía**. NO calibrar el KDS de restaurante para catering — es el mundo
    equivocado; se le da **pantalla propia**.
  - **Modo del local:** columna nueva aditiva `iarest.restaurantes.modo` (`'restaurante'` por defecto |
    `'cocina_central'`). El local de Carmen (Catering Joaquín Jaén, id `067c8bab-4edf-4765-a0d6-11b6ea112e8f`) está
    marcado `cocina_central`. El login lee el flag (`/api/auth` → sesión firma `cocina_central`) y enruta
    `cocina`+`cocina_central` → **`/produccion`** (no a `/kds`). `/cocina` se deja intacto (sigue → /kds para restaurantes).
  - **ROLES de la cocina central (modelo acordado):**
    - **Responsable de cocina central** (Carmen): distribuye el trabajo, **recepciona mercancía**, coordina, **firma**
      la salida, supervisa APPCC. Ve TODO (parte, reparto, productividad, dossier).
    - **Cocinero/a**: cocina/monta los platos finales con material ya tratado; **no toca mercancía cruda**. Ve su lista del día.
    - **Preparación** (a estudiar/implementar): recepción + mise en place de las BASES. **Frontera recomendada por
      Claude = "contacto con mercancía cruda"** (recepción/lavar/desinfectar/descongelar/cortar/porcionar + bases frías →
      preparación; cocción/montaje → cocinero). Principio APPCC de **marcha adelante** (crudo y cocinado no se cruzan).
    - En el motor `@central/module-organizador-trabajo`: se modela con `requiere_rol` por tarea + `depende_de`
      (encadenado base→plato ya hecho). `asignarTrabajo` respeta `requiere_rol`.
  - **Hecho esta sesión:** módulo `@central/module-trazabilidad` (APPCC: ficha ingredientes·lote·proveedor·desinf·
    descong, controles térmico/abatimiento/congelación, muestras testigo, **bloqueo de salida**, **14 alérgenos
    automáticos**, **generarParte** desde catálogo+eventos; 29 tests). Demos: `/propuesta/parte-jj`, `parte-jj-vivo`,
    `parte-jj-traza`, `parte-jj-auto` (mergeadas). Acceso de **Carmen** creado (rol `cocina`, PIN **4 dígitos**, login por
    token de local; el PIN va en CLARO en BD → rate-limited). Arreglos: nombre del local en `/login?t=`, móvil (tablas
    del parte → filas; header KDS envuelve), parpadeo del panel Elaboraciones del KDS (#361).
  - **PENDIENTE (bloqueado solo por outage del clasificador de Bash):** `next build` + commit + PR + merge de la
    **vista de Carmen `/produccion`** (home de cocina central LIMPIO: header fino con nombre del local + Salir, **sin
    voz/mesas/comandas**, parte del día + reparto + trazabilidad + dossier imprimible, móvil-first). Rama
    `claude/cocina-central` (código listo y revisado, sin commitear).
  - **SIGUIENTE (gated):** persistencia real en BD (rama Supabase + gate) y las pantallas de **cocinero** y
    **preparación** (taggeando cada (sub)elaboración por "contacto con crudo"). Reunión Carmen: **jueves 25, 12:00**.

- **🍳 PARTE DE CARMEN — DEMO + VIVO MERGEADOS — 17/06/2026** (Catering Joaquín Jaén, cocina)
  - **PR #352** → `iarest.es/propuesta/parte-jj`: parte de elaboración real del 20/6 (estático, datos OCR del PDF
    de Carmen). 4 eventos por color, 4 partidas, sub-elaboraciones como "Depende de", badges APPCC. Marca verde/dorado.
  - **PR #354** → `iarest.es/propuesta/parte-jj-vivo`: el parte **conducido por el motor puro REAL**
    `@central/module-organizador-trabajo` (enchufado como workspace dep + `transpilePackages`). `asignarTrabajo`
    reparte por cocinero, `agruparPorPartida` arma columnas, `avisosAlCompletar` encadena base→plato (pulsar
    "Hecho" en un fondo/salsa dispara "Lista para empezar" en el plato). Verificado con `next build` (164/164) +
    64/64 tests del módulo. Sin BD/secretos (semilla en cliente).
  - **Reunión con Carmen: jueves 25 a las 12:00.** Logo real DESCARTADO por Alberto ("con las mejoras mejor, el
    logotipo no es importante").
  - **PENDIENTE (gated, plan #351):** persistencia real sobre `produccion_tareas` (cocinero entra a ia.rest, ve su
    día repartido + cronómetro + avisos encadenados desde BD). Toca la Supabase compartida → rama Supabase + gate
    manual antes de prod. ia-rest YA tiene base: `produccion_tareas`, rutas `/api/produccion/*`, UI cocinero/productividad.
- **🍳 DEMO PARTE CARMEN MERGEADO — 17/06/2026** (PR #352 merged en main, CI + Tests + 5/5 Vercel ✅)
  - Página `apps/ia-rest/src/app/propuesta/parte-jj/page.tsx` → **`iarest.es/propuesta/parte-jj`**.
  - Para la reunión con **Carmen (cocina, Catering Joaquín Jaén) — jueves 25 a las 12:00**: su **parte de
    elaboración REAL del 20/6/2026** ya organizado por nuestro sistema. 4 eventos por color (Hacienda El Alba
    115 pax, Finca Los Fresnos 131, Hacienda Trinidad 136, Decanato 20), 4 partidas (Frío/Caliente/Corte/Montaje),
    sub-elaboraciones como "Depende de" (dependencias), badges de puntos de control APPCC. Marca verde `#02473B`
    + dorado `#9E8152`.
  - **Autocontenida** (`'use client'`, sin BD/imports/secretos) = molde visual. La versión viva sobre
    `produccion_tareas` sigue siendo hito posterior (plan en PR #351, con gate manual de migración Supabase).
  - **PENDIENTE (diferido por Alberto, "luego lo hago"):** logo real `logo-jj.svg` en repo + aplicarlo a
    decks/UI. Decks ya mergeados: `/propuesta/catering-jj-cocina` (Carmen) y `/propuesta/catering-jj-deck` (grupo/Joaquín).

- **💶 MÓDULO /finanzas MERGEADO — 17/06/2026** (PR #341 merged en main, 5/5 Vercel ✅)
  - Hub financiero consolidado para Alberto: correduría seguros, 4 pisos turísticos, gastos personales BBVA/Kutxa, fiscal IRPF.
  - Archivos nuevos: `lib/finanzas.ts` · `app/api/finanzas/route.ts` · `app/api/finanzas/export/route.ts` · `app/(usuario)/finanzas/page.tsx` · `app/(usuario)/finanzas/FinanzasClient.tsx`.
  - `UserSidebar.tsx`: "💶 Finanzas" segundo ítem en Mi negocio, "🤖 Agente IA" renombrado (era "Agente precios"), Mercado 📊→🗺️, sección "Mis pisos"→"Pisos · detalle".
  - Lógica fiscal: `calcularTramos()` (tramos IRPF 2025 declaración conjunta, reducción €3.400). Correduría = cobrado neto / 0.85 (bruto); retenciones = cobrado × 0.15/0.85; no modelo 130 ni 303.
  - Pisos propios (House Sevillana + Duplex Center): placeholder amortización 3%. Pisos subarrendados (Luxury Busto + Busto Reform): alquiler pagado = deducible 100%.
  - Export CSV (`/api/finanzas/export?year=YYYY`) para gestoría: filtro destino seguros+turistico_pisos+turistico_duplex.
  - Bloque Modelo 179: tracker de obligación informativa trimestral para los 4 pisos turísticos.
  - Filtros temporales: año + Q1/Q2/Q3/Q4.

- **🧹 EDGE FUNCTIONS sin Anthropic — 17/06/2026** (PR pendiente) — **ya NO queda Anthropic en ia-rest.**
  - `supabase/functions/qr-assistant`: eliminado el fallback Anthropic (ya usaba NIM como principal).
  - `supabase/functions/eventos-entorno`: web_search de Anthropic → **Gemini `gemini-2.0-flash` + `google_search`**
    (mismo prompt/JSON). `fuente` pasa de `claude-websearch` → `gemini-websearch` (re-corre 1 vez por local, dedup ok).
  - **DESPLIEGUE MANUAL (Alberto):** estas son edge functions de **Supabase** (no Vercel), así que no se
    despliegan con el push. Hay que `supabase functions deploy qr-assistant eventos-entorno` y poner el
    **secret `GEMINI_API_KEY`** en el proyecto Supabase de ia-rest (`efncqyvhniaxsirhdxaa`) para eventos-entorno.

- **🧹 QUITAR ANTHROPIC de ia-rest (#4) — 17/06/2026** (PR pendiente)
  - Eliminada la dependencia **`@anthropic-ai/sdk`** del `package.json` de ia-rest + sus 3 imports:
    `brain.ts` (`callAnthropic`, fallback de pago del POS) y `ai-client.ts` (`anthropicText`/`anthropicVision`).
    El brain ahora es **NIM puro** (si falla → aviso); `callAI`/`callAIVision` lanzan error si NIM no está
    (sin fallback de pago). `noFallback` se mantiene en firmas por compatibilidad.
  - `pnpm-lock.yaml` regenerado (−32 líneas, solo Anthropic). `package-lock.json` de ia-rest es **vestigial**
    (npm; el build usa pnpm `--no-frozen-lockfile`), no se tocó. `tsc` limpio (0 errores).
  - **Pendiente (queda, PR aparte):** 2 **edge functions Deno** (`supabase/functions/qr-assistant`,
    `eventos-entorno`) aún llaman a `api.anthropic.com` por `fetch` → migrar a NIM/Gemini (runtime distinto).
    Referencias inertes a `ANTHROPIC_API_KEY` (health/qa-runner/transcribe: solo booleano/diagnóstico) se dejaron.

- **💸 PASARELA IA · coste real + fallback + healthcheck — 17/06/2026** (PR pendiente)
  - **Coste/tokens reales en `/operador/ia`**: `ai_usos` gana columnas `tokens`+`coste_eur` (migración
    `2026-06-17_ai_usos_coste.sql`, **YA aplicada** en Supabase `wswbehlcuxqxyinousql`, aditiva/idempotente).
    `ai-gateway.ts`: `estimarTokens` (~4 chars/token), `costeEur` (precio €/1k por proveedor, env
    `AI_PRECIO_NIM_EUR_1K`=0 / `AI_PRECIO_GEMINI_EUR_1K`=0.0002). Los 4 endpoints registran tokens+€.
    El panel muestra KPIs **Coste €** y **Tokens**, € por app, y tokens/€ por llamada.
  - **Alerta de presupuesto**: `estadoPresupuesto()` + banner en `/operador/ia` al ≥80% (rojo al 100%).
  - **Fallback de proveedor DENTRO de la pasarela**: `/api/ai/chat` hace **NIM → Gemini** si NIM falla
    (con `GEMINI_API_KEY`) → las verticales podrán quedarse sin keys de proveedor propias.
  - **Healthcheck**: `GET /api/ai/health` (sin secreto, no gasta) → `{ok, proveedores:{nim,gemini}, limite}`.
  - **NO incluido (pendiente, PR aparte):** quitar `@anthropic-ai/sdk` de ia-rest — lo tocan 11 ficheros
    (qa-runner, brain, transcribe, health, edge functions…), merece su propio PR testeado.

- **✅ PR #336 MERGED — 17/06/2026** — Fase 5 COMPLETA: Sistema (QA runs + training IA), Crecimiento (Instagram/Blog/Leads landing) y CRM (pipeline de leads con filtros, buscador, fila expandible con contactos/notas) en `/operador/iarest/*`. 5/5 proyectos Vercel ✅ Ready. `iarest.es/super` ya absorbido al 100% en plataforma (modo read-only). Ver detalle abajo.

- **✅ PR #335 MERGED — 17/06/2026** — Fase 5 Restaurantes: lista completa de locales con KPIs + detalle por restaurante en `/operador/iarest/restaurantes/[id]`.

- **✅ PR #334 MERGED — 17/06/2026** — Fase 5 Suscripciones Stripe (read-only) en `/operador/iarest/suscripciones`. Rebase sobre main (conflicto en generated files: commit intermedio saltado). 4/4 proyectos Vercel ✅ Ready. Ver entrada de sesión 17/06 para detalle.

- **✅ PR #333 MERGED — 17/06/2026** — Panel ia-rest/super en plataforma (`/operador/iarest/cobros|soporte|sugerencias`). Rebase completado contra main (conflictos en UserSidebar.tsx y generated files resueltos). 5/5 proyectos Vercel ✅ Ready antes del merge. Ver entrada de sesión 16/06 para detalle completo.

- **🍽️ PLATAFORMA · Panel ia-rest/super absorbido → /operador/iarest/* — 16/06/2026** (rama `claude/nice-heisenberg-jo4vy1`)
  - **PR #332 MERGED**: `/admin` (god-panel dark 338 líneas) → redirect a `/operador/clientes`. Limpieza definitiva.
  - **Panel ia-rest** (mismo PR): 3 nuevos endpoints en ia-rest `/api/admin/` (Bearer `OPERADOR_SHARED_SECRET`, mismo patrón que `/api/operador/`):
    - `cobros/route.ts` — lee `v_cobro_resumen_super` + `resumen_cobros_mensual`. Totales globales + histórico 12m.
    - `soporte/route.ts` — GET/POST(responder)/PATCH(cambiar estado) de tickets de soporte.
    - `sugerencias/route.ts` — GET/PATCH sugerencias del equipo de sala (estado, nota admin, leída).
  - Plataforma: 3 proxy APIs en `/api/admin/iarest/` (auth `plataforma_admin` cookie → Bearer ia-rest) + 4 páginas:
    - `/operador/iarest` — overview con cards de sección + link al panel legacy `iarest.es/super`.
    - `/operador/iarest/cobros` — tabla de volumen/comisiones por restaurante + histórico mensual. Read-only.
    - `/operador/iarest/soporte` — lista de tickets con panel lateral: responder inline + cambiar estado (abierto/escalado/resuelto).
    - `/operador/iarest/sugerencias` — lista de ideas con filtros (categoría/estado/no leídas) + nota interna editable.
  - **UserSidebar**: sub-items indentados bajo 🍽️ ia-rest (💶 Cobros, 🎫 Soporte, 💡 Sugerencias).
  - **Auth iarest.es/super no tocada**: los `/api/super/*` siguen con `x-ia-session`. Los `/api/admin/*` son endpoints nuevos aditivos.
  - **Env requerido en ia-rest Vercel**: `OPERADOR_SHARED_SECRET` (ya existe, mismo valor que plataforma). Sin él, los 3 endpoints devuelven 401 silencioso.
  - **Pendiente Fase 5**: CRM/leads (~20 endpoints), Clientes/Restaurantes (~11), Instagram/Blog (~15), sistema/health (~12), autocuras — iterativos.
  - **Pendiente Fase 4**: Admin limpiadoras (riesgo ialimp — auditoría RLS previa necesaria).

- **🧰 FUNCTION-CALLING POR LA PASARELA · cerrar el último cabo — 16/06/2026** (PR #329 MERGED, squash `92e6140`)
  - Nuevo endpoint **`POST /api/ai/tools`** en plataforma (espejo de `/api/ai/chat`): `verificarSecreto` +
    `dentroDePresupuesto` + `registrarUso` (endpoint `'tools'`). Recibe `messages`+`tools` (OpenAI),
    responde `{content, tool_calls}`.
  - **`@central/core-ai`**: `aiTools` (lee `NVIDIA_API_KEY`, en `client.ts`) + `gatewayTools` (adaptador
    vertical, en `gateway.ts`). Exports añadidos.
  - **ia-rest** `callAITools` enruta por la pasarela (`gatewayTools`) y cae a `nimChatTools` directo si falla.
  - **Resultado:** las **4 vías** de IA de ia-rest (`callAI`/`callAISearch`/`callAIVision`/`callAITools`)
    pasan ya por la pasarela cuando está configurada → gasto 100% centralizado en `/operador/ia`. `tsc` limpio.

- **🔌 IA POR LA PASARELA · cerrar los 2 pendientes del #325 — 16/06/2026** (PR #327)
  - **sivra `seo-refresh`** ya NO usa Anthropic web_search: `lib/ai-client.ts` gana `aiSearch()` →
    `gatewaySearch` (pasarela central, Gemini+Google Search); sin pasarela cae a NIM puro. Eliminada
    `ANTHROPIC_API_KEY` de la ruta. **Con esto NINGÚN agente del repo llama ya a Anthropic como vía principal.**
  - **ia-rest `lib/ai-client.ts`** enruta por la **pasarela central** (como ialimp/sivra): `gatewayCfg()`
    (`AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`, env de equipo Vercel); `callAI`/`callAISearch`/`callAIVision`
    intentan la pasarela primero y caen al camino directo NIM→Anthropic si no está / falla.
    `callAITools` (function-calling de los agentes del god-panel) sigue **directo a NIM** (la pasarela no
    expone tool-calling).
  - Anthropic queda solo como fallback de transición en ia-rest (hoy sin saldo). `tsc` limpio en ambas apps.

- **🤖 AGENTES IA-REST · quitar Anthropic de los 4 agentes del god-panel — 16/06/2026** (PR #325 MERGED, squash `97bdcc2`)
  - **Motivo**: los 4 agentes daban error 500 *"Anthropic no disponible (sin crédito)"*. Decisión de Alberto:
    quitar Anthropic → **NVIDIA NIM + Gemini** (gratis, sin saldo).
  - **`@central/core-ai`**: nuevo `nimChatTools` (function-calling con NIM, endpoint OpenAI-compatible) +
    tipos `NimToolMessage`/`NimToolCall`/`NimToolResult`. NIM corre el bucle agéntico; la app ejecuta sus tools.
  - **ia-rest `lib/ai-client.ts`**: `callAITools(system, messages, tools)` (wrapper de `nimChatTools`).
  - **Agentes migrados** (las herramientas se ejecutan igual; solo cambió el "cerebro"):
    - `agentes-ai` (solo búsqueda web) → **Gemini** (`callAISearch`).
    - `agente-arquitecto` (GitHub/Drive) → **NIM function-calling**.
    - `agentes-seo` (web_search + GSC/GA4) → **NIM**; `web_search` pasa a tool custom respaldada por **Gemini**.
    - `cron/seo-agent` (web_search + escritura SEO + GSC/GA4) → **NIM + Gemini**.
  - Funciona con `NVIDIA_API_KEY` + `GEMINI_API_KEY` que ia-rest **ya tiene**. `tsc` limpio. 5 deploys Vercel en verde.
  - **PENDIENTE**: (a) **sivra `seo-refresh`** (cron) aún usa Anthropic web_search → migrar igual a Gemini.
    (b) Conectar el `ai-client` de ia-rest a la pasarela central (como ialimp/sivra) para centralizar su gasto.


- **📧 FACTURAS CORREO · Sistema completo en producción — 16/06/2026** (PR #324 MERGED)
  - **Flujo diario automatizado:**
    - 06:00 UTC → cron PSD2 sincroniza BBVA + Kutxa (23 movimientos insertados en primera sync)
    - 08:00 CEST → Rutina Claude `Revisar facturas correo` procesa Gmail → Drive → Supabase
  - **Infraestructura:**
    - `CRON_SECRET` configurado en Vercel plataforma → cron PSD2 ya funciona
    - Rutina activa en `claude.ai/code → Rutinas` (daily 8:00 CEST, repo `central`, MCPs Gmail+Drive+Supabase)
    - Botón `📧 Revisar correo` en Banca → abre Claude Code + copia `/facturas-correo` al portapapeles
    - Slash command `/facturas-correo` disponible en Claude Code web
  - **Clasificaciones confirmadas por Alberto:**
    - IKEA/Taskrabbit/ferretería → `turistico_pisos`; TotalEnergies → `turistico_pisos`
    - Anthropic Ireland → `seguros`; BSH + Tutrocito 122.87€ → `personal`
    - Círculo Mercantil → siempre `personal`
  - **Regla reenvíos Pilar** (actualizada en skill): Taskrabbit/fontanero/Amazon/ferretería → siempre "Para tu decisión" (no auto-clasificar)
  - **Archivados en Drive** (`FACTURAS Apartamentos/2026/06-Junio-2026/`): Vercel, Anthropic, TotalEnergies, PriceLabs, Taskrabbit 85.41€ (montaje IKEA, 16/06)
  - **Pendiente subida manual**: IKEA 888.89€ PDF + PDFs TotalEnergies (MCP Gmail no descarga adjuntos)
  - **Vercel 190.93€ + Anthropic 217.80€**: pagados desde **N26** → pendiente conectar N26 al PSD2 o subir extracto manual
  - **Etiqueta Gmail**: `Facturas/Procesada` (Label_11) — todos los correos procesados etiquetados


- **🤖 IA UNIFICADA · ialimp + sivra a la pasarela central + endpoint de VISIÓN — 16/06/2026** (rama `claude/bold-ride-s4s8eq`)
  - **Decisión de Alberto**: la IA NO se configura por proyecto. Las **keys de proveedor viven solo en
    plataforma**; cada vertical llama a la pasarela. La conexión (`AI_GATEWAY_URL` + `AI_GATEWAY_SECRET`)
    se pone **UNA vez como Variables Compartidas a nivel de equipo (Team) en Vercel** → todos los
    proyectos la heredan, sin repetir por proyecto.
  - **Pasarela ampliada con VISIÓN/OCR**: `gatewayVision` (core-ai) + `POST /api/ai/vision` en plataforma
    (NIM vision, Bearer, presupuesto, registro en `ai_usos`). Necesario porque ialimp/sivra hacen mucho OCR.
  - **ialimp** (100% migrado): `lib/ai-client.ts` reescrito → `aiComplete` y `aiVision` enrutan por la
    pasarela con fallback a NIM directo. Los **7 sitios de OCR** (`concursos-ocr`, `cron/procesar-documentos`,
    `propietario/escanear`, `admin/escanear/process`, `admin/ia/{analizar-foto,analizar-botes,comparar-foto}`)
    cambiados de `nimVision`→`aiVision` (misma firma). `lib/concursos.ts` importa `aiComplete` del wrapper.
  - **sivra**: `lib/ai-client.ts` → `aiComplete` y `aiExtractInvoice` (OCR facturas) por la pasarela con fallback.
  - **ia-rest PENDIENTE** (Fase 2): los 4 agentes con **tool-calling de Anthropic** (agente-arquitecto, agentes-seo,
    agentes-ai, cron/seo-agent) + el `seo-refresh` de sivra NO migran: la pasarela hace chat+búsqueda+visión, no
    tool-calling. Para unificarlos hay que extender la pasarela con un endpoint de tool-calling (Anthropic). Las
    llamadas NIM/Gemini planas de ia-rest sí se pueden migrar (su `ai-client.ts`) en otro PR.
  - **Migración SIN romper nada**: sin los envs, todo sigue con las keys directas; al ponerlos, pasa por la pasarela.
  - **Tras configurar**: el gasto de ialimp/sivra/rrhh se ve en plataforma → god-panel → 🤖 IA · gasto.

- **🤖 RRHH · Verticales conectadas a la pasarela de IA central — 16/06/2026** (rama `claude/bold-ride-s4s8eq`)
  - El **asistente del empleado** (`lib/asistente.ts`) y el **agente de convenios** (`lib/convenio-agente.ts`)
    de iarrhh ya **llaman a la pasarela de plataforma** en vez de a NIM/Gemini directos → las keys de
    proveedor y el **control de coste/uso** quedan centralizados en plataforma (`/operador/ia`).
  - **Nuevo**: `lib/ai.ts` — `viaIA()` (pura, testeada), `iaDisponible()`, `iaChat()` (pasarela→NIM),
    `iaSearch()` (pasarela search→degrada a chat; fallback Gemini/NIM directo). Prioriza la pasarela;
    si no está configurada, usa la key directa (transición sin romper nada). Test `lib/ai.test.ts`.
  - **Envs nuevos en Vercel `central-rrhh`**: `AI_GATEWAY_URL` (= URL de plataforma) + `AI_GATEWAY_SECRET`
    (mismo valor que en plataforma). Al activarlos se podrán quitar `NVIDIA_API_KEY`/`GEMINI_API_KEY` de rrhh.
  - **Bonus**: esto probablemente **arregla el "asistente no disponible"** (la key vivía en rrhh; ahora la
    llamada la hace plataforma, donde `NVIDIA_API_KEY` ya funciona).

- **🎨 RRHH · Marca blanca por empresa (white-label) — 16/06/2026** (rama `claude/bold-ride-s4s8eq`)
  - Cada empresa define su **color corporativo (hex)** y su **logo** desde **Mi cuenta** (gestor);
    el **Portal del Empleado** (`/e`) se tiñe con ellos (logo en cabecera + acento de la marca).
  - Reutilizable para CUALQUIER cliente (no hardcodea Mariscos González). Para aplicar la marca de
    Mariscos: el sitio `mariscosgonzalez.com` **no es accesible** desde el entorno (bloqueado por la
    allowlist de egress) → Alberto sube el logo + elige el color en Mi cuenta (self-service).
  - **Nuevo**: `lib/branding.ts` (puro: `normalizaHex`, `derivarPaleta`, `estiloMarca`) + test;
    `app/api/admin/cuenta/branding/route.ts` (POST multipart, gestor); migración
    `0013_empresa_branding.sql` (`empresas.color_primario`, `empresas.logo_path`; **aplicada**).
  - **Modificado**: `lib/empresa.ts` (`getBranding`, `actualizarBranding`); `app/e/page.tsx` +
    `app/e/ExpedienteEmpleado.tsx` (aplica color vía CSS vars `--accent*` inline + logo); `app/admin/cuenta/page.tsx`
    + `CuentaClient.tsx` (sección "Identidad corporativa"). Logo en bucket privado `rrhh-documentos`
    (`branding/<empresa>/...`), servido por URL firmada en cada render.
  - **AI gateway (PR #315 MERGED)**: pasarela de IA en plataforma (`/api/ai/chat` NIM, `/api/ai/search`
    Gemini, Bearer `AI_GATEWAY_SECRET`) + god-panel `🤖 IA · gasto` (`/operador/ia`) + tabla `public.ai_usos`.
    Pendiente Alberto: env `AI_GATEWAY_SECRET` (+opc. `GEMINI_API_KEY`, `AI_GATEWAY_LIMITE_MENSUAL`) en plataforma.

- **🏠 PLATAFORMA · Sivra Fase 3 completa: mercado, pricing lab, pricing automático + calendario por portal — 16/06/2026** (PR #316 mergeado, rama `claude/sivra-fase3-mercado-pricing`)
  - **Páginas migradas** de sivra → plataforma `/sivra/*`:
    - `/sivra/mercado` — benchmark de competidores: panel por escenario (normal/corpus), toggle de portales, percentiles p25/p50/p75, búsqueda en tiempo real (Serper+NIM). APIs `GET /api/sivra/mercado/stats`, `GET /api/sivra/mercado/search`, `POST /api/sivra/mercado/ingest`.
    - `/sivra/pricing` — Pricing Lab en modo shadow: tabla de experimentos A/B por propiedad (booked/libre/activo), stats de ocupación vs PriceLabs. APIs `GET|POST|DELETE /api/sivra/pricing/experiments`, `GET /api/sivra/pricing/stats`.
    - `/sivra/pricing-auto` — Motor de precios completo: 13 parámetros por propiedad, botón de pánico, historial de aplicaciones, resultados €, pilot tracking 🟢🟡🔴. APIs `GET /api/sivra/pricing/settings`, `GET /api/sivra/pricing/apply`, `GET /api/sivra/pricing/historial`, `GET /api/sivra/pricing/resultados`, `GET /api/sivra/pricing/pilot-track`, etc.
  - **Calendario Gantt** (`/sivra/calendario`) — barras ahora coloreadas por portal de reserva (Airbnb rojo, Booking azul, VRBO azul oscuro, Directo violeta, Otros gris). Leyenda actualizada. Antes eran por propiedad (redundante con filas).
  - **Libs puras copiadas de sivra**: `lib/sivra/pricing-engine.ts` (motor de recomendación), `lib/sivra/pricing-calendar.ts` (eventos/estaciones), `lib/sivra/pilot-track.ts` (evaluación 🟢🟡🔴).
  - **7 nuevos crons** en `vercel.json`: mercado/cron (07:15), mercado/sweep (dom 03:00), pricing/guard (07:30), pricing/experiments/check-results (08:00), pricing/apply-auto (08:30), pricing/resumen-diario (09:00), pricing/pilot-track (09:15).
  - **UserSidebar.tsx** — NAV_PISOS ampliado con 3 entradas: Mensajes, Mercado, Pricing Lab, Pricing auto.
  - **Estado CI**: todos los proyectos en Ready ✅ (plataforma, ialimp, sivra, ia-rest, central-rrhh)
  - **Siguiente Fase 4**: Admin limpiadoras (⚠️ riesgo ialimp, requiere auditoría RLS previa)

- **🏠 PLATAFORMA · Sivra Fase 2 completa: /sivra/mensajes (Smoobu) + fixes responsive dashboard — 16/06/2026** (PR #310, mergeado)
  - **Mensajería de huéspedes** migrada de sivra → plataforma:
    - `lib/smoobu.ts` — `getSmoobuKey()` lee `pms_connections.smoobu_api_key` (tabla de ialimp) con caché 5min; fallback a `SMOOBU_API_KEY` env solo si BD falla
    - `GET /api/sivra/mensajes` — threads Smoobu + join `incomes` (checkIn/checkOut/portal) + `mensajes_status` (overrides manuales). Clasifica: trivial/info/importante → estado: respondido/pendiente/urgente
    - `GET|PATCH /api/sivra/mensajes/[bookingId]` — mensajes por reserva, cambio de estado persiste en `mensajes_status` (ON CONFLICT UPDATE)
    - `POST /api/sivra/mensajes/reply` — reglas de negocio (late checkout, early checkin, parking) → RAG en `knowledge_base` → `aiComplete` de `@central/core-ai`. Notifica `SIVRA_URL/api/limpiadoras/early-checkin` para early in/out
    - `GET|POST|PATCH|DELETE /api/sivra/mensajes/knowledge` — CRUD base de conocimiento (tabla `knowledge_base`)
    - `/sivra/mensajes/page.tsx` — UI completa: paneles redimensionables, lista de threads con filtros (estado/propiedad/búsqueda), chat, sugerencia IA, traducción vía MyMemory, Gmail draft, guardar en KB. Mobile: vista única list/chat con toggle
  - **UserSidebar** — NAV_PISOS actualizado a 8 entradas (añadida Mensajes entre Fiscal y Inversión)
  - **Dashboard fixes responsive**:
    - Fecha `checkIn` ahora usa `::date::text` (antes `::text` devolvía timestamp completo `2026-06-16 12:00:00+00`)
    - Widget "Esta semana en los pisos": `maxWidth: 90` en nombre de piso (era `minWidth`) + `minWidth: 0` en contenedor → importe ya no se corta en móvil
  - **Env vars necesarias en proyecto Vercel `plataforma`**: `SMOOBU_API_KEY` (fallback), `SMOOBU_PMS_CONNECTION_ID` (opcional, tiene default), `SIVRA_URL` (para notificar limpiadoras)

- **🏠 PLATAFORMA · Sivra Fase 1b completa: income, expenses, gastos-fijos, fiscal, calendario Gantt, widget dashboard — 16/06/2026** (PR #305, rama `claude/sivra-fase1b-income-expenses`)
  - **Páginas migradas** de sivra → plataforma `/sivra/*`:
    - `/sivra/income` — lista completa de reservas con filtros (portal, propiedad, fecha, huésped) + 4 KPIs: reservas, ingresos brutos, media/reserva, noches. API `GET /api/sivra/income`.
    - `/sivra/expenses` — gastos manuales con formulario, subida a Drive, filtros por mes/propiedad/categoría. APIs `GET/POST/DELETE /api/sivra/expenses` + `POST /api/sivra/expenses/parse-invoice` (OCR NVIDIA NIM).
    - `/sivra/gastos-fijos` — CRUD de plantillas de gastos recurrentes. APIs `GET/POST/PUT/DELETE /api/sivra/expenses/fijos` + `GET /api/sivra/expenses/fijos/generar` (cron día 1/mes).
    - `/sivra/fiscal` — NUEVA (no existía en sivra): export IRPF por piso/trimestre. Tabla de rendimientos brutos, gastos deducibles (por categorías: limpieza, suministros, seguros, ibi, amortización, comisiones), resultado neto, descarga CSV con BOM UTF-8. API `GET /api/sivra/fiscal?year=YYYY`.
  - **Calendario Gantt** completo (reescritura desde cero, `/sivra/calendario`):
    - Barras de reserva con posicionado absoluto (DAY_W=46, ROW_H=52, LABEL_W=130, DAYS=30)
    - Color de propiedad + stripe de portal (Airbnb rojo, Booking azul, VRBO azul oscuro, Directo violeta)
    - ADR/noche visible en barras anchas, nombre del huésped
    - Detector de gaps (1-2 días libres entre reservas) → fondo rojo suave
    - Indicator de limpieza (checkout+checkin mismo día/piso) → emoji 🧹 en cabecera de columna
    - Panel de detalle al click en reserva
    - Stats de propiedades con barra de ocupación %
    - Tabla de próximas llegadas con ADR al final
  - **Widget "Esta semana en los pisos"** en `/dashboard`:
    - `getProximasLlegadas()` — query server-side sobre `incomes` + `properties`, próximos 7 días
    - Filas: dot color por propiedad, etiqueta HOY/MÑN/dd/mm, nombre piso, huésped, noches, badge portal, importe
    - HOY resaltado en `--primary-light`; link directo a `/sivra/calendario`
  - **lib/sivra/fingerprint.ts** — helper de deduplicación para gastos (copiado de sivra)
  - **lib/sivra/gastos-fijos.ts** — generador mensual de entradas desde plantillas
  - **vercel.json** — añadido cron `0 6 1 * *` para `/api/sivra/expenses/fijos/generar`
  - **UserSidebar.tsx** — NAV_PISOS actualizado con 7 entradas: Calendario, Ingresos, Gastos, Gastos fijos, Fiscal IRPF, Inversión, SEO
  - **Fix TypeScript**: `inversion/page.tsx` corregido `'break-words'` → `'break-word'` (typecheck CI)
  - **Estado CI**: todos los proyectos en Ready ✅ (plataforma, ialimp, sivra, ia-rest)
  - **Pendiente Fase 2**: `/sivra/mensajes` (Smoobu, getSmoobuKey()), OCR Gmail, crons sync

- **📊 SIVRA · Backfill de ingresos Smoobu completado (sep-2025→may-2026) — 16/06/2026**
  El panel "Mis apartamentos / Febrero 2026" mostraba **0 € de ingresos** (Gastos: 1.641 €, resultado −1.641 €).
  Causa raíz: la API key de Smoobu estuvo rota ~sep-2025→14-jun-2026 y el cron solo tiene ventana de 2 días
  (`modifiedFrom = hoy − 2 días`), por lo que nunca rellenó hacia atrás. PRs #294 y #297 añadieron
  `from`/`to` de llegada (Smoobu solo devuelve próximas si no se pasan esas fechas) y `maxPages` al
  endpoint `GET /api/updates/sync`. Backfill ejecutado por tramos via `web_fetch_vercel_url`; a pesar de
  los 502 de Cloudflare (timeout de gateway), el Lambda de Vercel procesa y escribe. Resultado final:
  - 2025-09: 17 res · 7.653 € ✅ | 2025-10: 36 res · 12.783 € ✅ | 2025-11: 20 res · 7.490 € ✅
  - 2025-12: 15 res · 10.342 € ✅ | 2026-01: 15 res · 4.927 € ✅ | 2026-02: 24 res · **9.902 €** ✅
  - 2026-03: 23 res · 8.171 € ✅ | 2026-04: 33 res · **17.961 €** ✅ | 2026-05: 27 res · **13.665 €** ✅
  **El hueco sep-2025→may-2026 está 100% cerrado.** El cron diario (ventana 2 días) ya corre con la key
  correcta (de `pms_connections`, arreglada el 14/06/2026) y mantiene los datos al día. Verificado por
  Supabase SQL (`SELECT … FROM incomes GROUP BY mes`).

- **📖 MANUAL de iarrhh para Pilar (Mariscos González) + roadmap RR.HH. + CI verde — 16/06/2026**
  - **Manual de usuario** del Portal del Empleado (responsable RR.HH.): `apps/rrhh/public/manual.html`
    (servido en `central-rrhh.vercel.app/manual.html`), dirigido a **Pilar** (Mariscos González). Cubre
    entrar/cambiar contraseña, alta de trabajador (email obligatorio), enviar enlace de acceso, expediente
    (5 carpetas), nóminas + **firma eIDAS art.26 con OTP**, cómo firma el empleado, vacaciones/permisos,
    chat, baja vs borrado, qué ve el empleado, FAQ. **Sin credenciales** (no se hardcodean: el fichero es
    público). Enlace **📖 Manual** añadido al sidebar del panel (`components/AdminShell.tsx`).
  - **Roadmap RR.HH.** consolidado y durable en **`docs/ROADMAP-rrhh.md`** (PR #296, mergeado): todas las
    ideas con top-3 (asistente IA del trabajador + multi-idioma, verificación pública por QR estilo
    VeriFactu, plantillas legales versionadas).
  - **CI verde en main:** fix `packages/core-firma/src/firma.ts` (cast `BufferSource` en `hashDocumento`,
    PR #293 mergeado) — el `Typecheck · ialimp` que rompía main tras el merge de #287 ya pasa.
  - **Pendiente conocido (no mío, latente):** `components/ActivarPush.tsx` tiene el MISMO patrón
    `Uint8Array→BufferSource` sin castear (rrhh no está en el matrix estricto de Typecheck y `next build`
    ignora TS, por eso no rompe CI). Candidato a limpiar cuando se toque ese fichero.

- **🧩 RR.HH. CAPACIDAD COMPARTIDA — Fases 1+2 + verificación + arreglos rrhh — 16/06/2026** (PR #287, rama `claude/bold-ride-s4s8eq`)
  - **Fase 1 (ialimp da RR.HH. a las limpiadoras):** consume `@central/module-rrhh` + `module-documental` +
    `core-firma`. Tablas `documentos_limpiadora`/`firmas_limpiadora`/`firma_otps_limpiadora` (+ `limpiadoras.email`
    OBLIGATORIO para el OTP, `+dni`). Bucket **privado** `documentos-limpiadora` (policy read). `lib/{carpetas,storage,
    expediente,firma}-limpiadora.ts` + `lib/nomina-pdf.ts` (pdf-lib, agrega `partes_trabajo`). Rutas `/api/l/expediente*`
    (firma OTP) + `/api/admin/limpiadoras/[id]/{expediente,nomina}`. UI: **`/l/documentos`** (botón en `/l`) + pestaña
    **📁 Expediente** en `/admin/rrhh` (`components/ExpedienteLimpiadoraAdmin.tsx`). Remitente OTP parametrizado
    `FIRMA_FROM` (default `hola@ialimp.es`). Migración `2026-06-16_rrhh_limpiadora.sql` aplicada.
  - **Fase 2 (identidad de persona compartida):** `@central/core-identity` añade tipo **`Persona`** + helpers puros
    (`nuevaPersonaId`, `normalizarDni/Email`, `coincidenciaPersona`, `mismaPersona`). Columna **`persona_id`** (uuid,
    indexada) en `limpiadoras` y `rrhh.empleados`, **provisión automática al alta**. Verificado e2e: join cross-vertical
    por `persona_id` (misma persona en ialimp ↔ rrhh).
  - **Arreglos panel Empleados (rrhh):** faltaban editar/borrar en la UI (el backend ya los tenía). Añadido editar inline
    + estado activo/baja, **alta completa** (email OBLIGATORIO + DNI/tel/puesto), buscador + filtro, **copiar/regenerar
    enlace**, **borrado blindado** (409 si tiene firmas → conservar evidencia). Fix PATCH parcial (no machaca dni/tel).
    Fix infra: **policy read del bucket `rrhh-documentos`** (sin ella, con RLS, el firmado de URLs devolvía null → no se
    descargaban los documentos del expediente).
  - **Tests:** los 4 paquetes vitest (`core-firma`/`module-rrhh`/`module-documental`/`module-chat`) + `core-identity`
    estaban huérfanos (sin runner) → **cableados** (`vitest` devDep root + `test:vitest` dentro de `test`). **40/40 verdes.**
  - **Fase 3 (consolidación en plataforma, SOLO LECTURA) — HECHA:** nuevo endpoint READ-ONLY en rrhh
    `/api/operador/personas` (empleados+persona_id por el puerto operador). En plataforma `lib/personas.ts`
    consolida "la persona a través de verticales" (ialimp.limpiadoras por prisma directo + rrhh por HTTP),
    agrupa por `persona_id` y PROPONE enlaces no hechos por DNI/email (`coincidenciaPersona`). God-panel:
    `/operador/personas` (`PersonasClient.tsx`, item nuevo en `UserSidebar`) + `GET /api/admin/personas`.
  - **Pendiente:** **enlace MANUAL** del `persona_id` cross-vertical (escritura: setear el mismo persona_id
    en ambas filas/dos apps — hoy solo se SUGIERE en `/operador/personas`). **Roadmap completo en
    `docs/ROADMAP-rrhh.md`** (todas las ideas con top-3 marcado: asistente IA del trabajador + multi-idioma,
    verificación pública por QR estilo VeriFactu, plantillas legales versionadas; + fichaje RD 8/2019,
    art. 28 RGPD, canal de denuncias, coste laboral en plataforma, pago real Stripe, etc.).

- **🧩 RR.HH. COMO CAPACIDAD COMPARTIDA — Fase 0: `@central/module-rrhh` — 16/06/2026**
  Objetivo (decisión de Alberto): RR.HH. (nóminas + firma + expediente) reutilizable por **cualquier
  vertical** y **cliente directo**. Casos que cubre el diseño: (1) limpiadoras de ialimp (Vanessa),
  (2) cualquier vertical futura, (3) cliente RR.HH. directo tipo **Joaquín Jaén** (entra como `empresa`
  en la app rrhh por el god-panel/puerto operador ya existente, sin tocar nada). Identidad de persona
  cross-vertical vía `core-identity` + consolidación en `plataforma`.
  - **Hecho (Fase 0):** nuevo paquete **`@central/module-rrhh`** (`packages/module-rrhh`, TS puro):
    orquestación de firma con OTP **owner-agnóstica** (puertos `RepoFirma`/`PuertoEmailFirma`/
    `PuertoDescarga` que inyecta cada vertical) + taxonomía `CARPETAS_RRHH` compartida (reusa
    `module-documental`). Tests vitest **9/9**.
  - **Refactor sin cambio de comportamiento:** `apps/rrhh/lib/firma.ts` ahora es un adaptador fino que
    construye los puertos con el SQL de rrhh (`rrhh.documentos/firmas/firma_otps`) y delega en el módulo;
    `apps/rrhh/lib/carpetas.ts` reusa `CARPETAS_RRHH`. Añadido `file:` dep + `transpilePackages`. Tests
    rrhh 3/3 y core-firma 9/9 verdes; sin regresión.
  - **Pendiente (Fase 1+):** ialimp ofrece RR.HH. a limpiadoras (migraciones `documentos/firmas/
    firma_otps_limpiadora`, bucket privado, nómina PDF desde `partes_trabajo`, UI `/l/documentos`).
    **Decisiones abiertas:** email de limpiadora obligatorio (para OTP) y marca del remitente. Fase 2
    identidad de persona; Fase 3 consolidación en plataforma. Roadmap: fichaje (RD 8/2019), art. 28 RGPD,
    canal de denuncias (Ley 2/2023), vacaciones, onboarding, gestoría.
- **🤖 SIVRA · Agente de pricing — 1er ciclo con datos reales + motor por temporada (Paso 6/B2) — 16/06/2026**
  Continuación del agente (#291 ya MERGED). Ejecutado el primer ciclo y construido B2.
  - **Zona poblada** (`pricing_piso_zona`): 4 pisos, CP 41003 (Bustos Tavera / Casco Antiguo), aforo y tipo
    reales sacados de `propiedades` (el endpoint `/api/pricing/pisos-zona` requiere sesión y al abrirlo sin
    login redirige; por eso se pobló por SQL desde `propiedades`).
  - **Mercado real por zona+aforo** (`market_rates`, conector Booking MCP): finde julio (p50 ~132€ 4pax / ~122€
    2pax), **Semana Santa 2027 p50 ~462€/noche (¡~3,3× normal!, ya disparado 9m vista)**, Feria 2027 (~162€, aún
    sin rampar → oportunidad de adelantarse; FECHAS A CONFIRMAR).
  - **Memoria** (`pricing_aprendizaje`): factor pelotazo SS, baseline verano, nota Feria. **Decisiones dry-run**
    (`pricing_decisiones`, fuente `agente_bootstrap`): SS 2027 base Smoobu Duplex 371 / Luxury 354 / Busto 319, min-stay 3.
  - **Paso 6/B2 (motor por temporada)** en `apps/sivra/app/api/pricing/apply/route.ts`: el motor tarificaba con
    UN percentil por piso (mezclando fechas → precios planos). Ahora agrupa comps por **mes de `checkin_date`**
    (más reciente por scenario+fecha+nombre, ventana 120d) y tarifica cada fecha con el mercado de SU mes;
    fallback al global si <3 comps. Evento: si usa bucket mensual (ya refleja el evento) NO multiplica por
    `eventFactor` (sin doble conteo) pero garantiza ≥ global×eventFactor; en fallback, comportamiento idéntico
    al previo. Validado por SQL (buckets jul/oct/SS/Feria correctos). Va en rama `claude/pricing-b2-temporada`.
  - **Pendiente:** (1) calibrar coste→`min_price` (suelo) de Duplex/Luxury/House (hoy NULL; apply_enabled=false →
    solo dry-run); (2) House Sevillana necesita comps de unidad grande (12 plazas) + activar apply_enabled;
    (3) aplicar a Smoobu vía raíles (Paso 4) requiere CRON_SECRET (cron) o sesión — Claude no puede llamarlo solo;
    (4) confirmar fechas exactas de Feria 2027 y re-consultar conectores más cerca.

- **🤖 SIVRA · Agente de pricing IA — raíles + skill + chat (Fase 2-B, Pasos 4/5/5-bis) — 16/06/2026 — PR #291 (draft)**
  Construido el cerebro + los raíles del agente de pricing autónomo (sobre #290, que ya creó las 3 tablas).
  - **Paso 4 (raíl, sivra):** `POST /api/pricing/aplicar-propuesta`. La IA propone y este endpoint aplica la
    cadena que la IA NO puede saltarse: pausa global → `apply_enabled` → suelo de coste (`min_price`) →
    tope ±`max_change_pct`/día vs precio actual → techo opcional → **circuit-breaker** (aborta la pasada
    entera, HTTP 409, si la intención cruda mueve demasiadas fechas o un % medio enorme) → solo fechas
    disponibles → escribe en Smoobu → audita en `pricing_applied` (`source='agente'`) + `pricing_decisiones`.
    `dryRun` por defecto TRUE.
  - **Paso 5 (cerebro):** skill `.claude/skills/pricing-agente/SKILL.md` para la sesión recurrente de Claude.
    Lee `pricing_aprendizaje` + mide outcomes → reúne variables (mercado por zona/fecha vía conectores MCP,
    eventos, ocupación, costes, características) → decide (máx. margen, pelotazo en eventos con ramp) → aplica
    por el Paso 4 → escribe aprendizaje. Memoria = BD (sesión efímera).
  - **Paso 5-bis (humano en el bucle, plataforma):** entrada de sidebar 🤖 Agente precios → `/agente`, chat
    (`app/(usuario)/agente/page.tsx` + `app/api/agente/chat/route.ts`). Alberto pregunta "¿por qué X el día Y?"
    (lee `pricing_decisiones.motivo`) y da instrucciones ("no bajes Busto de 120") que se guardan en
    `pricing_aprendizaje` y el agente respeta el próximo ciclo. NO escribe precios (solo el Paso 4).
  - **CI:** sivra/plataforma/ialimp/ia-rest deploy verde. `central-rrhh` falla (pre-existente, su `main` está
    roto; este PR no toca `apps/rrhh`). Verificado `tsc` sin errores nuevos en los ficheros añadidos.
  - **Pendiente (necesita a Alberto):** Paso 1 (datos) — lanzar `/api/pricing/pisos-zona` logueado en sivra
    para poblar zona/CP/aforo reales. Luego: Paso 3 (bootstrap mercado por piso/fecha con conectores, lo hago
    yo) y primeros ciclos del agente en dry-run antes de vivo.
- **📧 Skill `facturas-correo` creada (agente de facturas por email) — 16/06/2026**
  Nueva skill `.claude/skills/facturas-correo/SKILL.md`: agente PROGRAMADO que revisa el Gmail de
  Alberto, localiza facturas/justificantes, los clasifica (personal vs negocio deducible con las
  reglas de `lib/categorizar.ts`), archiva los deducibles en Drive (`Facturas/<año>/<negocio>`), los
  concilia contra `movimientos_bancarios` (Supabase) y deja un resumen en 3 bloques. Idempotente vía
  etiqueta Gmail `Facturas/Procesado`. Alcance v1 elegido por Alberto: **Leer + Drive + conciliar**.
  - **PENDIENTE DE ALBERTO (manual, 1 vez):** crear el **trigger diario en Claude Code web** con el
    prompt «Ejecuta la skill `facturas-correo`» (entorno con MCP de Gmail + Drive + Supabase conectados).
    Sin el trigger, la skill solo corre cuando él la pide. NO hay agente 24/7 — son pasadas programadas.

- **🏦 PLATAFORMA · Banca: clasificación IBI + revisión de gastos reales — 16/06/2026**
  Sesión de uso real con Alberto sobre los movimientos importados:
  - **Fix regla de categorización** (`lib/categorizar.ts`): el IBI del ayuntamiento caía en `proveedor`
    porque el banco trunca "AYUNTAMIENTO"→"AYUNTAMIEN" y la regla buscaba la palabra entera + no contemplaba
    "IBI". Ahora la regla de `impuestos` incluye `AYUNTAMIEN`, ` IBI ` (con espacios, para no chocar con
    "RECIBIDO"), `CONTRIBUCION`, `PLUSVALIA`. Los IBI futuros se auto-categorizan como 🏛️ Impuestos.
  - **IBI Monte Carmelo 68** (ref. catastral `4707007TG3440N0003TR`, 2× −171,55 € = mismo inmueble al 50%
    Alberto / 50% su mujer): corregidos a `categoria=impuestos` y **`destino=personal`** — es su **vivienda
    habitual**, NO deducible. (El Dúplex es Pasaje Francisco, no Monte Carmelo.) Hecho por SQL (Supabase MCP).
  - **Cargos duplicados** (PR #282, ya en prod): el caso "HORNO NUEVA FLORIDA −2,80 €" (5 compras repartidas)
    se clasifica correctamente como **"Sospecha baja"** y queda bajo el umbral del banner (5 €), así que no
    molesta en el dashboard. Confirmado que la feature ya hace lo pedido; Alberto silencia cada grupo con
    "Es normal" (→ `duplicado_estado='ignorado'`). NO se reconstruyó nada.

- **🧾 SIVRA · Contabilidad: REGLA de separación de cuentas anclada — 15/06/2026**
  La gráfica "Evolución mensual" del dashboard mezcla todo en un único Ingresos/Gastos → **a Alberto no le vale**
  (mezcla cuentas bancarias y mezcla lo personal con lo de los pisos = poco informativo). Regla fijada:
  **BBVA** = Duplex Center + seguros (unidad **aparte**); **Kutxa** = gastos personales + los **3 apartamentos
  turísticos**, que hay que sacar **limpios sin lo personal**. Los 3 turísticos (confirmado por Alberto):
  **Socorro = House Sevillana** (Calle Socorro 24, `prop_house_sevillana`), **Busto Tavera = Busto Reform**
  (`prop_busto_reform`) **+ Luxury Busto** (`prop_luxury_busto`). Duplex Center NO entra en esa P&L.
  Detalle + mapeo + gap del modelo de datos en **`apps/sivra/docs/contabilidad.md`** (enlazado desde
  `apps/sivra/CLAUDE.md` y router `sivra-maestro`). **Pendiente:** implementar la segregación + filtro mes/año
  + gráfico resumen en la vista "Mis apartamentos" / dashboard.

- **⚠️ `apps/plataforma` · Resolución de cargos duplicados (banca) IMPLEMENTADO — 15/06/2026 — PR #282 (draft)**
  El banner del dashboard ya detectaba "posibles cargos duplicados" (`getAlertas`) pero era ingenuo
  (falsos positivos con micro-gastos recurrentes, p. ej. HORNO NUEVA FLORIDA −3 €) y de solo lectura.
  Ahora es **fiable y accionable**, en 3 fases (todas pusheadas y desplegando en Vercel):
  - **F1:** columna aditiva `movimientos_bancarios.duplicado_estado` (NULL/ignorado/confirmado, migración
    `2026-06-15_banca_duplicados.sql` **ya aplicada** por Supabase MCP en `wswbehlcuxqxyinousql`).
    Lógica PURA y testeada en `lib/duplicados.ts` (`clasificarConfianza`, `superaUmbralBanner`,
    `esRecurrente`, `agruparDuplicados`; `lib/duplicados.test.ts`, 8 tests `node --test` verde). `lib/banca.ts`:
    `getDuplicadosSospechosos`/`getDuplicadosResueltos`/`resolverDuplicados`; `getAlertas` reusa la misma
    fuente con **umbral** (`DUP_UMBRAL_BANNER`, 5 €) → micro-gastos no disparan el banner. Excluye pares ya
    conciliados a facturas distintas. API `POST /api/banca/duplicados`. UI `DuplicadosBandeja` en `/banca`
    (resolver/deshacer + plegable "ya resueltos"); banner del dashboard enlaza a `/banca#duplicados`.
  - **F2:** borrador de reclamación IA (`lib/reclamacion.ts` con `aiComplete`, degrada a plantilla) +
    `POST /api/banca/duplicados/reclamacion` + botón/modal "Reclamar" en la bandeja.
  - **F3:** auto-detección de recurrentes (subconsulta de ocurrencias en 60 d → `esRecurrente` degrada a
    confianza baja). Verificado con datos reales: el IBI (recibo mismo día) sale como sospecha ALTA; HORNO
    (16/mes) y GALOS (19/mes) quedan silenciados.
  - **Spec:** `docs/superpowers/specs/2026-06-15-duplicados-bancarios-design.md`. **Plan:**
    `docs/superpowers/plans/2026-06-15-duplicados-bancarios.md`.
  - **Pendiente (opcional):** enganchar duplicados al email del cron `banca-alertas`.

- **✍️ `apps/rrhh` (iarrhh) FASE 2 — FIRMA ELECTRÓNICA AVANZADA (eIDAS art. 26) — 16/06/2026**
  Decisión: **firma propia** legalmente válida (no Firmafy ahora; avanzada basta para nóminas/contratos
  por art. 29 ET + STS 1023/2016). Firmafy queda **enchufable** como otro proveedor del puerto.
  - **Núcleo puro `@central/core-firma`** (`packages/core-firma`): puerto `ProveedorFirma` +
    `FirmaPropia`. `hashDocumento` (SHA-256/WebCrypto), `nombreCoincide`, `cumpleArt26`,
    `verificarIntegridad`, `TEXTO_CONSENTIMIENTO`, evidencia. Tests vitest **9/9**. Añadido a
    `transpilePackages` + `file:` dep en rrhh.
  - **Cómo cumple art.26:** (a) empleado teclea su nombre, se valida que coincide con el titular;
    (b) guarda nombre+email/DNI; (c) control exclusivo por **token personal** del empleado
    (`metodo='sesion_token'`; OTP email = refuerzo futuro); (d) **SHA-256 del documento** al firmar →
    alteración detectable.
  - **DB:** tabla `rrhh.firmas` (`prisma/migrations/0006_firmas.sql`, aplicada; FK a documentos
    ON DELETE CASCADE, RLS on). `documentos.estado_firma`: `no_requiere→pendiente→firmado`.
  - **App:** `lib/firma.ts` (`solicitarFirma`/`firmarDocumento`), `lib/storage.ts#descargarObjeto`,
    API `POST /api/admin/empleados/[id]/documentos/[docId]/solicitar-firma` (avisa al empleado) y
    `POST /api/e/expediente/[docId]/firmar` (avisa a responsables). UI: admin badge+"Solicitar firma";
    empleado badge+"Firmar" (modal consentimiento + teclear nombre). Spec:
    `docs/superpowers/specs/2026-06-16-rrhh-firma-avanzada-design.md`.
  - **Probado:** core-firma 9/9; build rrhh verde; integración BD (estado→firmado, evidencia,
    integro_original=true / integro_si_modificado=false, cascade) → datos de prueba borrados;
    `hashDocumento`==`node:crypto` SHA-256.
  - **Refuerzo OTP por email (hecho, 16/06/2026):** al pulsar "Firmar" se envía un código de 6 dígitos
    al email del empleado (tabla `firma_otps`, `0007_firma_otps.sql`, hash SHA-256, 10 min, 5 intentos);
    si se emitió, es obligatorio para firmar → `metodo='otp_email'`. **Degrada limpio:** sin email/SMTP
    se firma por sesión (`sesion_token`), la firma sigue válida. **Remitente: reusamos Resend de ia.rest**
    (`hola@iarest.es`, dominio verificado) con display **"iarrhh"** (`lib/mailer.ts` sobre `@central/core-email`;
    `notificar.ts` migrado a ese mailer). **Requiere `RESEND_API_KEY` en el proyecto Vercel central-rrhh**
    (mismo valor que ia-rest); sin ella, OTP no se envía y se firma por sesión. Endpoint
    `POST /api/e/expediente/[docId]/firmar/codigo`. Probado: build verde + integración BD (upsert resetea
    intentos, hash válido, firma `otp_email`, OTP consumido) → datos borrados.
  - **Pendiente:** poner `RESEND_API_KEY` en central-rrhh (Vercel) para activar el OTP en vivo; proveedor
    **Firmafy** (cuando Alberto tenga alta/credenciales — el flujo rrhh no cambia, solo se elige proveedor).
    **Precio** al cliente.

- **🎨🏢🔑 `apps/rrhh` (iarrhh) — REDISEÑO + ALTA DESDE GOD-PANEL + CAMBIO PASS — 15/06/2026 — PRs #276/#278/#279/#280**
  Marca propia **iarrhh** (no del cliente). Todo en producción y **verificado en vivo**.
  - **Rediseño visual (#276):** vestida toda `apps/rrhh` con la imagen de la casa (estilo ia-rest):
    paleta papel/tinta + acento **teal `#2B6A6E`**, fuentes Inter Tight/Newsreader/JetBrains Mono,
    sidebar admin (`components/AdminShell.tsx`), wordmark `ia·rrhh` (`components/Wordmark.tsx`),
    monograma SVG (`public/icon.svg`), portal del empleado móvil-primero. Tokens en `globals.css` +
    `tailwind.config.ts`. **Sin tocar lógica/API/datos.** Spec: `docs/superpowers/specs/2026-06-15-iarrhh-rediseno-visual-design.md`.
  - **Alta de empresa desde el god-panel (#278):** el operador crea empresa cliente + responsable desde
    **plataforma → `/operador/clientes` → ➕ Nuevo cliente → "RR.HH. · iarrhh"**. Arquitectura **puerto HTTP**
    (patrón ia-rest, NO escritura directa cross-schema): rrhh expone `GET/POST /api/operador/empresas`
    (`lib/operador.ts` + ruta); plataforma lo consume con `lib/adapters/rrhh.ts` (vertical `'rrhh'` en el
    contrato `VerticalAdapter`). El responsable luego entra en iarrhh y crea a sus empleados.
    Spec: `docs/superpowers/specs/2026-06-15-alta-empresa-rrhh-god-panel-design.md`.
  - **⚠️ LANDMINE de secretos (#279):** `OPERADOR_SHARED_SECRET` en plataforma **YA ES** el secreto del
    puerto god-panel↔**ia-rest**. Reutilizarlo para rrhh rompía la integración ia-rest. **Desacoplado:**
    iarrhh usa su **propio** `RRHH_OPERADOR_SECRET`. NO volver a colapsarlos.
  - **Cambio de contraseña del responsable (#280):** `/admin/cuenta` (`POST /api/auth/cambiar-password`),
    ítem "Mi cuenta" en el sidebar.
  - **Envs (3 proyectos Vercel):**
    - `central-rrhh`: `RRHH_OPERADOR_SECRET`.
    - `plataforma`: `RRHH_OPERADOR_SECRET` (mismo valor que central-rrhh) + `RRHH_URL` (=`https://central-rrhh.vercel.app`)
      + `OPERADOR_SHARED_SECRET` (este es el de ia-rest, valor compartido con el proyecto `ia-rest`).
    - `ia-rest`: `OPERADOR_SHARED_SECRET` (mismo valor que en plataforma).
  - **Verificado en vivo:** Alberto creó una empresa de prueba por el panel → fila correcta en BD (cadena
    UI→plataforma→HTTP→rrhh→BD OK) → borrada. BD queda con 1 empresa real: **Mariscos González** (responsable
    **Pilar Piña** `pilar.pina.franco@gmail.com`; contraseña reseteada a `Mariscos2026` para onboarding,
    cambiable desde Mi cuenta).
  - **Pendiente:** firma avanzada vía **Firmafy** (Fase 2, necesita alta/credenciales con el partner —
    acción de Alberto; dejar montado puerto `core-firma`); **precio** al cliente.

- **🧑‍💼 NUEVA VERTICAL `apps/rrhh` · Portal del Empleado — Fase 1 cimiento IMPLEMENTADO — 15/06/2026 — PR #269**
  Petición de Pilar (RR.HH. de Mariscos González, audio): intranet de empleados con expediente
  documental por trabajador (carpetas: datos personales/contratos/nóminas/partes médicos/otros, subida
  **bidireccional**), **firma electrónica avanzada** (eIDAS art. 26 — basta avanzada para nóminas/contratos
  por art. 29 ET + STS 1023/2016; NO cualificada), chat y solicitudes (vacaciones/permisos/parte médico).
  - **Spec:** `docs/superpowers/specs/2026-06-15-apps-rrhh-portal-empleado-design.md`. **Plan Fase 1:**
    `docs/superpowers/plans/2026-06-15-rrhh-fase1-cimiento.md`.
  - **Arquitectura definitiva (decisión 15/06):** se aprovecha que Sique Brilla (ialimp) está **inactivo**
    para crear paquetes compartidos sin duplicar: **`core-firma`** (núcleo firma), **`module-chat`** (ialimp
    lo adopta, rrhh lo consume; datos por `cuenta_id` en plataforma cuando haya cliente multi-producto) y
    **`module-documental`** (motor de expedientes agnóstico de entidad sobre `core-storage`; rrhh lo estrena,
    ialimp migra después JSONB→tablas). Chat NO como app/servicio propio (rompe la matriz).
  - **Firma proveedor:** investigación comparada (Firmafy/Signaturit/DocuSign/Viafirma/Click&Sign/Tecalis).
    Para el piloto → **Firmafy** (avanzada biométrica + 6 evidencias + custodia 10 años + Programa Partners)
    o Click&Sign (pago por uso). Adaptador `self-hosted` (PAdES + RFC 3161) a futuro. Pendiente cotización partner.
  - **IMPLEMENTADO (cimiento, probado):** scaffold `apps/rrhh` (Next 15, espejo de ialimp), Prisma schema
    (`empresas`, `usuarios_rrhh`, `empleados`), auth JWT responsable (`lib/auth.ts`/`lib/tenant.ts`, sesión
    única por jti) + acceso empleado por enlace mágico+PIN (`lib/empleado-auth.ts`), lógica de empleados con
    tests (`lib/empleados.ts` + `.test.ts`, **3/3 verde**), API empleados acotada por `empresa_id`
    (alta/lista/editar/baja), rutas login/logout, UI mínima (`/login`, `/admin/empleados`, `/e/[token]`).
    **`next build` verde** (10 rutas). `vitest` verde.
  - **🗄️ BD RESUELTA (15/06, decisión Alberto = gratis):** no se pudo crear proyecto Supabase dedicado
    (org al **límite de 2 proyectos gratis**: `wswbehlcuxqxyinousql` + `efncqyvhniaxsirhdxaa`). Se optó por
    **schema `rrhh` en el proyecto COMPARTIDO** (`wswbehlcuxqxyinousql`), aislado del `public` de
    ialimp/sivra/plataforma. **Migración `rrhh_0001_cimiento` APLICADA** (3 tablas `rrhh.empresas/
    usuarios_rrhh/empleados`, RLS activado, verificadas). No afecta a las otras apps (schema y tablas
    propias). La conexión de rrhh usará `DATABASE_URL` con `?schema=rrhh`. **Migrable a proyecto dedicado**
    cuando se pase a plan de pago (mejor aislamiento RGPD de los datos de salud). Pendiente: cargar env
    `DATABASE_URL`/`JWT_SECRET`/keys en el (futuro) proyecto Vercel `rrhh`.
  - **📁 `module-documental` IMPLEMENTADO + expediente en rrhh (15/06):** nuevo paquete
    **`packages/@central/module-documental`** = motor de expedientes **AGNÓSTICO DE ENTIDAD** (puro, sin BD/
    Storage): `tipos.ts` (OwnerRef opaco, Actor `gestor|titular`, ConfigCarpeta), `permisos.ts`
    (puedeSubir/puedeVer/carpetasVisibles, indexarCarpetas), `documental.ts` (validarSubida +
    construirPathStorage `<tipo>/<id>/<carpeta>/<uuid>.<ext>`). **Tests 8/8 verde.** Las categorías,
    permisos y Storage los inyecta cada vertical (rrhh lo estrena; ialimp migrará después su JSONB).
  - **rrhh consume el módulo** vía `file:` deps + `transpilePackages` (`@central/module-documental` +
    `@central/core-storage`). `lib/carpetas.ts` (taxonomía empleado: datos_personales/contratos/nominas/
    partes_medicos/otros + permisos por carpeta), `lib/storage.ts` (subir/borrar con service_role + URL
    firmada vía core-storage), `lib/documental.ts` (listar/subir/borrar, scope empresa+empleado). API:
    `/api/admin/empleados/[id]/documentos` (GET expediente con URLs firmadas, POST subir FormData) +
    `[docId]` (DELETE). **Tabla `rrhh.documentos` APLICADA** + **bucket privado `rrhh-documentos` creado**.
    `next build` verde.
  - **🖥️ UI del expediente IMPLEMENTADA (ambos lados) — 15/06:** lado **gestor** `/admin/empleados/[id]`
    (`ExpedienteClient.tsx`: carpetas con subir/descargar por URL firmada/borrar) + lado **empleado** `/e`
    (`getSesionEmpleado` lee cookie, `ExpedienteEmpleado.tsx`: ve sus carpetas visibles y **sube solo donde
    el módulo lo permite** — datos personales y partes médicos). API `/api/e/expediente` (GET/POST, actor
    `titular`). `/e/[token]` redirige a `/e` tras login. **Flujo documental BIDIRECCIONAL completo.**
    `next build` verde (16 rutas).
  - **💬 `module-chat` IMPLEMENTADO + chat en rrhh — 15/06:** nuevo paquete `packages/@central/module-chat`
    (motor puro de mensajería 1-a-1 gestor↔titular: tipos, `noLeidos`, `contraparte`, `ordenarCronologico`,
    `validarTexto`; **tests 4/4 verde**). rrhh lo consume (`file:` + transpilePackages): tabla
    `rrhh.mensajes` (un hilo implícito por empleado, leído por parte) **aplicada**, `lib/chat.ts`
    (listar+marca leído / enviar, scoped por empresa), API `/api/admin/empleados/[id]/chat` (gestor) +
    `/api/e/chat` (empleado), y **`components/ChatPanel.tsx`** reutilizable (polling 5s) embebido en el
    expediente del gestor y en `/e`. `next build` verde. (Datos por `cuenta_id` en plataforma = unificación futura.)
  - **📝 SOLICITUDES self-service IMPLEMENTADAS — 15/06:** flujo empleado→gestor (HR-específico, nativo en
    rrhh, no paquete). Tabla `rrhh.solicitudes` **aplicada** (tipo vacaciones/permiso_retribuido/parte_medico/
    baja/otro, estado solicitada→aprobada/rechazada). `lib/solicitudes.ts` (crear/listar/resolver + validación
    de fechas/tipo). API: `/api/e/solicitudes` (empleado crea/ve), `/api/admin/solicitudes` (+`?pendientes=1`)
    y `/[id]` PATCH (aprobar/rechazar). UI: bandeja `/admin/solicitudes` + bloque en el portal `/e`. `next
    build` verde (16 páginas).
  - **📧 NOTIFICACIONES EMAIL integradas (listas para claves) — 15/06:** `lib/notificar.ts`
    (`avisarResponsables`) avisa por email a los `usuarios_rrhh` cuando el empleado **sube un documento,
    crea una solicitud o escribe por el chat**. Usa `nodemailer` DIRECTO (no `core-email`: su bundle fallaba
    por symlinks/webpack "Can't resolve nodemailer"). Best-effort/no-op si no hay SMTP → funciona al cargar
    `SMTP_HOST/PORT/USER/PASSWORD`. **Trampa de build resuelta:** un comentario JSDoc con `SMTP_*` seguido de
    `/` cerraba el bloque `/* */` (evitar `*` + `/` en comentarios). `next build` verde.
  - **🔔 PWA + WEB PUSH integrados (listos para claves) — 15/06:** `public/{manifest.json,icon.svg,sw.js}`
    + `RegisterSW` (PWA instalable; SW con handler `push`/`notificationclick`). Tabla
    `rrhh.push_subscriptions` **aplicada**. `lib/push.ts` (`web-push` DIRECTO, no core-push, mismo motivo
    que email) con `pushResponsables`/`pushEmpleado` (no-op sin VAPID, borra subs 410/404). Subscribe:
    `/api/admin/push/subscribe` (gestor) + `/api/e/push/subscribe` (empleado). Botón `ActivarPush` en
    `/admin/empleados` y `/e`. Push enganchado junto al email en las 3 acciones del empleado (doc/solicitud/
    mensaje → responsables). `next build` verde. **VAPID generadas (entregadas a Alberto para el env), NO
    commiteadas.**
  - **PENDIENTE (necesita Alberto):** proyecto **Vercel `rrhh`** + env (`DATABASE_URL?schema=rrhh`,
    `JWT_SECRET`, Supabase url/anon/service_role, opcional SMTP_*, VAPID público+privado). **Fase 2:** firma
    (Firmafy, cotización partner). **Precio:** diferido. (Push y email ya funcionan al cargar sus claves.)
- **🏦 PLATAFORMA · Banca: análisis + fiscal + operativa — 15/06/2026 — PR #272 (MERGED)**
  Construido el menú completo de ideas sobre el modelo existente (`movimientos_bancarios`, `destino`,
  `categoria`), sin migraciones.
  - **Dashboard**: comparativa "este mes vs anterior" (`getComparativaMensual`), desglose de gastos por
    categoría del año (`getGastosPorCategoria`, barras CSS), banner de alertas accionables
    (`getAlertas`: nº por revisar + posibles cargos duplicados por mismo importe+contraparte en ±4 días).
  - **/banca**: buscador + filtros cliente (texto/ingreso-gasto/categoría, `MovimientosTabla`), neto por
    negocio últimos 6 meses (`getEvolucionPorDestino`, tabla), estimación fiscal orientativa por trimestre
    (`lib/fiscal.ts` `getEstimacionFiscal`: IVA 21% + IRPF fraccionado 20%, con aviso de que la real la
    hace el gestor), y **Exportar CSV** (`/api/banca/export`, sep `;` + coma decimal + BOM).
  - `CATEGORIA_LABEL` movido a `lib/categorizar.ts` (compartido dashboard/banca). Verificado `tsc` + `next build`.
  - **PENDIENTES (decisión de Alberto, NO urgente):**
    1. **⏳ PENDIENTE DE VERIFICAR — clasificar gastos de tarjeta que siguen en `personal`**:
       GALOS CMI (~911 €, 38×), **Amazon (49 compras, −1.619 €, +446 € devuelto → neto −1.173 €; pico
       en dic = regalos, pinta personal)**, JHS Sevilla (~138 €). El concepto bancario NO trae el
       producto → Alberto verifica en "Tus pedidos" de amazon.es (y los otros) qué es negocio
       (deducible) y qué personal, y luego se recolocan los `destino`/`categoria`.
    2. **🗂️ Controlar que cada gasto tenga su FACTURA en Google Drive — y si no, subirla.** Para los
       gastos deducibles hay que tener el justificante archivado. Idea: cruzar movimientos (sobre todo
       los deducibles de negocio) contra las facturas en Drive (vía MCP `Google_Drive`), marcar los que
       no tengan factura localizada y subir/pedir las que falten. Conecta con la conciliación y con el
       OCR de facturas (`/api/banca/factura`) ya existentes.
    3. **Rotar la clave privada de Enable Banking** (se vio en chat durante el debug; higiene, opcional):
       regenerar y reemplazar `ENABLEBANKING_PRIVATE_KEY` en el proyecto Vercel `plataforma`.

- **🧾 IA-REST · E-recibo digital MVP IMPLEMENTADO (QR en ticket de cuenta) — 15/06/2026 — PR #256**
  Ejecutado el plan `apps/ia-rest/docs/superpowers/plans/2026-06-15-e-recibo-digital.md` (subagent-driven).
  - **Tabla nueva `iarest.recibos_digitales`** (token único + snapshot JSONB autocontenido + RLS service_role).
    Migración aplicada en el proyecto compartido `wswbehlcuxqxyinousql`, schema `iarest`.
  - **`src/lib/recibo.ts`**: tipo `ReciboSnapshot`, `generarTokenRecibo()` (16 bytes base64url),
    `crearReciboDigital()` (insert, devuelve token; no bloquea impresión si falla).
  - **`src/lib/courier.ts`**: en `crearPrintJobCuenta` se crea el recibo (snapshot + token) y se imprime
    un **bloque QR ESC/POS** (`escposQR`, modelo 2) en el ticket de cuenta → `iarest.es/recibo/[token]`.
    El fallback de texto plano imprime la URL. `aeat` queda `null` (la factura legal se emite en cobro, no al pedir cuenta).
  - **Ruta pública `src/app/recibo/[token]/page.tsx` + `ReciboView.tsx`**: server component, token = secreto
    (sin sesión), diseño mobile-first con tema `C` (avatar inicial + nombre + items + total + IVA + AEAT si hay).
    `next build` OK, ruta `ƒ /recibo/[token]`.
  - **Fase 2 pendiente:** descargar PDF · pedir factura con NIF desde el móvil · email · marca avanzada
    por restaurante (logo/color en `restaurantes` — hoy no existen esos campos).

- **🏨 PLATAFORMA: detalle completo por apartamento — PR #255 (MERGED) — 15/06/2026**
  Ficha enriquecida en `/apartamentos` y nueva página `/apartamentos/[id]` con analítica completa por piso.

  - **`lib/propiedades.ts`**: `getPropiedades()` enriquecida con ocupación %, ADR y top portal del mes (10 queries paralelas). Nueva función `getApartamentoDetalle(id)` con KPIs mes/año/YoY, próximas reservas, últimas 20, mix de portales, histórico 12 meses, gastos por categoría (tabla `gastos`, no `expenses`) + gastos compartidos.

  - **`/apartamentos`**: tarjetas con barra de ocupación visual (verde ≥70%, ámbar ≥40%, rojo), ADR y portal principal. Cada tarjeta es link a `/apartamentos/[id]`.

  - **`/apartamentos/[id]`** (nuevo server component):
    - 8 KPIs: ingresos mes (con YoY %), gastos mes, resultado, ocupación %, ADR, ingresos YTD, gastos YTD, resultado YTD
    - Gap detector: detecta huecos entre reservas próximas y muestra `⚠️ Huecos libres: Xd (fecha → fecha)`
    - Break-even: `Math.ceil(gastosFijos / 12 / adr)` noches/mes para cubrir costes fijos (ALQUILER+COMUNIDAD+SEGURO)
    - Mix de portales con barras de % visuales
    - Histórico mensual 12 meses (más reciente primero) con ocupación visual
    - Gastos por categoría con iconos (incl. SEGURO 🛡️) + gastos compartidos como referencia
    - Últimas 20 reservas con bruto/neto

- **🔑 SIVRA: Smoobu key unificada → fuente única en BD (14/06/2026)**
  La API key de Smoobu estaba duplicada: en `SMOOBU_API_KEY` (env de Vercel, que usaba TODO sivra) y en
  `pms_connections.smoobu_api_key` (BD, lado ialimp/limpiezas). Misma key, dos sitios → riesgo de drift al rotar.
  Unificado: nuevo `apps/sivra/lib/smoobu.ts` (`getSmoobuKey()`) lee la key de la **BD** (`pms_connections`, fila
  de Alberto `c8c1fb07-…`, seleccionada por id porque la tabla es multi-tenant), con el env **solo como respaldo**.
  Migradas las **12 rutas** que hablaban con Smoobu (pricing apply/restore, rates, rates/snapshot, mensajes/*,
  updates/sync, limpiadoras auto-sessions y alerta-ventana). Ahora se **rota en un único sitio** (la conexión de
  ialimp) sin redeploy. Verificado: la consulta del helper devuelve la key (32 chars, activa) y `tsc` limpio.

- **🚨 SIVRA pricing: PAUSA GLOBAL activada — bug de techo en fechas de evento (14/06/2026)**
  Entró la **1ª reserva de Busto Reform** (Emilio J. Martín, 25-28 mar 2027 = **Semana Santa**, vendida al base
  previo de Smoobu ~307-319€/noche; **NO** a precio de nuestro motor — `pricing_applied` vacío para esas fechas).
  Al verificar, se destapó un fallo serio: ahora que `apply` corre los **365 días** sin timeout (fix #213), el cron
  `apply-auto` (08:30) **capaba a `max_price`=125€** todas las fechas de evento. La guardia de confianza es **por
  piso, no por fecha** (Busto: 14 comps, 5d → pasa), y el motor usa **un único percentil de mercado** (~168€, de
  fechas normales) para todo el año, rematando con el techo del piloto **al final de la cadena**. Impacto medido:
  **172 fechas disponibles >125€** (Semana Santa + **Feria de Abril 2027** a 366€) → ~**9.788€ base** en riesgo.
  - **Acción inmediata (hecha):** `UPDATE pricing_config SET paused=true WHERE id=1` → el cron degrada a
    simulación (`dryRun` forzado), **no escribe en Smoobu**. Verificado que `apply` lo lee. Reserva intacta
    (reservada ≠ `available`). **Contrapartida:** también se congela el pricing al alza de fechas normales.
  - **PENDIENTE (fix de producto, PR aparte):** techo **event-aware** (`max_price × eventFactor` o "nunca bajar
    una fecha de evento por debajo de su base actual") + comps **por fecha/temporada** (no un percentil único) +
    guardia de confianza por fecha. Reactivar la pausa SOLO tras el fix. Detalle en `pricing-automatico.md` §9.

- **🧾 IA-REST · IDEA (no implementada): ticket moderno + e-recibo digital — 15/06/2026**
  Alberto comparte `receiptmaker.ai` (generador de recibos por IA → PDF/imagen con logo,
  colores, tipografías; familia receiptmaker.io/.org, muchas orientadas a recibos "fake/demo").
  Análisis con contexto del código real (`apps/ia-rest/src/lib/courier.ts`):

  - **Trampa clave:** ia.rest NO imprime PDF/imagen. Imprime **ESC/POS térmico** (80mm,
    48 chars monoespaciados, codepage PC437, **monocromo, sin tipografías**). El output de
    receiptmaker **no es replicable en térmica** → sirve como *inspiración de layout/jerarquía*,
    NO como solución técnica.
  - **Lo que ve el cliente hoy:** `generarEscPosCuenta()` (ticket de cuenta) + QR AEAT VeriFactu
    (`generarTicketCuenta()`). La comanda de cocina (`generarEscPos`) es interna.

  - **Dos frentes de "modernizar" (decisión pendiente de Alberto):**
    1. **Ticket térmico** — margen acotado: añadir **logo raster** (ESC/POS `GS v 0`, bitmap
       monocromo), mejor jerarquía/espaciado, aprovechar mejor el QR. Pulido, no revolución.
    2. **E-recibo digital** — *aquí brilla la inspiración de receiptmaker*: e-ticket **HTML**
       con logo/colores/tipografía reales, enviado por **email (Resend, ya existe)** o accesible
       por **QR impreso** ("ve tu recibo / pide factura aquí"). Encaja con infra existente
       (sesiones QR `qr_sesiones_cliente`, `verifactu`, email). **Recomendación:** este es el
       movimiento diferenciador, no pelear contra la térmica.

  - **Estado:** solo análisis guardado. Rama de trabajo abierta `claude/modern-ticket-design-r4ngkz`
    por si se decide implementar (con brainstorming antes de tocar código).

- **🎛️ PLATAFORMA: panel unificado — un solo shell (Mi negocio + Operador) — PR #249 (MERGED) — 15/06/2026**
  Dos zonas separadas (usuario `/dashboard` + god-panel `/admin`) unificadas en una sola pantalla con sidebar único, tema claro y un solo login.

  - **Auth unificado:** `app/api/auth/login/route.ts` ahora emite ambas cookies (`plataforma_session` + `plataforma_admin`) cuando el email coincide con un superadmin activo. Nuevo helper `findActiveAdminByEmail(email)` en `lib/superadmin.ts` (solo lectura, sin bcrypt, sin escrituras). `logout` borra ambas cookies.

  - **Sidebar único con dos grupos:**
    - *Mi negocio* (siempre): Resumen · Banca · 🏨 Apartamentos · 🧹 Limpiezas · 💬 Comunicación
    - *Operador* (solo si sesión de superadmin): 🏢 Clientes · 🍽️ ia-rest · 🗺️ Estructura

  - **Nuevas páginas — Mi negocio:**
    - `/apartamentos`: tarjetas de los 4 pisos sivra con KPIs del mes + próxima reserva (`getPropiedades()` de `lib/propiedades.ts`)
    - `/limpiezas`: portal propietario ialimp embebido en iframe sin segundo login (`getPropietarioAccessToken`)

  - **Nuevas páginas — Operador (tema claro, mismas APIs `/api/admin/*`):**
    - `/operador/clientes`: lista por vertical, bloquear/liberar, modal 360, modal nuevo cliente (`ClientesClient.tsx`)
    - `/operador/estructura`: `MapaArquitectura`
    - `/operador/iarest`: placeholder + enlace directo

  - **Corrección conciliación bancaria:** `candidatosSivra()` en `lib/conciliacion.ts` leía `expenses` (34 filas, congelada desde abril). Corregido a `gastos` (71 filas, tabla real del agente IA de sivra). Recupera ~37 gastos invisibles (€5.670). `gastos.propiedad` usa el mismo slug que `properties.id` = `negocio.refExt`.

  - **PWA:** `public/manifest.json` + `public/icon.svg` + metadata en `app/layout.tsx`.

  - **Command palette Cmd/Ctrl+K:** `CommandPalette.tsx` sin deps externas, overlay claro, filtro por texto, teclas ↑↓↵.

  - **Strip "Hoy" en dashboard:** check-ins/check-outs del día + movimientos bancarios del día. Solo se muestra si hay actividad.

  - **Limpieza BD:** sociedad "Sique Brilla SL" (y su negocio) eliminada de la cuenta de Alberto en plataforma (tablas `sociedades`/`negocios`). **NO toca ialimp** — la empresa de Vanessa sigue operativa.

  - **`/admin` sigue vivo** como fallback. Siguiente paso: convertirlo a redirect cuando Alberto confirme que `/operador/clientes` funciona bien.

- **🏦 PLATAFORMA: conexión bancaria PSD2 EN VIVO (Enable Banking) + categorización IA diaria — 14/06/2026**
  La consolidación bancaria pasó de "código inerte" a **funcionando con datos reales de Alberto**. Larga sesión.
  - **Enable Banking en producción (restricted mode = GRATIS para cuentas propias)**: tras descartar GoCardless
    (altas cerradas), el conector PSD2 corre sobre **Enable Banking**. El **tier gratuito "restricted/linked accounts"
    permite conectar TUS PROPIAS cuentas sin contrato ni pago** (solo el modo comercial para cuentas de terceros es de
    pago). Auth = **JWT RS256** firmado con la clave privada de la app (kid=APP_ID, aud=api.enablebanking.com).
    Variables en Vercel (proyecto plataforma): `ENABLEBANKING_APP_ID` + `ENABLEBANKING_PRIVATE_KEY`.
  - **Conectadas y sincronizando a diario**: **Kutxabank** (IBAN real, 257 mov incl. histórico Q1 del Excel fusionado)
    y **BBVA** (73 mov). Saldo del grupo real **41.186,94 €**. App Enable Banking activa: `ff26f315-…`.
  - **Trampas resueltas (todas reales, documentadas para la próxima)**:
    1. `DECODER routines::unsupported` → la clave se pegó **sin cabecera PEM** (solo cuerpo base64). `cargarClavePrivada()`
       en `lib/enablebanking.ts` ahora tolera: PEM normal, en una línea, con comillas, `\n` escapados, **cuerpo base64
       suelto (DER pkcs8/pkcs1/sec1)** y PEM re-codificado en base64.
    2. `Wrong signature` → la clave privada en Vercel **no era la pareja** del certificado registrado (Enable Banking NO
       tiene botón de regenerar; el cert se fija al **crear** la app). Solución: **crear app nueva** y usar App ID + clave
       privada **de esa misma creación atómica**. Verificado por **huella SHA-256 de la clave pública** derivada.
       OJO Vercel: una env var nueva **solo entra en despliegues creados DESPUÉS de guardarla** (hizo falta Redeploy real).
    3. Transacciones vacías → el endpoint **exige `date_from`** y **PSD2 limita a ~90 días** (>90d → 422
       `WRONG_TRANSACTIONS_PERIOD`). Se piden 89 días.
    4. Timeout 504 al conectar Kutxa → el callback insertaba mov **uno a uno**. Ahora **inserción en bloque**
       (`Prisma.join`) + `maxDuration=300` en callback y cron. Idempotente (dedupe por `entry_reference`).
  - **Endpoints/lib**: `lib/enablebanking.ts` (cliente JWT), `lib/psd2.ts` (sincroniza por `session_id` guardado en
    `conexiones_banco.requisition_id`), `psd2/{instituciones,conectar,callback}` + cron `psd2-sync`. (Hubo un endpoint
    temporal `/api/cron/psd2-diag` para depurar la clave **sin exponer secretos** — ya retirado.)
  - **Auto-categorización IA diaria + "Por revisar" (PR #242)**: el cron `psd2-sync`, tras sincronizar, **categoriza con
    IA** los movimientos nuevos; cuando **duda marca `requiere_revision=true`** (columna nueva) y en `/banca` sale la
    bandeja **🔎 Por revisar** donde el dueño asigna categoría (`POST /api/banca/revisar`). Degrada sin `NVIDIA_API_KEY`.
  - **PENDIENTE de Alberto**: (a) **`NVIDIA_API_KEY`** (gratis, NVIDIA NIM) en el Vercel de plataforma para que la
    categorización IA etiquete de verdad; (b) **rotar la clave privada** de Enable Banking (se compartió un `.pem` en el
    chat durante la depuración — riesgo bajo en restricted mode/solo-lectura de cuentas propias, pero conviene rotarla).

- **🧹 IALIMP: portal del propietario responsive en escritorio (sidebar fija) — PR #239 — 14/06/2026**
  Alberto reportó que el **portal del propietario** (`/propietario/[token]` y `/propietario` por email+contraseña,
  ambos `PropietarioClient.tsx`) se veía en PC como una columna móvil estrecha centrada (`maxWidth:1080`), con las
  tarjetas amontonadas a la izquierda. Arreglo solo en `PropietarioClient.tsx`:
  - **Escritorio (≥1024px):** barra lateral de navegación **fija** a la izquierda (248px: logo, propietario, los
    `MENU_ITEMS`, cerrar sesión); el contenido ocupa el ancho disponible (tope 1280px centrado) y las rejillas
    `auto-fill` reparten 3-4 columnas. Se oculta el botón hamburguesa (`.prop-hamburger`).
  - **Móvil (<1024px, sin cambios):** header con hamburguesa + drawer, una columna fluida.
  - **Excepción consciente a la regla "no media queries"** de `apps/ialimp/CLAUDE.md`: una sidebar solo-PC necesita
    un breakpoint, así que se usa **una única media query** dentro del bloque `<style>` que el componente ya inyectaba,
    **acotada solo al portal** (clases `.prop-root`/`.prop-deskbar`/`.prop-hamburger`/`.prop-content`). No se toca el
    resto de la app. Build local no viable en el contenedor (deps `workspace:*` del monorepo no resuelven con npm
    aislado) → validado con **typecheck ialimp + preview de ialimp verdes** antes de mergear (cliente en vivo).

- **🤖 AUTOMATIZACIÓN: comando `/auditoria-diaria` (reconciliación memoria/skills) — PR #237 (MERGED) — 14/06/2026**
  Alberto preguntó si el "agente arquitecto" podría revisar 1×/día las conversaciones y actualizar la memoria/skills.
  **Matiz clave aclarado:** las conversaciones NO persisten (entorno efímero) → no se pueden "releer". El equivalente
  útil que SÍ funciona: auditar lo que persiste (código+infra+docs) y reconciliar con ello la memoria/skills.
  - Nuevo **`.claude/commands/auditoria-diaria.md`**: slash-command (y prompt para un **trigger programado**) que
    encuadra por `git log` desde la última auditoría (sin commits → no abre PR), corre la skill `auditoria-central`
    completa, genera `docs/AUDITORIA-<mes>.md`, reconcilia `CONTEXTO-SESIONES.md` + skills-maestro + `apps/*/CLAUDE.md`
    con la realidad (si discrepan, manda el código), arregla solo bugs de bajo riesgo y entrega un **PR draft** con el
    informe. Complementa (no sustituye) al hook `Stop` `persist-memoria.sh`.
  - **Pendiente de Alberto (acción manual):** crear el trigger programado 1×/día en Claude Code web (triggers /
    scheduled sessions) sobre `central` con prompt `/auditoria-diaria`. El cron NO se configura desde el repo.

- **📱 PLATAFORMA: god-panel `/admin` 100% adaptable a móvil (hamburguesa plegable) — PR #236 (MERGED) — 14/06/2026**
  Alberto reportó (con captura del móvil en `flame.vercel.app`) que el panel de control no era usable en móvil:
  la barra lateral fija de 200px (`<nav>` con pestañas Negocios/ia-rest/Sivra/Estructura) se comía el ancho y
  dejaba los KPIs y las tarjetas de clientes en una columna estrujada. Pidió "hamburguesa plegable".
  - **Cambio (solo `apps/plataforma/app/admin/page.tsx`, presentación pura, sin tocar datos/auth/queries):**
    detección de viewport con `window.matchMedia('(max-width: 768px)')` (estados `isMobile` + `menuOpen`,
    coherente con el patrón del fichero: inline styles, sin Tailwind). En **móvil** el `<nav>` pasa a **drawer
    fijo** (`position:fixed`, `transform: translateX(-100%/0)`, transición .25s) que se abre con un botón
    **hamburguesa ☰** en la cabecera; backdrop semitransparente que cierra al tocar fuera; se cierra solo al
    elegir pestaña o pulsar ✕; el nombre del operador se mueve dentro del drawer y "Nuevo cliente" se compacta a
    ➕. En **escritorio** comportamiento idéntico al anterior (barra fija 200px).
  - CI: los 4 deploys de Vercel (plataforma, ialimp, sivra, ia-rest) **Ready**. Mergeado en squash.

- **🧹 IALIMP: arreglo "No autenticado" + bloqueo 2º login + pantalla Incidencias + revisar limpieza hecha — PRs #231/#233/#234 (MERGED) — 14/06/2026**
  Sesión a raíz de un problema EN VIVO de Vanessa (Sique Brilla): al subir limpiezas le salía **"No autenticado"**
  y, al elegir cliente en *Nueva limpieza*, *"Este cliente no tiene propiedades creadas"* (FALSO: AITANA ORTIZ
  MOGOLLON tiene 7 pisos, verificado en Supabase). Diagnóstico: su sesión era rechazada (sesión única: un 2º login
  desde el móvil rotaba el `session_jti` y **expulsaba** al portátil), y las rutas `/api/admin/*` devolvían el
  fallo de auth como **500 `{error:'No autenticado'}`** que el modal se tragaba mostrando "sin pisos".
  - **PR #231 (MERGED)** — `lib/tenant.ts`: clase `AuthError` (401) + helper `apiError(e)` (401 si AuthError, 500
    si no); rutas `propiedades`/`sesiones`/`sesiones[id]` lo usan. `NuevaLimpiezaModal` distingue 401 (sesión
    cerrada → aviso + `/login`), error de carga (mensaje + reintentar) y "sin pisos" real.
  - **PR #233 (MERGED)** — **2º login = BLOQUEO con aviso, NO expulsión** (decisión de Alberto: mantener 1
    dispositivo). Migración **`2026-06-14_sesion_activa.sql`** (flag `sesion_activa` en `empresas` y
    `usuarios_empresa`, APLICADA en Supabase). `/api/auth/login` y `login-usuario`: si `sesion_activa` y no
    `forzar` → **409 `{sesion_abierta:true}`**; `/login` muestra «Ya hay una sesión abierta» + botón **«Entrar
    aquí y cerrar la otra»** (reintenta con `forzar:true`, rota jti y expulsa al otro). `/api/auth/logout` pone
    `sesion_activa=false` (sin tocar jti, para no resucitar tokens por la regla de gracia). Sin lockout: el forzar
    siempre entra. El propietario (`clientes`) sigue con expulsión por jti.
  - **PR #234 (MERGED)** — respondiendo a Vanessa («¿dónde salen incidencias, el OK de la limpieza y el chat?»):
    (1) **Pantalla de Incidencias** `/admin/incidencias` (menú **⚠️ Incidencias**) + `GET/PUT /api/admin/incidencias`
    (tabla `incidencias` sin `empresa_id`, se acota por `property_id IN (sesiones de la empresa)`; urgentes primero;
    marcar resuelta/reabrir con nota; foto por proxy `photoSrc`). Antes solo llegaba el push, no había vista.
    (2) **Revisar limpieza HECHA**: `GET /api/admin/sesiones/[id]/completions` (lee `session_completions`) + botón
    **«📷 Ver limpieza»** en Inicio → modal con fotos + checklist + horas de entrada/salida.
    (3) **Guard de sesión global** `components/SessionGuard.tsx` (en `app/layout.tsx`): parchea `window.fetch`,
    si una respuesta de `/api/admin/*` es sesión cerrada (401 o cuerpo "No autenticado") redirige a `/login` en
    toda la app. (4) Carga rápida: ya cubierto por «Duplicar» + programaciones recurrentes (solo se documentó).
  - Las 3 PRs con **preview de ialimp verde** antes de mergear (cliente en vivo). `CLAUDE.md` y `public/manual.html`
    actualizados (menú Incidencias, "Ver limpieza", aviso de sesión única). **Chat con el equipo** ya existía:
    menú **💬 Chat equipo** (`/admin/chat`). **OK de limpieza** = estado «✓ Hecha» en Inicio + filtro «Hechas».

- **🧹 IALIMP: "Agenda" añadida al menú del panel admin — PR #229 (MERGED, `24a76d7`) — 14/06/2026**
  Vanessa (Sique Brilla) no encontraba dónde ver/repartir las limpiezas **por limpiadora**. La pantalla
  `/admin/agenda` (cuadrante semanal con una fila por limpiadora + panel "Asignar limpiadora por día") **ya
  existía y estaba completa, pero estaba huérfana**: no figuraba en el `NAV` de `app/dashboard/DashboardClient.tsx`,
  así que solo se abría tecleando la URL. Fix mínimo: entrada `📅 Agenda` en `NAV` (tras Operaciones) + mapeo
  `'/admin/agenda':'agenda'` en `NAV_MODULO` (respeta el permiso de módulo `agenda` ya existente). Manual
  (`public/manual.html`) actualizado con la tarjeta Agenda. Sin tocar BD/queries/multi-tenant. 4 previews verdes
  → mergeado a `main` (en producción `app.ialimp.es`).

- **🏦 PLATAFORMA: consolidación bancaria inteligente (F1–F6) — 14/06/2026**
  Épico nuevo en `apps/plataforma`: importar el banco, ver saldo/movimientos consolidados de todas las
  sociedades, categorizar con IA, conciliar con facturas, prever tesorería y conectar el banco por PSD2.
  Tablas nuevas en la **BD compartida** (RLS, aditivas, scoped por `cuenta_id`): `cuentas_bancarias`,
  `movimientos_bancarios` (con `dedupe_hash` único), `conexiones_banco`. Aplicadas por Supabase MCP.
  - **PR #211 (MERGED, `a3103bd`)** — F1 (importar **Norma 43** + **Excel multi-banco**, KPI "Saldo del
    grupo", página `/banca`, dedupe) · F2 (auto-categorización IA con `@central/core-ai`, NIM gratis) ·
    F3 (conciliación banco↔`incomes`/`expenses` de sivra y `v_contab_ingresos`/`v_contab_gastos` de ialimp) ·
    F5 (previsión 30/60/90d + cron alerta) · fix CI `allowImportingTsExtensions` al `tsconfig.base`.
  - **Importador Excel multi-banco** (`lib/extracto-xls.ts`, SheetJS): detección de columnas robusta a
    **Kutxa** y **BBVA** (fecha valor vs fecha, concepto en 2 columnas, saldo "Disponible", orden asc/desc).
  - **PR #216 (MERGED, `a9adf00`)** — F4: **OCR de facturas** (`nimVision`) + casado con el movimiento.
  - **PR #217 (MERGED, `26d89b7`)** — F6: **conexión automática PSD2**, primera versión sobre **GoCardless
    Bank Account Data** (`lib/gocardless.ts` + `lib/psd2.ts` + endpoints `psd2/instituciones|conectar|callback`
    + cron `psd2-sync`).
  - **F6-bis — switch a Enable Banking (DRAFT, rama `claude/banca-psd2-enablebanking`)**: los registros de
    GoCardless están **cerrados** (Alberto no pudo darse de alta), así que se reescribió la capa de proveedor a
    **Enable Banking** (tier gratuito que admite altas). Auth distinta: **JWT RS256** firmado con la clave
    privada de la app (no hay endpoint de token); flujo `aspsps → POST /auth → POST /sessions → accounts`.
    Nuevo `lib/enablebanking.ts` (reemplaza `lib/gocardless.ts`, borrado); `lib/psd2.ts` y los endpoints usan
    sesiones (el `session_id` se guarda en `conexiones_banco.requisition_id`, `proveedor='enablebanking'`). Sin
    migración nueva. Inerte hasta poner `ENABLEBANKING_APP_ID` y `ENABLEBANKING_PRIVATE_KEY` en el Vercel de
    plataforma (degrada limpio). **Mapeo de campos a verificar con credenciales reales** (este entorno no las tiene).
  - **Datos reales de Alberto YA cargados** en su cuenta (sociedad "Alberto Suárez Gutiérrez", NIF):
    **Kutxa** (244 mov, 21.161,96 €, apartamentos) + **BBVA** (40 mov, 20.034,98 €, seguros + Dúplex Center) =
    **41.196,94 €** consolidados. Los movimientos cargados por SQL NO están categorizados/conciliados: usar
    los botones 🤖 Re-analizar IA y 🔗 Conciliar en `/banca` (necesitan `NVIDIA_API_KEY`).
  - **Pendiente (mejoras)**: F4 → guardar el justificante (imagen) y soportar PDF; F6 → dar de alta una app
    en Enable Banking, poner `ENABLEBANKING_APP_ID/PRIVATE_KEY` en Vercel, verificar el mapeo de campos con un
    banco real y mergear. Lógica pura testeada con `node --test` (norma43, tesorería).

- **💶 SIVRA: gastos fijos mensuales AUTOMÁTICOS + fix dashboard — PR #208 (merged) y #209 — 14/06/2026**
  Sesión sobre la vertical **sivra** (intranet pisos). Dos entregas:
  - **PR #208 (mergeado)** — auditoría del dashboard a partir de un pantallazo real:
    - 🔴 Gráfico "Evolución mensual" salía **vacío**: el `<BarChart>` leía `dataKey="y0"/"y1"` pero la API
      emite series por año (`[year]`/`[year-1]`). Fix: `dataKey={String(year)}`.
    - 🟡 Delta `↑0.0%` engañoso sin periodo previo → ahora muestra **"nuevo"** (`delta()` devuelve `null`).
    - 🟢 Entradas/Salidas/Entradas mañana ahora indican el **piso** (🏠 nombre), usando `propertyName` que
      `/api/incomes/today` ya devolvía. Detalle en `docs/AUDITORIA-2026-06.md` (addendum 14/06).
  - **PR #209** — **gastos fijos mensuales 100% automáticos** (alquileres, comunidad dúplex, etc.):
    - Tabla nueva **`gastos_fijos`** (RLS como `gastos`, índice único por `fingerprint`). DDL en
      `apps/sivra/sql/gastos_fijos.sql` (migraciones `create_gastos_fijos`, `gastos_fijos_fingerprint_sync`).
    - **Automático de punta a punta**: el cron `/api/expenses/fijos/generar` (`vercel.json` `"0 6 1 * *"`)
      llama `sincronizarReglasFijas()` → importa a `gastos_fijos` las **reglas mensuales que el agente de
      facturas ya aprendió** (`gastos_reglas`, periodicidad mensual) casando por fingerprint, sin pisar
      ediciones manuales; luego imputa el mes con **dedup POR MES**.
    - **"La factura real manda"**: `insertarGasto()` borra el placeholder `origen='fijo'` del mismo mes al
      imputar la factura real → **cero duplicados** (`lib/agente-facturas/imputar.ts`).
    - Página **`/gastos-fijos`** (nuevo ítem sidebar): CRUD + "Generar mes actual ahora". Alquileres de
      Bustos Tavera **migrados** del backfill manual (día 8) a este sistema (día 1).
    - **Backfill 2026 (ene→jun) ya ejecutado en BD**: junio poblado con 5 fijos (877,22 €); meses con
      factura real se respetaron. Helpers en `lib/agente-facturas/gastos-fijos.ts`.
    - Verificado: `tsc --noEmit -p apps/sivra/tsconfig.json` ✅ 0 errores; 4 deploys Vercel verdes.

- **⏱️ Control horario en ia-rest (roadmap #2) — branch `claude/control-horario` — 14/06/2026 (PR #205, draft)**
  PR #199 (auditoría de caja) **MERGEADO a main** (squash, `c54175c`). Épico nuevo por fases, principio
  **100% configurable** (`config_horario`: límites + toggles por local, defaults legales). Módulo puro nuevo
  **`@central/module-horario`** (`packages/`, plantilla de `module-contabilidad`, tests `node --test`).
  - **Fase 1 (verde)** — Registro de jornada legal RD 8/2019: `resumenJornada`/`detalleJornada`/
    `chequearDescansos`/`horasExtra` + `config_horario` (migración MCP) + `GET /api/owner/horario` +
    `GET/POST /api/owner/horario/config` + tab "Jornada" (grupo Auditoría, `owner/page.tsx`) con CSV,
    sparkline y panel de configuración. Reusa la base de fichaje existente (`turnos`, `fichar_entrada/salida`).
  - **Fase 2 (verde)** — Anti-fraude: validación de IP del centro en `turnos/fichar` (gated `validar_ip_local`
    + `ips_local`) + `POST /api/owner/horario/autocierre` (cierra colgados > `autocierre_horas`) + botón en el tab.
  - **Fase 3 (pusheada)** — Coste de personal: `costePersonal` (módulo) + `config_horario.costes_empleado`
    (mapa; camareros es VISTA, por eso va aquí) + bloque coste en el GET (cruza ventas de `facturas_verifactu`)
    + `POST /api/owner/horario/coste` + KPIs/coste-hora editable en el tab. Flag `coste_personal`.
  - **PENDIENTE del épico**: Fase 2b (fichaje por QR + recordatorios push), Fase 4 (cuadrante/plantilla
    previsto vs real), Fase 5 (ausencias/vacaciones), Fase 6 (consolidado multi-local en plataforma +
    festivos + export gestoría), y firma del empleado + informe PDF oficial (RD 8/2019). Migraciones MCP en
    proyecto ia-rest `efncqyvhniaxsirhdxaa`.
- **📦 Reposición de stock (ia-rest) — branch `claude/reposicion-stock-iarest` — 14/06/2026**
  4ª de la tanda "automatizar agentes" (la #3 impagos-sivra se SALTÓ: sivra no tiene cuentas por cobrar,
  sus "facturas" son gasto/proveedores y pago a limpiadoras). Cron diario `/api/cron/reposicion-stock`
  (08:15) que lee `materiales` (Supabase propia de ia-rest), detecta `cantidad_disponible < stock_minimo`
  (activos, con `stock_minimo` no nulo) y avisa por **Telegram** (`tgAlert(..., 'aviso')`) con líneas
  ordenadas por faltante + proveedor + coste estimado de reposición.
  - **Código** (`apps/ia-rest/src`): `lib/reposicion-stock.ts` (puro: `faltante`/`costeReposicion`/
    `formatAvisoStock`) + `lib/reposicion-stock.test.ts` (3/3 ✅); `app/api/cron/reposicion-stock/route.ts`
    (auth Bearer `CRON_SECRET`, `createServerClient`); cron en `vercel.json`. **Sin migración** (usa
    `materiales.stock_minimo`, ya existente). ia-rest = BD propia `efncqyvhniaxsirhdxaa`.
  - **OJO**: ia-rest **sí valida tipos en build** (no `ignoreBuildErrors`) → cuidado con type-guards.
  - **Verificado**: `node --test` 3/3 ✅, `next build` (161/161 páginas, ruta como función, type-check OK) ✅.
  - **⚠️ PENDIENTE despliegue**: requiere `materiales.stock_minimo` aplicado en la BD de ia-rest (migración
    materiales v2) y `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (ya existen para el resto de alertas).
  - **Roadmap restante**: NPS post-servicio (ialimp) · scoring limpiadoras (ialimp) · orquestador concursos.
- **⭐ Scoring/ranking de limpiadoras (ialimp) — branch `claude/scoring-limpiadoras-ialimp` (PR #207) — 14/06/2026**
  6ª de la tanda "automatizar agentes". Endpoint `GET /api/admin/limpiadoras/ranking` que puntúa y
  ordena a las limpiadoras de la empresa sobre la **vista existente `rendimiento_limpiadoras`** (sin
  migraciones). Score 0-100 = calidad (`rating_medio`/5, 55%) + fiabilidad (1 − quejas/sesiones, 45%).
  - **Anclado a datos reales**: `sesiones_completadas` viene 0 → **excluida**; `rating_medio` suele ser
    null → **no penaliza a 0** (score = fiabilidad, `sin_valoraciones: true`); `confianza` por volumen.
  - **Código** (`apps/ialimp`): `lib/scoring-limpiadoras.ts` (puro: `puntuarLimpiadora`/`rankingLimpiadoras`)
    + `lib/scoring-limpiadoras.test.ts` (5/5 ✅); `app/api/admin/limpiadoras/ranking/route.ts`
    (Prisma `$queryRaw`, auth `requireEmpresaId()` de `@/lib/tenant`). **OJO bigint**: las columnas
    `bigint`/`numeric` de la vista llegan como BigInt/Decimal → se coaccionan a `Number` (si no, rompe
    `JSON.stringify` y la aritmética).
  - **Verificado**: `node --test` 5/5 ✅; `next build` (161/161 páginas, ruta `ƒ` registrada) ✅.
  - **Nota**: ialimp usa **Prisma** (no supabase-js), auth JWT propio (cookie `ialimp_session`), ignora
    errores TS en build. Ya había consumidores de la vista (`/api/admin/rrhh/analisis`); este es el ranking.
  - **Tanda previa (otras ramas/PR)**: briefing #203 · impagos-ialimp #204 · ~~impagos-sivra~~ (N/A) ·
    reposición-stock-iarest #206. **Roadmap restante**: NPS post-servicio (ialimp) · orquestador concursos.
- **💸 Agente de impagos (ialimp) — branch `claude/impagos-ialimp` — 14/06/2026**
  2ª de la tanda "automatizar agentes" (PR por PR). Cron diario `/api/cron/impagos` (08:30) que detecta
  facturas a clientes **vencidas y no cobradas** y manda recordatorios **escalonados +3/+10/+21 días** al
  cliente, sin repetir escalón, **+ resumen diario a la empresa** (`empresas.email`).
  - **Migración aplicada** (Supabase compartida `wswbehlcuxqxyinousql`): tabla `recordatorios_impagos`
    (aditiva, RLS on sin policies como el resto; único `(factura_id, escalon)`). Fichero en
    `apps/ialimp/prisma/migrations/2026-06-14_recordatorios_impagos.sql`.
  - **Código**: `lib/impagos.ts` (puro: `escalonAEnviar`/`textoRecordatorio`/`resumenEmpresaTexto`) +
    `lib/impagos.test.ts` (5/5 ✅); endpoint `app/api/cron/impagos/route.ts` (reutiliza
    `emailFacturacionCliente` + `getTransporter`/`MAIL_FROM`); cron en `vercel.json`.
  - Filtro: `estado IN ('emitida','vencida') AND fecha_vencimiento<hoy AND fecha_cobro IS NULL AND pagada_online_at IS NULL`.
  - `facturas_clientes` hoy **vacía** (Sique Brilla aún no factura por aquí) → 0 envíos hasta que emita.
  - **Verificado**: `node --test` 5/5 ✅, `next build` (161/161 páginas, ruta `/api/cron/impagos` como función) ✅.
  - **⚠️ PENDIENTE despliegue**: `CRON_SECRET` ya existe; el envío real necesita el SMTP ya configurado (IONOS).
    NO mergear a `main` sin preview verde (cliente Vanessa EN VIVO).
  - **Roadmap restante**: impagos **sivra** → reposición stock (ia-rest) → NPS (ialimp) → scoring limpiadoras →
    orquestador concursos. Diferidas (APIs externas): reputación, VeriFactu.
- **📊 Briefing consolidado (plataforma) — branch `claude/briefing-consolidado-plataforma` — 14/06/2026**
  1ª de la tanda "automatizar agentes" (auditoría previa: ver entrada de instagram-ideas). `plataforma`
  no tenía **ningún cron**; ahora un cron semanal (lunes 08:00) consolida ingresos/gastos/resultado YTD
  de **todos los negocios de cada cuenta** y envía un email al dueño.
  - **Lógica pura** `apps/plataforma/lib/briefing.ts` (`agregarBriefing` + `formatBriefingTexto`, € inline
    para no arrastrar `financiero→db→prisma`) con tests `node --test` (`lib/briefing.test.ts`, 3/3 ✅).
  - **Endpoint** `app/api/cron/briefing/route.ts` (GET, auth `CRON_SECRET` o `?secret=`): reutiliza
    `getResumenNegocio` de `lib/financiero.ts` (ialimp+sivra BD, ia-rest puerto HTTP) y `enviarAvisoEmail`
    de `lib/notificaciones.ts` (Resend, no-op sin `RESEND_API_KEY`).
  - **Cron** en `vercel.json` (`0 8 * * 1`) + `/api/cron` añadido a `PUBLIC` del `middleware.ts`.
  - **Verificado**: `node --test` 3/3 ✅, `tsc --noEmit` (código de prod limpio) ✅, `next build` ✅.
  - **⚠️ PENDIENTE despliegue**: en el Vercel de plataforma definir `CRON_SECRET` y `RESEND_API_KEY`+`MAIL_FROM`.
  - **Roadmap restante** (PR por PR): impagos (ialimp/sivra) → reposición stock (ia-rest) → NPS (ialimp)
    → scoring limpiadoras (ialimp) → orquestador concursos (ialimp). Diferidas (APIs externas): reputación
    Google/Booking, reintentos VeriFactu. Plan: `docs/superpowers/plans/2026-06-14-briefing-consolidado-plataforma.md`.
- **⏰ Cron huérfano arreglado: `instagram-ideas` (ia-rest) — branch `claude/agents-missing-schedules-u838j3` — 13/06/2026**
  Auditoría de "agentes sin tarea programada": crucé todos los endpoints `cron`/`agent` de las 4 apps
  contra los `crons` de cada `vercel.json`. Resultado: la mayoría OK; los `agente-*` interactivos
  (asesoria, owner/compras+eventos, super/arquitecto+ai+seo, leads, sivra agente/chat, ialimp
  cotizador, expenses backfill) **no llevan cron a propósito** (bajo demanda). **Único huérfano real:**
  `apps/ia-rest/src/app/api/cron/instagram-ideas/route.ts` estaba diseñado como cron (auth `CRON_SECRET`,
  cabecera "lunes, antes de blog-seo") pero **faltaba en `vercel.json`** → nunca se disparaba solo.
  **Fix:** añadido `{ "path": "/api/cron/instagram-ideas", "schedule": "30 7 * * 1" }` (lunes 07:30,
  antes de blog-seo 08:00). No requiere exclusión de middleware (matcher solo cubre `/api/super/*`).
- **🔎 Agente SEO autónomo de ia.rest (Fase 1) — branch `claude/seo-agent-auto-activation-5ypj5x` — 13/06/2026**
  Cron `/api/cron/seo-agent` (**martes y viernes 07:00 UTC**) que lee **GSC+GA4** y, de forma
  **autónoma**, adapta el SEO de **iarest.es**: titles/metas, JSON-LD, bloques de contenido y
  artículos nuevos. Principio rector: **los cambios son DATOS, no código** (nunca commitea ni rompe
  el build). Spec/plan en `docs/superpowers/{specs,plans}/2026-06-13-agente-seo-autonomo-iarest*`.
  - **Migración aplicada** a Supabase **`efncqyvhniaxsirhdxaa`** (proyecto ia-rest), **schema `public`**
    (¡no `iarest`! — ahí vive `blog_borradores`, que es donde apunta `createServerClient`). Tablas
    nuevas con **RLS habilitado**: `seo_overrides` (title/meta/canonical/og/jsonld por ruta),
    `seo_content_blocks` (bloques por ruta+posición), `seo_articulos` (artículos en BD), `seo_cambios`
    (snapshot antes/después + auditoría).
  - **Red de seguridad**: kill switch `SEO_AGENT_ENABLED` (si != 'true', el cron sale sin tocar nada),
    allowlist de rutas (`/restaurantes`, `/restaurantes/*`), máx. `SEO_MAX_CAMBIOS` (def. 5)/pasada,
    anti-oscilación 7 días, umbral `SEO_MIN_IMPR` (def. 30) en el prompt, informe Telegram y reversión
    vía `/api/super/seo-revert`.
  - **Código** (`apps/ia-rest`): `src/lib/seo/{types,guardrails,gsc-ga4,store,targets}.ts`,
    `src/components/seo/SeoBlocks.tsx`, ruta dinámica `src/app/blog/[slug]/page.tsx`, endpoints
    `api/cron/seo-agent` y `api/super/seo-revert`. Páginas `/restaurantes` y `/restaurantes/[ciudad]`
    leen override en `generateMetadata` + slot `<SeoBlocks>`. GSC/GA4 extraídos de `agentes-seo` al
    módulo compartido `gsc-ga4.ts`.
  - **Superficie editable Fase 1**: solo páginas server (`/restaurantes`, `[ciudad]`) + artículos
    nuevos. `/` y `/espacios` son client-components (`next/head`) → fuera del override por ahora.
  - **Verificado**: test puro `scripts/seo/test-guardrails.ts` (14 checks) ✅, `next build` ✅,
    `npm run qa` sin problemas ✅, 4 tablas confirmadas en BD.
  - **⚠️ PENDIENTE de despliegue**: en el Vercel de ia-rest, dejar `SEO_AGENT_ENABLED` sin poner/`false`
    hasta querer activarlo; al activar (`=true`), revisar el primer informe Telegram y `/super → SEO`
    antes de confiar. Opcional: `SEO_MAX_CAMBIOS`, `SEO_MIN_IMPR`.
  - **Fase 0/2 (ialimp.es) pendiente**: ialimp **no tiene GSC/GA4 conectado** (cero OAuth/analytics en
    `apps/ialimp`) y su landing es **HTML estático**; requiere conectar analíticas antes de extender el
    agente (y extraer la lógica a `@central/core-seo`).

- **🔎 Auditoría de caja POR EMPLEADO en ia-rest — branch `claude/logistastrator-analysis-q78y60` — 13/06/2026 (PR #199)**
  Épico por fases sobre el cuadre de caja. **Bloque A completado (fases 1-4)**:
  - **Fase 1** — Migración `arqueos_caja_empleado` (aditiva, RLS espejo de `arqueos_caja`; aplicada vía
    Supabase MCP a proyecto ia-rest `efncqyvhniaxsirhdxaa`) + columnas `config_contabilidad.umbral_descuadre`
    y `.conteo_ciego`. `cierre-diario` persiste `cuadre_por_empleado` (delete-then-insert) y **cruza con
    turno** (movimientos sin camarero → titular del turno vía `turnos`+`camareros`).
  - **Fase 2** — Puras `resumirDescuadresEmpleado`/`detectarPatronRecurrente`/`serieDescuadreEmpleado`
    (+tests, 23 total) · `GET /api/owner/contabilidad/arqueos-empleado` · UI panel "Histórico por
    empleado" (tabla acumulado/media/peor + sparkline + CSV + badge merma recurrente).
  - **Fase 3** — `lib/push.ts` (`enviarPushARoles`) · alertas por umbral + patrón recurrente → push a
    owner/gestor · UI marca en rojo los que superan umbral.
  - **Fase 4** — Motivo obligatorio por empleado (400 con `pendientes` + UI de reintento) · conteo ciego
    (config + "revelar" en UI) · firma del empleado (`PATCH .../arqueos-empleado/[id]/confirmar` +
    columnas `confirmado_por/at`).
  - **Verificado**: 23/23 tests, `tsc` limpio, eslint sin errores (solo warnings). Migración aplicada y
    comprobada por MCP.
  - **Bloque B completado (fases 5-9)**: F5 conciliación de tarjeta (`arqueos_caja.tarjeta_liquidada/
    diferencia_tarjeta`); F6 tesorería (`movimientos_tesoreria` + endpoint GET/POST + panel saldo caja
    fuerte); F7 abastecimiento de cambio (`config_contabilidad.min_monedas` + aviso en cierre); F8
    tolerancia por empleado (`config_contabilidad.umbrales_empleado` + endpoint `umbral-empleado` +
    columna editable en histórico; `umbralDe()` en validación/alertas); F9 consolidado multi-local:
    endpoint operador `GET /api/operador/descuadres-empleado` en ia-rest + `apps/plataforma`
    (`lib/descuadres.ts` + `GET /api/admin/descuadres-iarest`, vía puerto HTTP con OPERADOR_SHARED_SECRET).
    Migraciones aplicadas por MCP. ia-rest `tsc` limpio (los errores `tsc` de plataforma son preexistentes,
    no gatean su build).
  - **PENDIENTE (cabos)**: UI empleado-facing de firma/conteo ciego en el POS (`/edge`); página visual
    del consolidado en el god-panel de plataforma (el data path ya está). Tras esto: roadmap #2 control horario.

- **💶 Cuadre de caja en ia-rest — branch `claude/logistastrator-analysis-q78y60` — 13/06/2026**
  A raíz de un estudio competitivo de **Logista Strator** (TPV/retail de Logista; NO es logística),
  se decide reforzar ia-rest donde ellos pegan fuerte: **gestión de efectivo**. Al verificar contra
  código + BD se descubre que **`arqueos_caja` ya existía** con los campos del cuadre
  (`fondo_inicial/salidas_caja/fondo_final/diferencia_caja`) pero **el `cierre-diario` los hardcodeaba a 0**
  y nunca leía `movimientos_caja`. Se **completa** (sin tabla ni endpoints nuevos, cero duplicación):
  - **Lógica pura** en `@central/module-contabilidad` (`src/caja.ts`): `calcularCuadreCaja`,
    `totalDesglose`, `DENOMINACIONES_EUR`, `calcularCuadrePorEmpleado` + tipos
    `MovimientoCaja`/`CuadreCaja`/`CuadreEmpleado`. Saldo teórico = Σ movimientos del cajón; conteo
    físico = desglose manual o último arqueo/cierre; descuadre = real − teórico. **18 tests `node:test`**
    (el paquete no tenía script `test`; añadido).
  - **`apps/ia-rest/.../contabilidad/cierre-diario/route.ts`**: lee `movimientos_caja` del día y
    persiste el cuadre global real + `cerrado_por`/`notas`; devuelve `cuadre` y `cuadre_por_empleado`.
  - **UI** `ContabilidadTab.tsx` (sub-tab Cierre): checkbox "Hacer arqueo", conteo por denominación
    en vivo, notas, y tarjeta de cuadre **configurable (toggle Caja única / Por empleado)** — por
    empleado agrupa los arqueos de cada camarero desde `movimientos_caja` (sin migración).
  - **Verificado**: 15/15 tests ✅, `tsc --noEmit` ia-rest ✅, eslint archivos tocados 0 errores ✅.
    Sin migración (columnas ya existían). **Roadmap restante** (PRs aparte): completar control horario
    (plantilla/ausencias/informe jornada legal), alta Kit Digital (admin), Tier 2 (pago unificado, carta digital).

- **🧾 Agente de facturas de SIVRA — branch `claude/invoice-processing-agent-7fwjst` — 13/06/2026**
  Agente diario que lee **Gmail (IMAP) + carpeta de Drive**, archiva facturas y las imputa en
  `gastos` de sivra, con **aprendizaje de recurrentes** y **modo mixto** (lo claro entra solo,
  lo dudoso a bandeja). Spec/plan en `docs/superpowers/{specs,plans}/2026-06-13-agente-facturas-sivra*`.
  - **Migración aplicada** a Supabase `wswbehlcuxqxyinousql` (`agente_facturas_2026_06_13`, aditiva):
    `gastos` += `irpf_porcentaje/origen/fingerprint/motivo_revision` (irpf/confianza/revisado YA existían);
    tablas nuevas `gastos_reglas` (memoria) y `agente_log` (auditoría); **seed** de los 2 alquileres
    de Bustos Tavera 22 (Bajo Dcha→Luxury Busto, Bajo Izq→Busto Reform, ALQUILER, IVA 21% / IRPF 19%).
  - **Bandeja = `gastos.revisado=false`** (no se creó tabla aparte). GET de gastos excluye `revisado=false`.
  - **Código** (`apps/sivra`): `lib/agente-facturas/*` (fingerprint, reglas/confianza, conciliar IVA/IRPF,
    extraer, gmail IMAP, drive list/get/archive, imputar, anomalías, avisos, procesar, resumen-mensual);
    `lib/telegram.ts` (portado de ia-rest). Endpoints: `/api/expenses/agent/{scan,backfill,resumen-mensual}`,
    `/api/expenses/pendientes(/[id])`. UI: `/expenses/pendientes` + badge en `/expenses`; desplegable
    += **ALQUILER** y **Personal (no pisos)**. `scripts/drive-upload.gs` ampliado (list/get/archive).
  - **Resumen mensual por Telegram** (cron día 1, mes anterior) con **desglose de rentabilidad por piso**
    (ingresos − gastos; `properties.id` = `gastos.propiedad` = `prop_*`). Cron diario `scan` 06:00.
  - **Verificado**: 11 tests `node:test` (incl. los 2 recibos reales) ✅, `tsc --noEmit` ✅,
    `next build` ✅, query de rentabilidad probada contra BD real.
  - **⚠️ PENDIENTE de despliegue (no testeable sin credenciales):** en el Vercel de **sivra** añadir
    `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, apuntar `DRIVE_SCRIPT_URL` a la carpeta real y poner su
    `ROOT_FOLDER_ID` en `drive-upload.gs`; (opcional) `GMAIL_FACTURAS_LABEL` + regla de Gmail.
    Lanzar el **backfill primero en dry-run** (`/api/expenses/agent/backfill?secret=...`) y luego `&commit=1`.
    Deps nuevas: `imapflow`, `mailparser`, `@types/mailparser`.

- **📦 module-materiales Fase B — PR #189 mergeado — 12/06/2026**
  Implementación completa de la Fase B del plan `module-materiales` (spec en `.claude/plans/polished-growing-stonebraker.md`):
  - **8 APIs nuevas** en `apps/ia-rest/src/app/api/materiales/`:
    - `clientes/` (GET/POST/PATCH/DELETE), `proveedores/` (GET/POST/PATCH/DELETE)
    - `kits/` (GET/POST/PATCH/DELETE), `kits/[id]/items/` (GET/POST/DELETE), `kits/instanciar/` (POST — expande kit × N → movimientos salida con validación de stock)
    - `mantenimiento/` (GET/POST/PATCH), `reservas/` (GET/POST/DELETE soft-cancel)
    - `inventario-fisico/` (GET/POST), `inventario-fisico/[id]/lineas/` (GET/PATCH), `inventario-fisico/[id]/cerrar/` (POST — genera ajuste/rotura movements)
  - **Migración SQL** `supabase/migrations/2026-06-12_materiales_fase_b.sql`: tablas `materiales_proveedores`, `materiales_clientes`, `materiales_kits`, `materiales_kits_items`, `materiales_inventario_fisico`, `materiales_inventario_fisico_lineas`, `materiales_mantenimiento`, `materiales_reservas` — todas con RLS `service_role_all`.
  - **UI** `owner/materiales/page.tsx`: tabs Kits, Clientes, Proveedores, Mantenimiento, Reservas, Inventario Físico wizard añadidos.
  - **Fixes CI** iterativos: Turbopack `await` en callback no-async, TS strict `never[]` → tipado explícito en `instanciar/route.ts` y `cerrar/route.ts`.
  - **CI final**: 10/10 checks ✅, 4 Vercel ✅. Squash-mergeado a `main` (SHA `8174ffd`).
  - **✅ RESUELTO (18/06/2026):** la migración (y `_v2`/`_categorias`/`_ledger`) se aplicó a la BD VIVA
    correcta — schema `iarest` del proyecto compartido `wswbehlcuxqxyinousql`, no la vieja
    `efncqyvhniaxsirhdxaa`. 16/16 tablas + RLS verificadas. Ver entrada de 18/06 arriba.

- **🧱 Config de build compartida en la MATRIZ — PR #180 — 12/06/2026**
  "Lo compartido sube a la matriz" aplicado a la config de build/herramientas:
  - **`tsconfig.base.json`** en la raíz; las 4 apps lo `extends` y solo declaran lo suyo
    (paths, include/exclude, overrides). Equivalencia probada (showConfig + deep-equal).
  - **`eslint.config.base.mjs`** en la raíz (solo DATOS: ignores + ruleset legado a `warn`,
    sin imports de paquetes → no depende del node_modules de la raíz). Las 4 apps pasan a
    **flat-config con `eslint-config-next ^16.2.6`** y `lint: eslint`; sivra migra desde
    `.eslintrc.json`, ialimp/plataforma estrenan eslint. Verificado **0 errores** en las 4;
    ia-rest queda **idéntico** (0 err / 1164 warn, mismo desglose → no rompe su build/CI).
  - **Estabilización del PR**: se puso la rama al día con `main` (estaba ~11 commits atrás →
    fallos "merge conflict marker" en typecheck ia-rest), se anotaron tipos en
    `ialimp .../concursos-ingesta` (TS7022 latente, preexistente).
  - **⚠️ Seguridad**: un commit concurrente había revertido en `mis-restaurantes/route.ts` la
    corrección IDOR/suplantación de sesión de `main` (volvía a parsear la cabecera cruda
    `x-ia-session`). Al fusionar `main` se **restauró la versión firmada/segura** (`getSession`).
    Documentado en el PR para que no se vuelva a revertir.

- **🧭 SKILLS-ROUTER DE CONTEXTO POR VERTICAL — rama `claude/project-scope-agent-validation-ip9f8b` — 12/06/2026**
  Para resolver "el proyecto es muy amplio, se pide contexto de objetivos antes de tocar nada":
  se añaden 4 skills-router **finos** (estilo `auditoria-central`, NO copian docs → apuntan a la
  fuente de verdad, así no hay drift) en `.claude/skills/`:
  - `central-maestro` — dispatcher de entrada del monorepo: orienta (CLAUDE.md/MATRIZ/CONTEXTO),
    identifica la vertical y enruta al maestro correcto + recuerda reglas de matriz/packages/BD compartida.
  - `sivra-maestro`, `ialimp-maestro`, `plataforma-maestro` — un router por vertical con gate
    "antes de tocar nada", mapa de dónde vive cada cosa, infra (sin secretos) y landmines.
  - `ia-rest-maestro` ya existía (doc gordo); los nuevos lo referencian, no lo tocan.
  - Cada router obliga a leer objetivos/CLAUDE.md de la vertical y a comprobar la frontera multi-tenant
    de la BD compartida antes de planificar. Se apoyan en el SessionStart hook (`using-superpowers`) ya activo.

- **🤖 NUEVOS AGENTES IA + mejoras — PR #175 mergeado — 12/06/2026**
  Se crean 7 nuevos agentes y se mejoran 2 existentes en ia.rest:
  - **U1** `agentes-ai/route.ts` reescrito con agentic loop de hasta 10 iteraciones (igual que `agentes-seo`). Los 5 agentes genéricos (Ventas, Legal, Competencia, Contenido, Onboarding) ahora tienen capacidad real de web_search iterativo.
  - **U4** `AgenteArquitectoTab` añadido al menú `/super → Sistema` (antes inaccesible desde UI).
  - **N2** Agente Compras (`/api/owner/agente-compras`) + `AgenteModuloChat` en `/owner → Almacén`.
  - **N3** Edge Function `qr-assistant` (Deno) + botón 🤖 flotante en `/q/[token]` para clientes QR.
  - **N4** GET en `/api/super/leads/agente` genera briefing del historial completo + botón "🤖 BRIEFING" en `CRMAgentTab`.
  - **N6** Agente Eventos (`/api/owner/agente-eventos`) + `AgenteModuloChat` en `EventosTab`.
  - **N7** `AsesoriaAgente` + `/api/asesoria/agente` — chat flotante para contables en `/asesoria`.
  - **Componente reutilizable** `AgenteModuloChat` en `components/owner/` para módulos owner.
  - Fix CI: `supabase.raw` inválido en `agente-compras/route.ts` → filtrado en JS.
  - N1 (owner insights) ya existía como `OwnerCopiloto`. N5 (registro) no viable sin auth.
  - ⚠️ Pendiente: desplegar Edge Function `qr-assistant` con `supabase functions deploy qr-assistant` (está en repo pero sin deploy).

- **🗑️ plataforma/admin: quita pestaña "Mis propiedades", acceso directo a ialimp — PR #171 mergeado — 12/06/2026**
  La pestaña "🏠 Mis propiedades" desaparece del panel de operador. En su lugar, botón en la cabecera
  "🏠 Mis propiedades ↗" que abre el portal del propietario de ialimp en pestaña nueva con auto-login
  (token mágico vía `/api/admin/propiedades`). Tab por defecto pasa a ser "Negocios".


- **📦 REFACTOR `@central/module-inventario` → `@central/module-materiales` — PR #172 — 12/06/2026**
  - **Paquete nuevo:** `packages/module-materiales` (TS puro, sin deps runtime). Elimina `packages/module-inventario`.
  - **Tipos nuevos:** `Material` (reemplaza `Articulo`), `Espacio`, `AsignacionMaterial`, `TransferenciaMaterial`,
    `ResumenContable`; campos nuevos: `tipo` (consumible|activo), `estado` (operativo|deteriorado|en_reparacion|baja),
    `stockMinimo`, `codigoInterno`, `garantiaHasta`, `documentos`, `precioCompra`.
  - **Funciones puras nuevas:** `gastoCompras`, `resumenContable`, `puedeTransferir`, `alertasStockMinimo`
    (además de las ya existentes: `round2`, `resumenStock`, `valorStock`, etc.).
  - **Adapters actualizados en los 3 consumidores** (método renombrado `toArticulo`→`toMaterial`):
    - `apps/ia-rest/src/lib/inventario-menaje.ts` (añadido `materialAdapter` para la tabla `materiales` con los nuevos campos)
    - `apps/ialimp/lib/adapters/inventario.ts`
    - `apps/sivra/lib/adapters/inventario.ts`
  - **Rutas actualizadas:** `apps/ia-rest/.../menaje/route.ts`, `apps/ialimp/.../stock/route.ts`,
    `apps/sivra/.../limpiadoras/productos/route.ts` — import cambiado a `@central/module-materiales`.
  - **`package.json` + `next.config.ts`** de ia-rest, ialimp, sivra: dep actualizada de `module-inventario` → `module-materiales`.
  - **SQL `apps/ia-rest/supabase/migrations/2026-06-12_materiales_v2.sql`** — aplicada al proyecto Supabase
    `efncqyvhniaxsirhdxaa`: añade columnas nuevas a `materiales` + crea `materiales_espacios` y
    `materiales_transferencias` con RLS (service_role).
  - **15 tests** en `packages/module-materiales/test/materiales.test.ts` — todos pasan con `node --test`.
  - **Fix CI:** dos rutas usaban `articuloAdapter.toArticulo` (ya inexistente) → cambiado a `toMaterial`
    (sivra y ialimp; detectado por Vercel CI, corregido en commit `ff16bd9`).
  - **`apps/plataforma/lib/estructura.ts`** actualizado: `module-inventario` → `module-materiales` con descripción del dominio.
  - **✅ MERGEADO a `main`** (PR #172). Los 4 proyectos Vercel verdes.
  - **NOTA arquitectura:** el scope de `module-materiales` es *agnóstico de vertical y de BD* (port/adapter).
    Espacios (`Espacio`) son entidades de primera clase con `refTipo`/`refId` opcionales para enlazar entidades externas.
    Multi-tenancy a nivel `negocioId` (más fino que `empresaId`/`restauranteId`).

- **🔒 SEGURIDAD BD compartida — COMPLETO — 500 → 318 advisories, 0 ERROR — 12/06/2026**
  3 migraciones aplicadas sobre `wswbehlcuxqxyinousql`. PR #169 mergeado. Detalle en `docs/AUDITORIA-2026-06.md` A4.
  - ✅ 62 vistas `SECURITY DEFINER` → `security_invoker = on` (47 iarest + 15 public)
  - ✅ `instagram_estilos_usados` → RLS habilitada
  - ✅ 114 funciones `function_search_path_mutable` → `SET search_path='iarest'`
  - ✅ 7 políticas `service_role_*` → `TO service_role` (qr slots/items/sesiones/valoraciones,
    reglas_envio, voice_profiles, comanda_modificaciones)
  - ℹ️ 17 `rls_policy_always_true` intencionales (bridge hardware, QR anon, super_admin) — sin acción
  - ℹ️ 77 `anon/authenticated_security_definer_function_executable` intencionales (login_pin, resolve_restaurante)
  - **No quedan pendientes de seguridad accionables en la BD.**

- **🔍 AUDITORÍA CON CONTEXTO del monorepo (post-reestructuración) — PR #164 — 12/06/2026**
  Auditoría completa tras el rename `@iarest/*`→`@central/*`, la migración de BD de ia-rest al Supabase
  compartido y `file:`→`workspace:*`. Informe en **`docs/AUDITORIA-2026-06.md`**. Skill nuevo
  **`.claude/skills/auditoria-central`** para repetirla.
  - **Bugs reales encontrados y ARREGLADOS** (el CI solo cubría ia-rest y no los veía):
    - `aiComplete(prompt, número)` en `apps/ialimp/lib/{google-leads,mailing}.ts` → debía ser objeto
      `{maxTokens|timeoutMs}`; el número se ignoraba en runtime (leads truncados a 800 tok; "timeout 8s" era 30s).
    - `@central/core-identity` usado en 8 ficheros de auth de ialimp **sin estar en deps ni transpilePackages**
      (todos los `@central/*` exportan TS crudo) → añadido a `package.json` + `next.config.ts`.
    - **16 errores de tipos de ialimp saldados** → las **4 apps a 0 errores** (`tsc --noEmit`).
  - **Red de seguridad añadida:** tests de `@central/core-fiscal` (IVA, NIF/CIF/IBAN, huella VeriFactu con
    snapshot), guardián `test/regression-scope.test.ts` (anti-`@iarest/`), orquestadores `pnpm test`/`test:packages`/
    `test:guardia`. **Suite: 104 tests, 0 fallos.** CI nuevo `.github/workflows/tests.yml` (tests + typecheck de
    las 4 apps; antes solo ia-rest).
  - **Infra verificada por MCP:** BD compartida tiene **499 security advisories (63 ERROR)** — 62 `security_definer_view`,
    24 `rls_policy_always_true`, 114 `function_search_path_mutable` (sensibles por ser BD multi-tenant; muchos
    preexisten a la migración). Schema `iarest` sano (266 tablas). Proyecto Supabase viejo de ia-rest
    (`efncqyvhniaxsirhdxaa`) sigue ACTIVE (jubilar tras el corte de envs).
  - **✅ Alberto aplicó las 2 migraciones del radar de concursos** (`radar_*` en `concursos_perfil_empresa` +
    tabla `concursos_radar_anuncios`) → cron `/api/cron/concursos-radar` ya no falla. Verificado en BD.
  - **✅ MERGEADO a `main`** (PR #164) + **seguimiento PR #166**:
    - **CI verde de verdad** (no solo local): `Tests & Typecheck` pasa en CI los 104 tests + typecheck de las
      **4 apps**. **OJO/GOTCHA del CI:** `prisma generate` y `tsc` deben ejecutarse **desde el dir de cada app**
      (`working-directory: apps/<app>`), NO desde la raíz — `prisma`/`typescript` son deps de cada app, no de la
      raíz (si no: `ERR_PNPM ... Command "prisma" not found`). Los 3 schemas escriben al MISMO `@prisma/client`,
      pero en CI cada app va en un job aparte (no colisionan). Este bug rompió `tests.yml` en main y se arregló en #166.
    - **Vulnerabilidades (M3):** `axios` (high, vía `node-ical`) resuelto con `pnpm.overrides "axios": ">=1.16.0"`
      en la raíz (→1.17.0); `pnpm audit` baja de 16 high a 1. **`xlsx`** queda (high, sin parche npm) pero es
      **no explotable**: ialimp solo ESCRIBE xlsx (export contab.), nunca parsea (las vulns son al LEER). Remediación
      oficial = tarball CDN de SheetJS (bloqueada en el entorno de build; no se arriesga el build del cliente vivo).
    - `workflow_dispatch` añadido a `ci.yml`/`tests.yml` (estaba mal indentado bajo `pull_request:`, corregido).
  - **✅ RESUELTO (sesión 12/06/2026):** los **63 advisories ERROR** de la BD compartida → 0 ERROR.
    Ver entrada nueva arriba. (xlsx queda como remediación opcional, documentada.)
- **🚨 PRODUCCIÓN ia-rest lee la BD UNIFICADA VACÍA (Fase A2 a medias) — demo reparado — 12/06/2026**
  - **`www.iarest.es` lee `wswbehlcuxqxyinousql` schema `iarest`** (BD unificada), NO `efncqyvhniaxsirhdxaa.public`
    (BD vieja con todos los datos). La unificada tenía estructura+RPCs pero **0 restaurantes / 0 personal** →
    nadie podía entrar. Diagnóstico: `GET /api/owner/modulos?restaurante_id=...001` devolvía el fallback genérico.
  - **Reparado (probado):** copiado restaurante demo (...001) + 7 personal a `wswbehlcuxqxyinousql.iarest`,
    creada+sembrada `materiales`. Verificado (search_path=iarest): `resolve_restaurante('DEMO')` ok, `login_pin`
    1369 y 4040 → success; endpoint de prod ya devuelve la config del demo. Añadido botón Salir en /montaje.
  - **⚠️ PENDIENTE GRANDE:** Saboga y demás datos reales **siguen solo en `efncqyvhniaxsirhdxaa.public`**;
    producción no los ve. Falta migración real de datos (Fase A2 completa) o revertir el env a la BD vieja.
  - **⚠️ Fragilidad:** las RPCs de `iarest` referencian tablas sin prefijo; dependen del search_path de PostgREST.

- **📦 MÓDULO DE MATERIALES (Bloque B) CONSTRUIDO — 12/06/2026**
  - Módulo **independiente de eventos** (decisión Alberto: sirve para catering, haciendas y hasta alquiler puro),
    100% configurable por el dueño, con **acceso granular por empleado** vía `personal.modulos_gestion`.
  - **Por qué tablas nuevas (no reutilizar `inventario_menaje_evento`):** la vieja tiene FK dura a `eventos` →
    acopla. Las nuevas viven en schema `iarest`, patrón `produccion_*` (`restaurante_id`, RLS service_role).
    La asignación apunta a un **destino genérico** (`destino_tipo` = evento|hacienda|cliente|obra), sin FK.
  - **DB (migración `2026-06-12_materiales.sql`, aplicada a `wswbehlcuxqxyinousql`):** `iarest.materiales`
    (catálogo + stock), `iarest.materiales_asignacion` (salida/devolución), `iarest.materiales_dano` (rotura+foto+coste).
  - **API:** `/api/materiales` (catálogo CRUD) · `/api/materiales/asignacion` (asignar descuenta stock / devolver
    repone sanas) · `/api/materiales/dano` (rotura con foto, da baja del total, coste = ud×reposición) ·
    `/api/materiales/perfil` (asignaciones del empleado logueado, gated por `modulos_gestion`).
  - **UI dueño:** `/owner/materiales` (3 tabs: Catálogo · Asignaciones · Roturas) + entrada `materiales` en `GRUPOS`
    e icono `box`. **UI empleado:** `/montaje` (patrón `/cocinero`: ve su material, marca recogido/devuelto,
    registra rotura con foto). **Routing:** empleado con `materiales` aterriza en `/montaje`.
  - **Gating:** `materiales` añadido a `TODOS_MODULOS` y al checklist de "Acceso a gestión" del panel de personal.
  - **Verificado:** `next build` verde (exit 0) con `@central/*` linkados (pnpm install). Spec en
    `docs/superpowers/specs/2026-06-12-modulo-materiales-design.md`. PR **#163** (draft, CI verde).
  - **⚠️ OJO con la BD (corregido):** la BD VIVA de ia-rest es el proyecto **`efncqyvhniaxsirhdxaa`,
    schema `public`** (ahí están `restaurantes`/`personal`/`inventario_menaje`; demo `DEMO` + "Saboga
    Catering"). El proyecto compartido `wswbehlcuxqxyinousql.iarest` está VACÍO (la migración A2 del plan
    de unificación NO se ha ejecutado). Primero creé las tablas en el sitio equivocado; corregido →
    tablas en `efncqyvhniaxsirhdxaa.public`. (Nota: las tablas `produccion_*`/`checklist_*` de la sesión
    anterior podrían estar también en el proyecto equivocado — revisar si esas features fallan en prod.)
  - **🧪 Cuenta DEMO sembrada para probar:** owner **Alberto PIN 1369** → `/owner` → tab **Materiales**
    (5 materiales con stock, 4 asignaciones, 1 rotura) y `/montaje` (el owner ve todo). Montador
    **PIN 4040** (rol gestor, acceso solo a `materiales`) → entra directo a `/montaje`. Módulos
    `materiales/checklists/produccion` activados en el restaurante demo.
  - **Pendiente del bloque:** previsión IA (aforo/temporada/temperatura), código de barras/báscula, multi-almacén
    por hacienda con reparto. Crear bucket Storage `materiales` en Supabase (hay fallback a data-url mientras tanto).

- **🎤 DECK presencial JJ + estructura real corregida — 12/06/2026**
  - **Deck presencial** construido en `apps/ia-rest`: ruta pública **`/propuesta/catering-jj-deck`** (en prod:
    `https://iarest.es/propuesta/catering-jj-deck`). 11 slides full-screen (nav teclado/clic), paleta de
    `PropuestaBase`, diagrama del grupo **inline** (componentes `Node`/`Arrow`, sin SVG). PRs **#156** (deck) y
    **#157** (corrección) mergeados a `main`.
  - **⚠️ Corrección de estructura real de JJ (manda sobre el brief a ciegas)** — volcada en
    `docs/BRIEF-joaquin-jaen.md` (nueva sección "⭐ ESTRUCTURA REAL DEL GRUPO" arriba del todo):
    - **Cocina central (la hermana)** = producción → **produce para eventos/catering** y abastece haciendas.
    - **Restaurantes `Doble J` y `Las Dos Jotas`** = **independientes, cada uno pide lo suyo** (no dependen de cocina central).
    - **Haciendas `El Alba` (propiedad) + `Trinidad` (alquiler)** = cada una su unidad (montaje/pases/barra) **con su almacén**.
    - **NO tienen tiendas para llevar (aún)** · **flota/alquiler-materiales NO confirmados** (eran supuestos del brief a ciegas).
    - Añadido al brief: **control de almacenes/economato** (almacén por hacienda + cocina central, código de barras,
      pedido al mínimo, mermas, reparto entre haciendas) y **control de cada hacienda** (calendario/stock/montaje/KDS/barra).
    - **No nombrar marcas internas ante JJ** (ialimp/sivra/"limpieza"/"pisos") — en el deck se quitó `ialimp` del slide
      de equipo y se anonimizaron las otras en "ya funciona".
  - **🔧 En curso (subagente):** enganchar los **accesos de H/I en los menús** (`/owner/checklists`,
    `/owner/productividad`, `/checklist` camarero, `/cocinero`) — PR aparte, pendiente de revisar/mergear.
  - **Pendiente:** comisiones/marketplace "de verdad"; tiempos estándar reales de cocina; conectar sistema de cocina de ella.

- **⭐ REUNIÓN con Joaquín Jaén (dueño) + hermanos CELEBRADA — inteligencia real — 11/06/2026**
  Transcripción analizada y volcada en `docs/BRIEF-joaquin-jaen.md` (sección "POST-REUNIÓN"). Cambia el brief a
  ciegas. Asistentes: **ella = responsable de todas las cocinas** (perfil técnico fuerte), **él = restaurante +
  comercial**, Joaquín + otro hermano decisores.
  - **Hallazgo nº1:** la cocina **NO es campo virgen** — la responsable lleva ~3 años con un sistema propio muy
    serio (proveedores→artículos con ficha técnica/alérgenos→ingredientes→elaboraciones con procesos→etiquetas QR
    trazabilidad/caducidad→escandallo dinámico→partes de trabajo por partida 5 días antes→báscula→cronometraje→
    economato→merma). Más profundo que la cocina de ia-rest. **Es protectora ("es lo mío") y su objeción es el
    factor humano.** → conectar/co-diseñar con ella, NO reemplazar. Mayor activo y mayor riesgo de adopción.
  - **Apertura real a corto = comercial + logística (el hermano, el que quiere "probar ya").** Necesita CRM
    comercial + **incentivos/ranking de comerciales** (bonos por margen/ticket/reseñas, contratos % escalable),
    ERP facturación/contabilidad, y **logística de material de eventos = dpto. más atrasado** (inventario menaje,
    previsión por evento, roturas post-boda, consumo estacional) → coincide con `DISENO-modulos-materiales-flota.md`.
  - **Producto "wow" que quieren:** marketplace de catering + presupuestador self-service (cliente configura evento →
    menú con margen → paga), multi-tarificador de eventos, bot de bodas, maridaje de vino por IA.
  - **Plan revisado:** piloto por **Logística/Material** (bajo riesgo político, diseño ya hecho); demo de venta por
    **marketplace de catering**; cocina = "conectamos con lo que ella ya construyó". Siguiente paso: presentación +
    piloto 1 dpto.; contacto por WhatsApp de Alberto; ellos mandan resumen.
  - **Faltan datos:** nº sociedades/CIFs + intercompany; stack exacto del sistema de cocina de ella; tamaño catálogo
    de material + eventos/mes; estructura de comisiones de los comerciales.
  - **✅ Bloques H e I CONSTRUIDOS y MERGEADOS a `main` (PR #154):** en `apps/ia-rest`.
    - **H — Checklist operativo:** tablas `iarest.checklist_plantillas/ejecuciones`; rutas `/api/checklists/*`
      (plantillas, turno con **índice de carga** leyendo `comandas`, marcar con foto, informe con flag
      "sin excusa"); pantallas `/checklist` (empleado) y `/owner/checklists` (editor + informe). Bucket
      Storage `checklists` (público) creado.
    - **I — Perfil del cocinero + productividad:** tablas `iarest.produccion_tareas/tiempos_estandar`;
      rutas `/api/produccion/*` (planificar con `callAI` + fallback round-robin, perfil, tiempo
      empezar/terminar, productividad, cocineros); pantallas `/cocinero` y `/owner/productividad`.
    - Módulos nuevos `checklists` y `produccion` en `TODOS_MODULOS`. Migraciones aplicadas en BD
      compartida (schema `iarest`). MVP **manual + IA** (no toca el sistema de cocina de ella).
    - **Cómo verlo (demo):** entrar por `/login` (owner PIN 1369 → `/owner/checklists` y `/owner/productividad`;
      camarero 7672 → `/checklist`; cocina 3297 → `/cocinero`). Las rutas aún **no tienen botón en los menús**
      (creadas como pantallas standalone para no tocar las páginas grandes).
    - **Pendiente:** enganchar accesos en los menús (`/owner`, camarero, cocina); cargar tiempos estándar reales;
      conectar el sistema de cocina de ella; **guión/deck** presencial para la próxima reunión.
  - **Propuestas web refinadas (PR #138, mergeada):** las 4 propuestas `catering-jj*` reposicionan la cocina
    ("conectamos, no reemplazamos") y añaden las cartas que pidió la familia: **comercial+comisiones**, **material
    de eventos** (roturas/previsión) y **presupuesto self-service del cliente**. Estas dos últimas se presentan
    **como si ya existieran** (decisión de Alberto) — **a construir mañana**. Piloto del hub reorientado a
    material+comercial. **Pendiente mañana:** (1) construir comisiones/marketplace de verdad; (2) **guión/deck**
    presencial para la próxima reunión.

- **✅ BRIEF JOAQUÍN JAÉN + diagramas — preparación presentación holding — 11/06/2026**
  Sesión de preparación para reunión con **Joaquín Jaén** (holding: restaurante, catering, haciendas,
  alquiler de materiales, transporte, tiendas para llevar). Todo en `main` vía rama `claude/joaquin-jaen-expansion-4nyju5`.
  - **`docs/BRIEF-joaquin-jaen.md`** — quién es, cómo caben sus 6 negocios (tabla), idea técnica (`Encargo`
    + intercompany), estado real hoy (hecho vs diseñado), modelo comercial (módulos activables), preguntas
    clave para cerrar, guion de presentación de ~8 slides.
  - **`docs/DISENO-modulos-materiales-flota.md`** — diseño a fondo de las dos verticales nuevas (alquiler
    de materiales + flota/transporte): modelo de datos, ciclo de vida, pantallas, reutilización de módulos,
    fases sugeridas y qué demostrar a Joaquín.
  - **Diagramas SVG + PNG** (`docs/diagrams/`):
    - `joaquin-encargo.svg/.png` — cómo el agregado `Encargo` (parent_id+parent_type) une todos los
      `module-*` (CRM, presupuestos, agenda, inventario, proveedores, portales, feedback, facturación).
    - `joaquin-holding-intercompany.svg/.png` — el "gancho holding": cocina central → tiendas, flota →
      catering, materiales → eventos facturados entre sociedades y consolidados eliminando intercompany en
      `plataforma` (neto real del grupo).
  - **`add_concursos.sql` APLICADA** en BD compartida `wswbehlcuxqxyinousql` (schema `public`): tabla
    `concursos` con 12 columnas + 3 índices. Marca el pendiente de Alberto del #116 como cerrado.
  - **INFORME unificación** (`docs/INFORME-unificacion-central.md`) planificado en plan mode: estado
    real de adopción de packages/*, esquema de capas, plan priorizado Fases A–F. Pendiente ejecutar.
  - **Pendiente (Alberto):** borrar envs `IAREST_SUPABASE_URL`/`IAREST_SUPABASE_SERVICE_KEY` de Vercel
    (plataforma); resetear password + jubilar BD `efncqyvhniaxsirhdxaa`; `DROP iarest._mig_ddl` (opcional).
    Presentación Joaquín: ejecutar diagramas + ~8 slides.

- **⚙️ GOTCHA del entorno cloud (descubierto 11/06, importante para futuras sesiones):** en el contenedor remoto el **`git push` por HTTPS da `503` de forma persistente** (read/fetch/ls-remote SÍ funcionan; solo el push está bloqueado) → el hook `Stop` de memoria NO puede empujar. **Para escribir en GitHub usa las tools MCP** (`mcp__github__push_files` / `create_or_update_file`) o, para ficheros grandes, **rama temporal vía MCP → PR → `merge_pull_request`**. OJO: `push_files` mete el contenido **inline** y un agente puede **truncarlo** (pasó con este `CONTEXTO`, ~69 KB: quedó en "PENDING"/"PLACEHOLDER" y hubo que restaurarlo). Patrón seguro para ficheros grandes: subir a **rama aparte**, **verificar tamaño/marcadores**, y solo entonces **PR + merge** a `main` (commits `chore:` no redepliegan). Para restaurar un fichero a una versión previa sin retecleo: existe el blob en el historial (`git checkout <sha> -- <fichero>` desde un equipo con push).

- **✅ Gestión de limpiezas para Vanessa + patrones de edición reutilizables — EN PRODUCCIÓN** (backfill 11/06; trabajo del 09/06 que se había perdido de esta memoria al hacer squash-merge)
  (PR #111 → commit `3e3cc646` · PR #112 → commit `abe64527` · deploys de producción `ialimp` e `ia-rest` verificados READY. El PR #109, que mezclaba ambos trabajos y arrastraba commits de plataforma, se cerró a favor de 2 PRs limpios.)
  - **IALIMP (gestión de sesiones):** columnas `orden_manual` (int) y `urgente_manual` (bool) en `cleaning_sessions` (migración `2026-06-09_orden_manual_sesiones.sql`, aplicada en Supabase). Vista `sesiones_limpiadora` ampliada con `notas`/`orden_manual`/`urgente_manual`.
    - `PATCH /api/admin/sesiones/[id]` ampliado (session_date, hora_inicio [TEXT, sin cast], hora_checkout/checkin [::time], num_huespedes, notas, orden_manual, urgente_manual; recalcula ventana; push «⏰ Cambio de horario» si cambia fecha/hora de sesión asignada). Nuevo `POST /api/admin/sesiones/reordenar` (orden manual por día; `reset:true` → auto).
    - UI en Inicio y Agenda: ✏️ editar (`NuevaLimpiezaModal` modo edición = PATCH + eliminar), ↑↓ reordenar, ⏰ mover día, 🔥 urgente, ⧉ duplicar, filtro ⚠️ sin asignar, aviso de solapamiento. App limpiadora `/l`: chips 🔥/📝 + bloque destacado de notas/urgente antes del checklist.
    - Docs: `public/manual.html`, `docs/guia-limpiadoras.md` (WhatsApp), `docs/mejoras-vanessa.md` (admin), `apps/ialimp/CLAUDE.md` (sección orden_manual/editar).
  - **Patrones reutilizables (PR #112):** modo edición (✏️ + PUT) en Stock y Lencería (ialimp); `ProgramacionModal` modo edición (PATCH + eliminar); botones ↑/↓ para reordenar la carta del owner en ia-rest (swap `orden` + PUT).
  - Nota operativa: el push HTTP del contenedor daba 503 → todo se subió vía `mcp__github__push_files`; los PRs se mergearon con squash.

- **💰 SIVRA pricing: piloto validado + 🏷️ rename scope @central + 🧠 module-revenue Fase 1 — 11/06/2026 (tarde)**
  Sesión larga. Cuatro hitos:
  1. **Piloto Busto Reform VALIDADO de punta a punta:** se subió el techo `max_price` 110→**125€** base
     (`pricing_settings`), se ejecutó `apply` en vivo desde el panel (Alberto pulsó "Aplicar") y el **23/06
     pasó a 125€ en Smoobu, confirmado por Alberto en el calendario**. Mercado huésped p50 168€; el motor quiere
     ~144€ base pero el techo del propietario manda (125). El piso está reservado del 11 al 18 → el motor solo
     toca fechas libres (correcto).
  2. **🐛 BUG CRÍTICO de la automatización encontrado y reparado:** los crons de pricing daban **401/«CRON_SECRET
     no definido»** porque el despliegue que los corría era ANTERIOR a que Alberto metiera la env. Diagnosticado
     con los **logs de runtime de Vercel** (MCP de Vercel, ya conectado): `apply-auto` 08:30 → 401; `guard` ahora
     → 401 limpio (sin el aviso) = `CRON_SECRET` YA activo en el deploy post-merge. **El cron de mañana 08:30
     correrá de verdad por primera vez.** (El acceso de Vercel NO pasa el login NextAuth → mis llamadas a
     `/api/pricing/apply` dan 401; el disparo manual lo hace Alberto con su sesión, o con el secreto.)
  3. **🏷️ RENAME de scope `@iarest/*` → `@central/*` en TODO el monorepo (PR #147, MERGEADO):** 15 paquetes,
     deps de las 4 apps, todos los imports, `transpilePackages`, `scripts/auditar-estructura.mjs` y `pnpm-lock.yaml`
     regenerado. Verificado con las **4 previews de Vercel en verde**. **Principio anotado en `CLAUDE.md`:** los
     cambios que rompen (renames, reestructuras de BD) **se hacen AHORA, sin clientes** — con clientes ya no.
     ⚠️ Los PRs abiertos que aún importan `@iarest/*` (#137, #138, #136…) necesitarán rebase a `@central/*`.
  4. **🧠 `@central/module-revenue` Fase 1 (PR #148, MERGEADO):** paquete **puro y multisector** (patrón
     `module-concursos`: TS puro, sin BD/red/secretos) de análisis de demanda. Entradas `DemandEvent`/`CapacitySlot`;
     funciones `occupancyByDow`, `seasonalityByMonth`, `leadTimeStats`, `pickupCurve`, `paceVsBaseline`, `channelMix`,
     `revenueKpis`, todas con guardia de muestra. **9/9 tests `node --test`** + `tsc` limpio. El mismo cerebro
     servirá a ia-rest (cubiertos) e ialimp (servicios) con su adapter. Spec:
     `docs/superpowers/specs/2026-06-11-revenue-module-design.md`; plan: `docs/superpowers/plans/2026-06-11-module-revenue-fase1.md`.
  - **Diseño aprobado (spec completa, 3 fases):** análisis + **auto-ajuste dentro de límites + freno**, configurable
    y supervisable **por dueño/piso** (override manual gana, topes min/max = autoridad final). Extras aprobados:
    **backtest "¿qué habrías ganado?"**, modo por palanca (supervisado/auto), "explica por qué", presets.
  - **PENDIENTE (siguiente sesión):** **Fase 1b** = cablear SIVRA (adapters `incomes`→`DemandEvent[]`,
    `rate_snapshots`→`CapacitySlot[]`; endpoint + panel `/revenue` + digest semanal) → aquí Alberto valida la
    hipótesis "domingos fuertes" con sus datos. Luego **Fase 2** y **Fase 3** (ritmo/antelación, min-stay vía API
    Smoobu, alarma de "dinero perdido"). Datos ya disponibles: `incomes` = **1.745 reservas reales** (6 años, canal,
    createdAt, checkIn/out) — no hace falta ingestar nada nuevo.
  - **Pendiente menor de Alberto:** activar `apply_enabled` en Dúplex/Luxury/House al desconectar PriceLabs.

- **📸 Auditoría agente Instagram (ia.rest) — "no sube nada" RESUELTO — 11/06/2026**
  Síntoma de Alberto: la automatización de Instagram genera pero no publica nada desde el ~2-jun.
  - **Causa raíz (confirmada en vivo):** el **corte de BD del 10-jun**. Producción pasó a leer el schema
    nuevo `iarest`, pero los borradores y el historial quedaron **huérfanos en la BD vieja**
    (`efncqyvhniaxsirhdxaa`, `public`). Al aprobar en Telegram, el webhook buscaba el borrador en la BD nueva,
    no lo encontraba → respondía **"Ya procesado"** → no publicaba. **Token, webhook y código estaban OK.**
  - **Diagnóstico end-to-end (sin egress desde el contenedor):** se hizo vía Supabase MCP + Edge Functions
    temporales (`tg-send` confirmó que el token del bot vive como secret en EFs; `tg-webhookinfo` confirmó webhook
    sano: URL correcta, 0 pending, 0 errores). Se publicó un **post real** (`18102380903021918`) creando un borrador
    en la BD **nueva** y aprobándolo → confirma que toda la cadena funciona.
  - **Resuelto:** (1) **migrados los 19 borradores pendientes** vieja→nueva (EF `ig-migrate`, service role) →
    `iarest.instagram_borradores`: 19 pendientes + 1 aprobado. (2) Desde el viernes el cron generará ya en la BD
    nueva (flujo normal). (3) **PR #142 MERGEADO a `main`**: arregla `obtenerMetricas` (pedía métricas inválidas/`impressions`
    deprecada) y añade registro de fallos de publicación en `system_errors` (callback Telegram + `/super` + cron); fin de
    fallos silenciosos.
  - **⚠️ Hallazgo de fondo (pendiente):** el corte de BD a `iarest` **no estaba realmente migrado** para Instagram
    (drafts/historial seguían en la vieja). Revisar que el resto de datos (comandas, etc.) estén realmente en la nueva
    o que producción siga apuntando a la vieja — la tabla `comandas` del schema nuevo está vacía.
  - **🧹 Limpieza manual pendiente (Alberto):** borrar del dashboard Supabase las EFs temporales (ya inertes, devuelven 410):
    `ig-test-send` (en ambos proyectos), `tg-webhookinfo` (viejo) e `ig-migrate` (nuevo).
  - **Decisión de producto de Alberto:** mantener el modelo **publicación automática previa autorización en Telegram**
    (no autopublicar sin aprobar).
- **✅ IALIMP — chat del equipo visible en el menú lateral (PR #114, mergeado a prod) — 10/06/2026**
  Vanessa (Sique Brilla) probaba el chat con las limpiadoras y no lo encontraba en su panel. El chat
  (`/admin/chat`) **ya existía y funcionaba**, pero solo era accesible desde la barra inferior del **móvil**;
  en el **menú lateral del escritorio** (`NAV` en `app/dashboard/DashboardClient.tsx`) no había entrada de chat
  y el único 💬 era «Asistente» (que es el **ayudante de IA**, `/admin/asistente`) → confusión.
  - **Fix:** añadida entrada **«💬 Chat equipo» → `/admin/chat`** al menú lateral; el asistente de IA pasa a
    **«🤖 Asistente IA»** para no chocar el icono 💬. (NOTA: después la rama de Concursos añadió también
    «🏛️ Concursos» al mismo `NAV`; conviven sin problema.)
  - `public/manual.html`: sección Chat con la ruta exacta (lateral en escritorio / barra inferior en móvil) +
    aclaración Chat-equipo vs Asistente-IA + recordatorio de cómo lo ve la limpiadora en `/l`.
  - Solo navegación + manual. Sin datos, API ni migraciones. **Mergeado a `main` (squash `86bd78a`) y desplegado
    a producción (`app.ialimp.es`).** Lo de «enviar el enlace» y «editar» que Vanessa también probaba ya iba bien.

- **📡 Concursos — Infra F7: Radar PLACSP en vivo + OCR de pliegos — 11/06/2026 (rama `claude/concursos-radar-ocr-infra`)**
  Cierra la infraestructura de F7 sobre el núcleo puro ya en producción. Spec/plan:
  `docs/superpowers/specs/2026-06-11-concursos-radar-ocr-infra-design.md` · `docs/superpowers/plans/2026-06-11-concursos-radar-ocr-infra.md`.
  - **Parser ATOM PURO (`apps/ialimp/lib/concursos-radar.ts`, TDD `node --test` → 4/4):** `parsearAtomPlacsp` (CODICE de PLACSP, `fast-xml-parser` con `removeNSPrefix`, tolerante a campos ausentes → título/objeto/cpv/presupuesto/órgano/url/expediente), `dedupeKey` (expediente > atom_id > url) y `matchesDeAtom` (empareja con `filtrarRadar`/`coincideRadar` del módulo → puntuación + motivos + dedupe). Fixture en `lib/__fixtures__/placsp-sample.atom.xml`.
  - **Adaptación del módulo (aditiva, 79/79 intacto):** subpath export `"./radar": "./src/radar.ts"` en `packages/module-concursos/package.json` para poder importar `filtrarRadar`/`coincideRadar` bajo `node --test` (el bare `index.ts` arrastra imports extensionless que el type-stripping de Node 22 rechaza). Los tipos siguen importándose del bare package.
  - **Radar (app):** migraciones `add_concursos_radar_criterios.sql` (amplía `concursos_perfil_empresa` con `radar_activo`/`radar_cpv[]`/`radar_palabras_clave[]`/`radar_presupuesto_min·max`) y `add_concursos_radar_anuncios.sql` (tabla con `unique(empresa_id, dedupe_key)`). Endpoints `radar/criterios` (GET/PUT), `radar` (GET lista + `no_vistos`), `radar/visto` (POST), `radar/importar` (POST import manual de ATOM). Cron `/api/cron/concursos-radar` cada 6 h (`0 */6 * * *`, en `vercel.json`): descarga la sindicación ATOM paginada (`PLACSP_FEED_URL` configurable, default público, hasta 3 páginas siguiendo `rel="next"`), filtra por empresa con `radar_activo` e inserta matches nuevos (`ON CONFLICT DO NOTHING`). **Aviso in-app** (contador de no vistos) — NO web-push (las suscripciones push de ialimp son de limpiadoras).
  - **OCR (app):** `lib/concursos-ocr.ts` — `rasterizarPdf` (pdfjs-dist legacy `legacy/build/pdf.mjs` + `@napi-rs/canvas`, hasta 12 págs) y `ocrPaginasPliego` (cada página → `nimVision`, modelo de visión que ialimp ya usa, sin claves nuevas). Integrado en `analizar/route.ts`: si `necesitaOcr(texto)` → OCR → reanaliza; respuesta añade `ocr_aplicado`. `next.config.ts`: `@napi-rs/canvas`/`pdfjs-dist` en `serverExternalPackages` (load-bearing).
  - **UI (`/admin/concursos/page.tsx`):** panel **"📡 Radar de oportunidades"** (criterios CPV/palabras/presupuesto + toggle activo + lista de matches con puntuación/motivos/enlace/«visto» + badge de no vistos) y aviso **"📄 Documento escaneado — OCR"** en la ficha (prop `ocrAplicado`).
  - **Verificación:** parser 4/4, módulo 79/79, `apps/ialimp npm run build → ✓ Compiled successfully` en cada tarea (aborta luego por `JWT_SECRET` ausente = env local).
  - **⚠️ Pendiente de Alberto:** (1) aplicar las 2 migraciones en Supabase; (2) **validar la rasterización OCR en la preview de Vercel** (riesgo: pdfjs+napi-canvas en runtime serverless; fallback documentado = subir páginas como imágenes); (3) opcional: ajustar `PLACSP_FEED_URL` por CPV/región. El cron no necesita secreto (lo invoca Vercel cron).
- **🔌 Portar ialimp y sivra a módulos compartidos (proveedores, inventario, CRM) — 11/06/2026**
  PR #143 mergeado. Cierra la deuda de reimplementación detectada en la auditoría de estructura (PR #141).
  Patrón Ports & Adapters: cada vertical aporta su adapter que implementa la interfaz del módulo compartido.
  Sin cambios de BD — solo adaptadores + reuso de funciones puras del módulo.
  - **ialimp (multi-tenant):**
    - `apps/ialimp/lib/adapters/proveedores.ts` → `ProveedorAdapter<ProveedorRow>` sobre `@iarest/module-proveedores`
    - `apps/ialimp/lib/adapters/inventario.ts` → `ArticuloAdapter<ProductoStockRow>` + `AsignacionAdapter<StockConsumoRow>` sobre `@iarest/module-inventario`
    - `apps/ialimp/lib/adapters/crm.ts` → `OportunidadAdapter<LeadRow>` con mapeo de estados (`propuesta_enviada→propuesta`, `presupuestado→negociacion`) sobre `@iarest/module-crm`
    - `api/admin/proveedores` GET: añade `proveedores_canonicos`; `api/admin/stock` GET: añade `resumen`; `api/admin/leads` GET: añade `pipeline`
    - `package.json`: deps `module-proveedores`, `module-inventario`, `module-crm` con `workspace:*`
  - **sivra (single-tenant):**
    - `apps/sivra/lib/adapters/proveedores.ts` → igual que ialimp pero sin `empresa_id`
    - `apps/sivra/lib/adapters/inventario.ts` → catálogo de referencia (`cantidadTotal=0`, sin stock operativo)
    - `api/admin/limpiadoras/proveedores` GET: añade `proveedores_canonicos`; `api/admin/limpiadoras/productos` GET: añade `resumen`
    - `package.json`: deps `module-proveedores`, `module-inventario`
  - **Radiografía:** 0 reimplementaciones (antes 3). `kits_limpiadoras` queda fuera del módulo a propósito (asignación permanente limpiadora ≠ AsignacionActivo por sesión).
  - **✅ PR #143 MERGEADO a `main` — 11/06/2026.** Builds Vercel todos verdes (ialimp, sivra, plataforma, ia-rest).

- **🏛️ Concursos F7 — Radar PLACSP + OCR (CIERRA el agente F2–F7) — 11/06/2026**
  Última fase del agente de concursos (`packages/module-concursos`). Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f7-radar-ocr.md`.
  - **Módulo puro (`src/radar.ts`, TDD, 7 tests nuevos → 79/79 verde):** `coincideRadar` (empareja un anuncio con los
    criterios de la empresa: CPV por prefijo +50, palabras clave sin acentos +30; presupuesto fuera de rango DESCARTA),
    `filtrarRadar` (los que casan, ordenados por relevancia) y `necesitaOcr` (heurística: texto extraído < `MIN_TEXTO_PLIEGO`=200
    → PDF escaneado, hay que pasarle OCR). Tipos `AnuncioRadar`/`CriteriosRadar`/`CoincidenciaRadar`. Sigue puro (sin BD/IA/secretos).
  - **Infraestructura pendiente (documentada, NO en esta sesión):** el **sondeo en vivo de PLACSP** (feed Atom de la
    Plataforma de Contratación del Sector Público → normalizar a `AnuncioRadar[]` → `filtrarRadar` por empresa → avisar por
    web-push) y el **motor OCR** (cuando `necesitaOcr` es true: Tesseract/cloud) requieren cron + claves; el módulo expone el
    contrato que consumirán. No verificable en este entorno.
  - **✅ ESTADO DEL AGENTE:** **F2–F7 completas a nivel de módulo puro** (con tests, **79/79**) e **integradas en ialimp F2–F6**
    (biblioteca · sobre administrativo/DEUC · memoria técnica · oferta económica · presentación/plazos). F7 entrega el núcleo
    radar/OCR; la captación en vivo queda como infraestructura. Todo en PR #135 (rama `claude/public-tender-agent-module-mid0hu`).
  - **✅ Migraciones APLICADAS por Alberto en Supabase (`wswbehlcuxqxyinousql`) — 11/06/2026:** `add_biblioteca_concursos.sql`
    (tabla `biblioteca_documentos`, F2), `add_concursos_perfil.sql` (tabla `concursos_perfil_empresa`, F3),
    `add_concursos_memoria.sql` (col. `concursos.memoria` jsonb, F4), `add_concursos_oferta.sql` (col. `concursos.oferta` jsonb, F5).
    Los paneles F2–F5 ya tienen la BD lista en producción.
  - **✅ PR #135 MERGEADO a `main` — 11/06/2026:** agente de concursos F2–F7 en producción. Se resolvieron 2 conflictos
    sucesivos con `main` (solo en `docs/CONTEXTO-SESIONES.md`/`apps/ialimp/CLAUDE.md`, entradas de doc en paralelo —
    conservados ambos lados). Suite 79/79 tras cada merge. Deploy de producción de ialimp disparado por el merge.

- **🏛️ Concursos F6 — Presentación + plazos/subsanación — 11/06/2026**
  Sexta fase del agente de concursos (`packages/module-concursos`). Cierra el flujo: cuenta atrás al fin de plazo,
  comprobación de que los sobres requeridos están listos para presentar y plazo de subsanación en días hábiles. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f6-presentacion-plazos.md`.
  - **Módulo puro (`src/presentacion.ts`, TDD, 10 tests nuevos → 72/72 verde):** `diasEntre` (días naturales entre dos
    fechas ISO en UTC), `sumarDiasHabiles` (suma días hábiles saltando sábados/domingos, sin festivos), `estadoPresentacion`
    (plazo abierto/urgente ≤3 días + sobres REQUERIDOS: técnico solo si hay juicio de valor, económico solo si hay criterio
    económico, administrativo siempre → `listo` + `pendientes`) y `plazoSubsanacion` (3 días hábiles por defecto, art. 141 LCSP).
    Tipos `SobresListos`/`EstadoPresentacion`/`PlazoSubsanacion` en `types.ts`; re-exports en `index.ts`. Sigue puro
    (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** **sin migración nueva** (cómputo en vivo en cliente). Panel **"Presentación"** en la
    ficha de `/admin/concursos`: cuenta atrás al fin de plazo (🔴 urgente / ⛔ cerrado), checklist de sobres listos
    (administrativo/técnico/económico) que alimenta `estadoPresentacion`, veredicto "Listo para presentar" o lista de pendientes,
    y aviso del plazo de subsanación (3 días hábiles) calculado con `plazoSubsanacion`. Usa las funciones puras importadas de
    `@iarest/module-concursos` (sin LLM ni endpoint). `✓ Compiled successfully` (aborta después en "Collecting page data" por
    `JWT_SECRET` ausente del entorno local — env, no código).

- **🏛️ Concursos F5 — Oferta económica + rentabilidad — 11/06/2026**
  Quinta fase del agente de concursos (`packages/module-concursos`). Ayuda al licitador a fijar el precio de su
  oferta: que sea **rentable** (cubre coste + margen), **competitiva** (puntúa) y **no temeraria**. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f5-oferta-economica.md`.
  - **Módulo puro (`src/oferta.ts`, TDD, 9 tests nuevos → 62/62 verde):** `costeTotal` (directos + indirectos),
    `precioMinimoRentable` (coste, o `coste / (1 − margen/100)` con margen objetivo sobre el precio) y `evaluarOferta`
    (margen €/%, puntos económicos reutilizando `calcularPuntuacionEconomica`, baja temeraria con `umbralBajaTemeraria`
    y viabilidad). Tipos `CosteEjecucion`/`EvaluacionOferta` en `types.ts`; re-exports en `index.ts`. El **coste lo aporta
    la app** (puede venir de contabilidad); el módulo solo opera números. Sigue puro (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** columna **`concursos.oferta`** jsonb (`prisma/migrations/add_concursos_oferta.sql`);
    endpoint `app/api/admin/concursos/[id]/oferta` (GET carga / PUT guarda los datos de entrada), con `requireEmpresaId` +
    Prisma `$queryRaw` con casts (patrón del v1); panel **"Oferta económica"** en la ficha de `/admin/concursos`. La
    **evaluación se calcula en vivo en el cliente** con `evaluarOferta`/`precioMinimoRentable` (módulo puro importado, sin LLM):
    precio mínimo rentable, margen, puntos económicos, aviso de baja temeraria y veredicto de viabilidad; el PUT solo persiste
    los datos de entrada. `✓ Compiled successfully` (aborta después en "Collecting page data" por `JWT_SECRET` ausente del entorno local — env, no código).
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_oferta.sql` en la BD compartida.

- **🏛️ Concursos F4 — Memoria técnica que puntúa — 11/06/2026**
  Cuarta fase del agente de concursos (`packages/module-concursos`). Genera la **memoria técnica** atacando los
  **criterios de juicio de valor** de la ficha y estima cuántos puntos técnicos cubre. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f4-memoria-tecnica.md`.
  - **Módulo puro (`src/memoria.ts`, TDD, 8 tests nuevos → 53/53 verde):** `planificarMemoria` (deriva una
    sección por criterio de juicio de valor, ordenadas por puntos desc), `construirPromptMemoria` (par
    `{system, user}` por sección, lo pasa la app al LLM como `construirPromptPliego`) y `coberturaMemoria`
    (estima puntos cubiertos: una sección "puntúa" si su contenido alcanza `MIN_CONTENIDO_CHARS`; lista las
    `vacias`). Tipos `SeccionMemoria`/`SeccionMemoriaRellena`/`MemoriaTecnica`/`CoberturaMemoria` en `types.ts`;
    re-exports en `index.ts`. Sigue puro (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** columna **`concursos.memoria`** jsonb (`prisma/migrations/add_concursos_memoria.sql`);
    endpoint `app/api/admin/concursos/[id]/memoria` (GET devuelve memoria guardada + cobertura; POST planifica, redacta
    cada sección con el LLM vía el **`aiRunner`** de `lib/concursos.ts` —que envuelve `aiComplete` de core-ai— y persiste),
    con `requireEmpresaId` + Prisma `$queryRaw` con casts (patrón del v1); panel **"Memoria técnica"** en la ficha de
    `/admin/concursos` (botón "✍️ Generar memoria técnica" + barra de cobertura + secciones en `<details>`).
    `✓ Compiled successfully` (aborta después en "Collecting page data" por `JWT_SECRET` ausente del entorno local — env, no código).
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_memoria.sql` en la BD compartida.

- **🏛️ Concursos F3 — Sobre administrativo + DEUC — 11/06/2026**
  Tercera fase del agente de concursos (`packages/module-concursos`). Genera el **Sobre 1 (administrativo)**
  de un concurso tirando de la biblioteca de empresa (lista de documentos exigidos con qué doc los cubre),
  más el **DEUC** y la **declaración responsable** (art. 140 LCSP) rellenos como datos. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f3-sobre-administrativo-deuc.md`.
  - **Módulo puro (`src/deuc.ts`, TDD, 5 tests nuevos → 45/45 verde):** `documentosSobreAdministrativo`
    (reutiliza `derivarChecklist` del v1 + `tipoDeDocumento` de F2, filtra a sobre `administrativo` y marca
    `cubiertoPor` con el doc de la biblioteca), `construirDeuc` (ensambla las partes I–IV/VI desde ficha+empresa,
    motivos de exclusión y veracidad a favor), `construirDeclaracionResponsable` (identidad + afirmaciones estándar).
    Tipos `DatosIdentificacionEmpresa`/`ItemSobreAdministrativo`/`Deuc`/`DeclaracionResponsable` en `types.ts`;
    re-exports en `index.ts`. Sigue puro (sin BD/IA/secretos); produce datos (la app los renderiza al PDF/XML oficial más adelante).
  - **Integración ialimp (referencia):** tabla **`concursos_perfil_empresa`** (`prisma/migrations/add_concursos_perfil.sql`,
    una fila por empresa, scope `empresa_id`); endpoints `app/api/admin/concursos/perfil` (GET/PUT del perfil) y
    `app/api/admin/concursos/[id]/sobre-administrativo` (GET cruza ficha + biblioteca + perfil → sobre + DEUC + declaración),
    ambos con `requireEmpresaId` + Prisma `$queryRaw` con casts (patrón del v1); página `/admin/concursos/perfil` (formulario
    del perfil) + panel "Sobre administrativo" en la ficha de `/admin/concursos` (botón "📋 Generar sobre administrativo (DEUC)")
    y enlace "🏢 Perfil de empresa" en cabecera. `✓ Compiled successfully` (aborta después en "Collecting page data" por
    `JWT_SECRET` ausente del entorno local — env, no código).
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_perfil.sql` en la BD compartida.

- **🏛️ Concursos F2 — Biblioteca de empresa (PR #135) — 11/06/2026**
  Segunda fase del agente de concursos (`packages/module-concursos`). El cliente sube sus documentos/datos
  **una vez** y cada concurso autocompleta su checklist, marca lo que falta y avisa de caducidades. Se diseñó
  primero el **spec norte del agente completo** (F2–F7: biblioteca · sobre administrativo/DEUC · memoria técnica
  que puntúa · oferta económica+rentabilidad · presentación/plazos · radar PLACSP+OCR) en
  `docs/superpowers/specs/2026-06-11-agente-concursos-completo-design.md`, con plan de F2 en
  `docs/superpowers/plans/2026-06-11-concursos-f2-biblioteca-empresa.md`. Implementación por fases, empezando por F2.
  - **Módulo puro (`src/biblioteca.ts`, TDD, 12 tests nuevos → 40/40 verde):** `tipoDeDocumento` (clasificador
    nombre→tipo, conservador, sin acentos), `autocompletarChecklist` (marca `hecho` lo cubierto, inmutable),
    `documentosFaltantes` (lo que la biblioteca no cubre), `documentosCaducados` (vence antes del corte/fin de plazo).
    Tipos `TipoDocumentoBiblioteca`/`DocumentoBiblioteca`/`Biblioteca` en `types.ts`; re-exports en `index.ts`. Sigue puro
    (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** tabla **`biblioteca_documentos`** (`prisma/migrations/add_biblioteca_concursos.sql`,
    scope `empresa_id`); endpoint `app/api/admin/concursos/biblioteca` (GET lista/POST alta, `requireEmpresaId` + Prisma
    `$queryRaw` con casts en SQL, patrón del v1); página `/admin/concursos/biblioteca` ("Mi biblioteca", white-label);
    `/admin/concursos` autocompleta el checklist (✅/⬜) y avisa de documentos faltantes con enlace. `✓ Compiled successfully`.
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_biblioteca_concursos.sql` en la BD compartida
    (no aplicado desde la sesión, como el resto de migraciones). Follow-up: `public/manual.html` al promover la sección.
- **🚀 SIVRA pricing auto — producción activa + legacy eliminado — 11/06/2026**
  Sesión de cierre: vars Vercel confirmadas por Alberto y motor diario activo.
  - **✅ Vars Vercel configuradas por Alberto:** `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY` → motor diario `apply-auto` (08:30) y notificaciones push **activos en
    producción** (`sybra.vercel.app`).
  - **✅ Busto Reform:** `apply_enabled=true`, PriceLabs desconectado → el cron escribe precio
    base en Smoobu cada mañana según mercado + parámetros del propietario.
  - **✅ Legacy `detect-opportunities` eliminado:** el cron antiguo mandaba correos con precios
    calculados por la fórmula vieja (base × SEASONAL × DOW, sin ancla de mercado ni topes del
    propietario) → cifras absurdas (ej. Dúplex 368€ vs mercado real ~155€). Eliminados: cron en
    `vercel.json`, endpoint `api/pricing/detect-opportunities`, exclusión del middleware.
    El motor nuevo (`apply-auto` + `resumen-diario`) lo sustituye completamente.
  - **⏳ Pendiente de Alberto:** desconectar PriceLabs de Dúplex Center, Luxury Busto y House
    Sevillana, y activar `apply_enabled` en `sybra.vercel.app/pricing-auto` para cada uno.

- **✅ SIVRA en PRODUCCIÓN: pricing automático + 2 fixes de cuelgue (#108, #113, #115) — 10/06/2026 (tarde)**
  Los 3 PRs **mergeados a `main` y desplegados** en `sybra.vercel.app` (dominio de prod del proyecto Vercel `sivra`;
  alias: sybra/sivra-app/housesevillana). Resumen de la tarde:
  - **#108** pricing automático completo (ver entrada de abajo).
  - **🐛 #113 — cuelgue "Cargando…" en `/limpiadoras`:** Alberto entró en el móvil con sesión admin caducada + cookie
    `limpiadora_token` zombi → el middleware lo mandaba a `/limpiadoras`, cuyo `load()` hacía `fetch().json()` **sin
    try/catch** → si fallaba, `setLoading(false)` nunca corría → spinner eterno, sin logout ni botón atrás. Fix:
    `app/limpiadoras/page.tsx` valida el token al montar (`GET /api/limpiadoras/auth`; si null → `DELETE` cookie +
    redirect a login), try/catch/finally + estado error + botón "Reintentar", header con **"Salir"** y enlace
    **"¿Eres administrador? Entrar"**. Nuevo helper `lib/limpiadora-auth.ts` (token válido O sesión admin) aplicado a los
    endpoints `/api/limpiadoras/*` (sessions, fichar, complete, incidencias, inventario, early-checkin) → 401 si inválido.
  - **🐛 #115 — mismo patrón en `/gastos`:** `fetchGastos` sin try/finally → blindado. Auditadas las demás páginas del
    dashboard (income, inversion, updates, mensajes, seo, properties, calendario, knowledge, mercado): ya correctas.
  - **🔑 Claves VAPID generadas** (para avisos push): se le pasaron a Alberto por chat para pegar en Vercel
    (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). NO van en el repo.
  - **⏳ PENDIENTE DE ALBERTO (en Vercel → proyecto sivra → Environment Variables, Production+Preview):**
    1. `CRON_SECRET` (cadena larga al azar) → **activa el `apply-auto` diario**; sin él el cron no escribe (más seguro) y
       el panel manual sigue funcionando con su sesión. 2. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (push).
       Tras añadirlas: **Deployments → Redeploy**. 3. Desconectar **PriceLabs** en cada piso a automatizar + marcar
       `apply_enabled` en `/pricing-auto`. (Opcional) `MARKET_API_URL`/`MARKET_API_KEY` para la fuente de mercado auto.
  - **Acceso del propietario:** `https://sybra.vercel.app/login` con `ADMIN_EMAIL`/`ADMIN_PASSWORD` (los de siempre,
    viven en Vercel) → menú **⚙ Pricing Auto**.

- **🗑️ Desactivar/reactivar cliente en ialimp (baja reversible, conserva histórico) — 11/06/2026**
  La UI ya tenía `c.activo` a medio cablear pero SIN backend. Completado: migración
  `add_cliente_desactivacion.sql` (auditoría `desactivado_*`; `clientes.activo` ya existía, aplicada en
  Supabase). Rutas `POST /api/admin/clientes/[id]/desactivar` (GET=preview de impacto) y `/reactivar`.
  Desactivar = `activo=false` + cancela limpiezas futuras no hechas + corta acceso del portal (rota
  `session_jti`, **nunca a NULL**); conserva facturas, chat, limpiezas hechas y pisos. El cron `pms/sync`
  excluye propiedades/conexiones de clientes inactivos (si no, recrearía las limpiezas). `GET
  /api/admin/clientes` devuelve solo activos por defecto (`?incluir_inactivos=1` para todos) → limpia todos
  los selectores. UI: filtro Activos/Inactivos + modal de confirmación con resumen + aviso de impagos +
  motivo + botón Reactivar. Spec: `docs/superpowers/specs/2026-06-11-desactivar-cliente-design.md`.
  **✅ Probado en vivo contra producción** (cliente `[TEST] Pisos Sevilla Centro SL`, sin tocar datos
  reales): desactivar deja `activo=false` + auditoría `desactivado_*` + `session_jti` rotado (corta sesión
  del portal) + lo excluye del selector activo y del cron `pms/sync`; reactivar restaura todo y conserva los
  2 pisos. Ciclo completo verificado y cliente dejado como estaba. Pendiente único: prueba de la UI/HTTP
  autenticada como Vanessa (no se pudo ejercitar sin su sesión); la capa de datos está verificada.

- **🎛️ God-panel (panel único de operador) F1–F5 en `apps/plataforma/admin` — 10/06/2026 (PR #118)**
  Panel de Alberto que gobierna TODAS las verticales desde un sitio, reutilizando la tabla `superadmins`
  (mismo login que el `/superadmin` de ialimp; cookie `plataforma_admin`). Adaptadores por vertical
  (`lib/adapters/*`, contrato `VerticalAdapter`): ialimp+sivra por BD compartida directa, ia-rest por
  **puerto HTTP** (`/api/operador/restaurantes`, Bearer `OPERADOR_SHARED_SECRET`). **F1** listado unificado +
  bloquear/liberar (`empresas.activa`/`restaurantes.activo`) + vista 360. **F2** módulos por cliente: tabla
  `tenant_modulos` (opt-out) + toggles + gateo real en ialimp (login→`modulos_off` en JWT→middleware; menú
  oculta lo apagado; default vacío = Vanessa intacta). **F3** crear cliente (empresa ialimp / restaurante
  ia-rest). **F4** ia-rest por puerto. **F5** unificación NO destructiva (banner en `/superadmin`, sin borrar
  mailing). Apartado **🗺️ Estructura** (verticales/módulos/agentes). 3 builds verdes; capa de datos probada.
  **Nota:** la BD ya está unificada (#117/#119) → a futuro el adaptador de ia-rest puede leer el schema
  `iarest` directo en vez del puerto HTTP. **Pendiente de Alberto:** `OPERADOR_SHARED_SECRET` (plataforma+ia-rest).
- **✅ CORTE BD ia-rest → proyecto compartido EJECUTADO Y VERIFICADO EN PRODUCCIÓN (PR #117) — 10/06/2026**
  El corte (Fase A2) está **hecho**: ia-rest producción consulta el schema `iarest` del compartido
  (`wswbehlcuxqxyinousql`). La causa de que los redeploys no funcionaran NO era caché ni "Sensitive":
  **el código que lee `NEXT_PUBLIC_SUPABASE_SCHEMA` vivía solo en la rama del PR #110 (sin mergear)**;
  producción despliega desde `main`, que nunca miró la variable → todo iba a `public` → 404.
  - **Fix quirúrgico (PR #117, mergeado a main):** extraído de la rama SOLO el interruptor de schema —
    `lib/supabase.ts` (`SB_SCHEMA`/`SB_OPTS`) + los 9 ficheros con `createClient` (cobertura 100%, 10 call
    sites), sin arrastrar `module-*` ni nada más. 9 ficheros, +35/−9, env-gated y reversible por envs.
  - **Verificado con logs de Supabase:** antes del deploy los crons daban 404 (`alerta_reglas`, `comandas`,
    `qr_sesiones_cliente`, RPCs…); tras el deploy (18:45) **todo 200/204**. El preview del PR ya lo había
    confirmado (build → `web_restaurante`/`blog_borradores` 200).
  - **PR #110 TAMBIÉN MERGEADO a `main` (10/06):** todo el trabajo restante de la rama
    `claude/joaquin-jaen-expansion-4nyju5` (HITO 3 financiero ia-rest en plataforma, `packages/module-*`
    —crm/inventario/agenda/presupuestos/proveedores/portales/feedback/ocr/asn—, docs de diseño de
    modularización y materiales/flota) queda en `main`. Conflictos de merge resueltos: `asn/route.ts`
    (se mantiene la versión con `@iarest/module-asn` + `SB_OPTS`) y `CONTEXTO-SESIONES.md` (versión de la
    rama, histórico completo). 80 ficheros, +2892/−162. Las 4 apps tenían previews verdes.
  - **✅ UNIFICACIÓN DE BD COMPLETA (PR #119, mergeado a main):** plataforma leía el financiero de ia-rest
    del proyecto VIEJO por un puente service-role; ahora lee `iarest.v_resumen_financiero_anual` con la
    **conexión Prisma normal** (rol `postgres`, con `USAGE` sobre `iarest`; verificado en vivo — `authenticator`
    NO tiene acceso → aislamiento intacto). Eliminado `apps/plataforma/lib/iarest.ts` y la dependencia de
    `IAREST_SUPABASE_*`. `next build` de plataforma verde. **Resultado: las 3 apps en UNA sola BD, sin ningún
    puente externo — nada en el código apunta ya a `efncqyvhniaxsirhdxaa`.**
  - **PENDIENTE (todo de Alberto, ya nada de unión por mi parte):** borrar de Vercel (plataforma) las envs
    `IAREST_SUPABASE_URL`/`IAREST_SUPABASE_SERVICE_KEY` (ya no se usan); resetear password BD del proyecto viejo
    (quedó en chat) y **jubilar `efncqyvhniaxsirhdxaa`** cuando lo vea estable. ~~`add_concursos.sql` (del #116)~~
    → **✅ aplicada** (11/06). Opcional/mío con tu OK: `DROP iarest._mig_ddl` (andamiaje de la migración,
    destructivo). Rollback del corte = revertir las 3 envs de Vercel de ia-rest (el código en `main` sin
    `NEXT_PUBLIC_SUPABASE_SCHEMA` vuelve a `public`).
  - **Skill `ia-rest-maestro` actualizada:** sección Supabase y tabla de infraestructura apuntan al compartido
    `wswbehlcuxqxyinousql` + schema `iarest` (con nota de fijar el schema en todo cliente/Realtime/EF nuevo).
- **🏛️ NUEVO módulo `packages/module-concursos` — agente de concursos públicos (v1) — 10/06/2026**
  Módulo enchufable (patrón `module-contabilidad`: lógica **pura** TS, sin BD, sin UI, sin secretos) para preparar
  documentación de licitaciones (LCSP). **NO es una vertical**: cualquier app lo consume para que su cliente, de
  **cualquier sector** (limpieza, catering, fontanería…), se presente a concursos. El LLM entra por un **puerto
  inyectado `AiRunner`** → el módulo nunca importa `core-ai` ni lee `process.env`.
  - **API del módulo:** `analizarPliego(runner, texto)` / `analizarConcurso(runner, texto, perfil, hoy)` →
    `FichaConcurso` (objeto, presupuesto, plazos, solvencia, criterios con pesos/fórmula, documentos por sobre) +
    derivados puros: `derivarChecklist`, `evaluarGoNoGo` (semáforo + banderas rojas), `calcularGarantias`,
    `umbralBajaTemeraria` (RGLCAP art. 85), `calcularPuntuacionEconomica`. **28 tests** (`node --test`, 28/28 verde).
  - **Integración de referencia en ialimp** (1er consumidor, validable de punta a punta): dep `workspace:*` +
    `transpilePackages`; `lib/concursos.ts` (AiRunner con `aiComplete` + `extraerTextoPdf` con `pdf-parse`);
    ruta `app/api/admin/concursos/analizar` (POST analiza PDF/texto y persiste, GET lista; scope `empresa_id`);
    página `/admin/concursos` (subir pliego → ficha + semáforo Go/No-Go + checklist); enlace en el menú del dashboard;
    migración `prisma/migrations/add_concursos.sql` (tabla `concursos`, jsonb ficha/checklist/go_no_go/garantias).
  - **Verificado:** `✓ Compiled successfully` en `next build` de ialimp (transpilePackages resuelve el módulo; ruta y
    página emitidas en `.next`). **Aislamiento OK** (grep: sin imports de `@iarest/*`/`process.env`/prisma en `src/`).
    **PR #116 (borrador)** — CI Vercel en **verde** (ialimp, ia-rest, sivra, plataforma → Ready).
  - **Roadmap (mismo módulo, fases F2–F9):** biblioteca de empresa, sobre administrativo/DEUC, memoria técnica que
    puntúa, oferta económica + rentabilidad (cruce `module-contabilidad`), plazos/subsanación, presentación lista para
    subir, RAG + radar PLACSP, OCR. Spec del v1: plan aprobado en sesión.
  - **Pendiente de Alberto:** ~~`add_concursos.sql`~~ → **✅ aplicada en BD compartida (11/06)**. El v1 lee
    `NVIDIA_API_KEY` (ya configurada en ialimp). Manual `public/manual.html` y la doc de regla de
    `apps/ialimp/CLAUDE.md` quedan como follow-up al promover la sección a producción.

- **✅ SIVRA pricing automático — PRODUCTO COMPLETO mergeado a producción (PR #108) — 10/06/2026**
  De piloto a producto vendible en una sesión. Sobre el motor anclado al mercado + panel `/pricing-auto`:
  - **Automático de verdad:** pipeline de crons en `vercel.json` — `07:30` `pricing/guard` (detector de reversión de
    PriceLabs + suelo de coste), `08:30` `pricing/apply-auto` (escribe el precio respetando pausa, guardia de confianza
    y `apply_enabled`), `09:00` `pricing/resumen-diario` (email+push).
  - **Salvaguardas ("no puede fallar"):** pausa global (`pricing_config.paused`, botón de pánico), guardia de confianza
    (no escribe con <5 comps o mercado >7d), detector de reversión (alerta `precio_revertido`), `pricing/restore`
    (deshacer), topes min/max del propietario como autoridad final.
  - **Motor:** `lib/pricing-calendar.ts` (compartido con snapshot) → `eventFactor` (Semana Santa/Feria, +50% máx, flag
    `events_enabled`) y `gap_discount_pct` (noche-hueco). Conversión huésped→base por `channel_markup`.
  - **Panel ampliado:** medidor € extra vs PriceLabs (`pricing/resultados`), histórico (`pricing/historial`), restaurar,
    pausa, botón de avisos push, toggles de eventos. Endpoints `pricing/settings` (GET estado+reco / PATCH).
  - **Avisos:** `lib/pricing-notify.ts` (email `@iarest/core-email` + push). `lib/push.ts` (`@iarest/core-push`),
    tabla **dedicada** `pricing_push_subs` (aislada de `push_subscriptions` compartida), suscripción
    `/api/propietario/push-subscribe` + SW `public/sw.js`.
  - **Seguridad:** `lib/cron-auth.ts` — crons de pricing/mercado exigen `CRON_SECRET` (o sesión admin); transición abierta
    si no está definido. Fuente de mercado automática (Estrategia 2) `mercado/ingest-auto` gated por `MARKET_API_*`.
  - **Migraciones BD (`wswbehlcuxqxyinousql`):** `pricing_settings`+`events_enabled`/`gap_discount_pct`, `pricing_config`,
    `pricing_push_subs`. **Mergeado a `main` y desplegado a producción (`sybra.vercel.app`).**
  - **✅ Vars Vercel configuradas (11/06):** `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` —
    motor diario y push activos en producción. Pendiente: activar `apply_enabled` en los otros 3 pisos al
    desconectar PriceLabs. Doc: `apps/sivra/docs/pricing-automatico.md`.

- **🔵 Migración BD ia-rest → proyecto compartido (Fase A2) — rama `claude/joaquin-jaen-expansion-4nyju5` — 10/06/2026**
  Unificación de datos: ia-rest deja su proyecto Supabase separado (`efncqyvhniaxsirhdxaa`) y pasa al
  **compartido `wswbehlcuxqxyinousql`** en un **schema propio `iarest`** (ialimp/sivra siguen en `public`).
  Ejecutado por **dblink server-to-server** + ejecutor plpgsql (sin tooling local). Detalle y corte final en
  `docs/RUNBOOK-migracion-bd-iarest.md`.
  - **Esquema migrado y verificado (paridad):** 215 tablas + 47 vistas + 121 funcs + 428 policies + 32 triggers
    + 428 FKs + 731 índices + 5 secuencias. **0 funciones con `search_path=public`** (aislamiento total vs
    ialimp/sivra). Única tabla sin RLS aparte de la temporal: `instagram_estilos_usados` (paridad: en origen
    tampoco tenía). Vistas/tablas clave (`restaurantes`, `leads`, `v_resumen_financiero_anual`) queryables
    (0 filas = migración solo-esquema; datos demo desechables, la app arranca limpia).
  - **Código ia-rest listo:** `SB_SCHEMA`/`SB_OPTS` en `src/lib/supabase.ts` (lee `NEXT_PUBLIC_SUPABASE_SCHEMA`,
    default `public` = comportamiento actual) + 8 ficheros con `createClient` propio parcheados. `next build` verde.
  - **Edge Functions: 43/43 migradas** al compartido, cada `createClient` a schema `iarest`, verify_jwt cuadrando
    con origen (true solo en monitor-health, stripe-checkout, analizar-cv, lead-research). Se desbloqueó tras
    Alberto borrar funciones basura (de ~100 → 44, tope del plan).
  - **PENDIENTE (solo Alberto, en orden):** (1) re-meter secrets de Edge Functions en el compartido
    (Stripe/MONEI/NVIDIA/Telegram/Resend/VeriFactu…); (2) Settings→API→Exposed schemas → añadir `iarest`;
    (3) Vercel ia-rest → swap `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` al compartido + añadir
    `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest` → Redeploy. **Luego (yo):** smoke test, plataforma lee iarest nativo
    (retirar puente service-role), DROP `iarest._mig_ddl`. **Después:** resetear password BD ia-rest (quedó en
    chat) y jubilar proyecto viejo. Rollback = revertir las 3 envs de Vercel.

- **✅ HITO 3 (financiero ia-rest en plataforma) + 📐 diseño de modularización — rama `claude/joaquin-jaen-expansion-4nyju5` — 09/06/2026**
  Preparación de la reunión con **Joaquín Jaén** (holding: restaurante, catering, haciendas de eventos, alquiler de
  materiales, transporte de camiones, tiendas de comida para llevar). Dos entregables:
  - **HITO 3 (código):** plataforma ya consolida el financiero de ia-rest, que vive en BD **separada**
    (`efncqyvhniaxsirhdxaa`). Nueva vista `v_resumen_financiero_anual` (migración `apps/ia-rest/supabase/migrations/
    20260609_*`, **ya aplicada** vía MCP) que agrega `facturas_verifactu.base_imponible` (ingresos) y
    `facturas_compra.importe_base` (gastos) por `local_id`+`anio`. Nuevo cliente service-role
    `apps/plataforma/lib/iarest.ts` (`@supabase/supabase-js`) y `getResumenIaRest(localId, anio)` en `lib/financiero.ts`
    (ya no es stub "BD separada"). UI `GestionSociedad.tsx` pide `refExt`=`local_id` para `app='ia-rest'`. `refExt` = UUID del local.
    Typecheck verde. **PENDIENTE de Alberto:** añadir envs `IAREST_SUPABASE_URL` + `IAREST_SUPABASE_SERVICE_KEY` en Vercel (plataforma).
  - **Diseño de modularización (doc):** `docs/DISENO-modularizacion-verticales.md` — sacar de ia-rest las capacidades
    horizontales (CRM, agenda, inventario, presupuestos, proveedores, portales, feedback, ocr, asn) a `packages/module-*`
    con patrón conector/adaptador + agregado genérico `Encargo`, registro de KPIs en plataforma, intercompany del holding,
    y matriz de consumo por negocio (incl. plantilla "clínica estética"). **Sin extraer código aún** (siguiente ronda).
  - **Diseño a fondo materiales/flota (hecho):** `docs/DISENO-modulos-materiales-flota.md` — extiende
    `inventario_menaje*` (alquiler: tarifas, fianza, daños) y `vehiculos_grupo`+`evento_transporte` (flota:
    ITV/seguro/mantenimiento, rutas multi-parada, asignación inteligente) hacia `module-*`, con doble
    facturación interno(intercompany)/externo. **Pendiente:** extracción real de los `module-*` y construir las verticales.
  - **`packages/module-crm` (hecho):** primer `module-*` real — tipos genéricos (`Oportunidad`, `ParentRef`
    con `parentType` = costura del Encargo), puertos (`OportunidadRepository`, `OportunidadAdapter<T>`) y lógica
    pura de pipeline (`resumenPipeline`, `valorPonderado`, probabilidad por estado). Agnóstico de BD.
  - **Extracción CRM en ia-rest (HECHA, definitiva):** ia-rest consume `@iarest/module-crm`. Nuevo
    `apps/ia-rest/src/lib/crm-eventos.ts` con `leadsEventoAdapter` (mapea `leads_evento` ↔ `Oportunidad`,
    estado `presupuesto_enviado`↔`propuesta`, `evento_id`→`parent`). La ruta `api/owner/eventos/leads` delega
    el cálculo de pipeline en `resumenPipeline` del módulo (contrato de respuesta preservado + nuevo `valor_ponderado`).
    Verificado con `next build` real (Next 16) en verde. El CRM super-admin (`leads`) queda intacto (otro concern).
  - **`packages/module-inventario` + extracción en ia-rest (HECHO, definitivo):** módulo genérico (`Articulo`,
    `AsignacionActivo` con `parent/parentType`, helpers `disponibilidadTrasReserva/Devolucion`, `costeDanos`,
    `resumenStock`). ia-rest: `apps/ia-rest/src/lib/inventario-menaje.ts` (`menajeArticuloAdapter` +
    `menajeAsignacionAdapter` sobre `inventario_menaje`/`inventario_menaje_evento`); la ruta `api/owner/menaje`
    delega la regla de disponibilidad en el módulo. Base del futuro **alquiler de materiales**. `next build` verde.
  - **`packages/module-presupuestos` + extracción en ia-rest (HECHO, definitivo):** módulo genérico (líneas,
    costes, descuento, `calcularMargen`, `esRentable`, `resumenPresupuesto`). ia-rest:
    `apps/ia-rest/src/lib/presupuestos-evento.ts` (`presupuestoEventoAdapter` + `costesDeEvento`, mapea la
    tarifa adulto/niño + costes a líneas genéricas); la ruta `api/owner/eventos/presupuestos` delega el cálculo
    de margen/rentabilidad en el módulo. `next build` verde.
  - **`packages/module-proveedores` + extracción en ia-rest (HECHO):** módulo genérico (`ProveedorServicio` con
    `parent`, `calcularComision`, `totalComisiones`, `comisionesCobradas`). ia-rest:
    `apps/ia-rest/src/lib/proveedores-evento.ts` (`proveedorServicioAdapter`, estado `comision_cobrada`↔`cobrada`);
    ruta `api/owner/eventos/proveedores-asignaciones` delega comisión y sumas. `next build` verde.
  - **`packages/module-feedback` + extracción en ia-rest (HECHO):** módulo genérico (`Feedback`, `Propina` con
    `parent`/token, `resumenValoraciones`, `totalPropinas`, `propinasPagadas`). ia-rest:
    `apps/ia-rest/src/lib/feedback-visita.ts` (`feedbackVisitaAdapter` + `propinaAdapter`); las rutas
    `api/owner/feedback` y `api/owner/propinas` añaden un `resumen` agregado vía el módulo. `next build` verde.
  - **`packages/module-asn` + extracción en ia-rest (HECHO):** módulo genérico (`ASN`, `LineaASN`,
    `totalLineas`, `unidadesTotales`). ia-rest: `apps/ia-rest/src/lib/asn-pedido.ts` (`asnItemAdapter` sobre
    `pedidos_proveedor.asn_items`); la ruta pública `api/asn` añade `total_albaran` vía el módulo. `next build` verde.
  - **`packages/module-agenda` (HECHO, contrato):** módulo genérico de disponibilidad/reserva de recurso
    (`Recurso`, `Reserva`, `Intervalo`, `haySolape`, `recursoDisponible`, `recursosDisponibles`). Es el motor
    transversal de venues/flota/alquiler/citas. Sin extracción de ia-rest (los eventos son por fecha, no reserva
    de recurso) → queda como contrato para las verticales nuevas. Typecheck verde.
  - **✅ MODULARIZACIÓN COMPLETA: 7 `module-*`** (crm, inventario, presupuestos, proveedores, feedback, asn, agenda).
    6 con extracción real en ia-rest verificada con `next build`; agenda como contrato. Costura común `parent/parentType`
    (agregado Encargo). **Siguiente:** construir las verticales nuevas (alquiler de materiales, flota) componiendo estos módulos.
  - **📋 Informe de unificación + decisión de BD (HECHO):** `docs/INFORME-unificacion-central.md` — foto del estado
    (matriz de adopción de `core-*`/`module-*` por app, qué está unido vs duplicado), esquema de capas, y plan de 6 fases.
    **DECISIÓN (Alberto): BD UNIFICADA** — un solo proyecto Supabase con **schemas por vertical** (`iarest/ialimp/sivra`)
    + **schema de control** (cuentas/sociedades/negocios/usuarios/RBAC/módulos/billing). Como **ia-rest NO tiene clientes
    activos**, su BD (`efncqyvhniaxsirhdxaa`) **se migra a la compartida AHORA** (no la última); el conector service-role
    de HITO 3 queda como puente temporal + válvula para BD dedicada de un futuro cliente grande. **Arranque sugerido:**
    Fase A2 (migrar ia-rest) + Fase A (identidad/RBAC sobre core-identity, migrar sivra de NextAuth) → dedupe → contabilidad.
  - **Ejecución de la unificación — INCREMENTOS HECHOS (verificados con build/tsc):**
    1. **Fase C·1** validadores fiscales NIF/CIF/IBAN → `core-fiscal` (subpath `/validacion` puro); ialimp re-export. `next build` ✅.
    2. **Fase A** fábrica de tokens jose (`createSessionToken`/`verifySessionToken` + jti) en `core-identity`. tsc ✅.
    3. **Fase A** plataforma adopta esa fábrica (`lib/auth.ts` delega, firmas idénticas). build ✅.
    4. **Fase D** registro `ResumenProvider` en plataforma (`financiero.ts`, DataConnector SPI, sustituye `if app===`). tsc ✅.
  - **PENDIENTE de la unificación (orden):** adoptar el contrato auth en ialimp (live) y **migrar sivra de NextAuth**;
    Fase B (ia-rest adopta `module-contabilidad`); resto Fase C (supabase client ialimp [keys mezcladas anon/service],
    `aiExtractInvoice`→core-ai, ia-rest→core-email); **Fase A2 EJECUTADA (2026-06-10): esquema de ia-rest MIGRADO al schema `iarest` de la BD compartida**
    vía dblink server-to-server (215 tablas, 47 vistas, 121 funciones, 32 triggers, 428 policies, 428 FKs,
    448 índices, buckets) con paridad verificada — ver `docs/RUNBOOK-migracion-bd-iarest.md` (ESTADO REAL).
    Código ia-rest listo para el corte por envs (`SB_OPTS`/`NEXT_PUBLIC_SUPABASE_SCHEMA`). **CORTE PENDIENTE de:**
    (1) migrar las **43 Edge Functions** del proyecto viejo al compartido (solo 16 con fuente en repo, resto vía
    MCP get_edge_function) parcheadas a schema iarest; (2) Alberto re-introduce los secrets de functions;
    (3) Alberto añade `iarest` a Exposed schemas; (4) Alberto cambia 3 envs Vercel + añade
    `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest` + Redeploy; (5) smoke test + plataforma nativa + DROP `iarest._mig_ddl`
    + resetear password BD ia-rest (quedó en chat). La app sigue 100% en la BD vieja hasta el corte (nada roto).

- **🔄 PR #107 — ialimp consume `nimVision` de core-ai en 6 rutas IA (feat/ialimp-ia-core-ai) — 09/06/2026**
  Las 6 rutas de visión de ialimp dejaban de pasar por el módulo y llamaban a la API NVIDIA inline. Ahora delegan en `nimVision`:
  - **`core-ai/nim.ts`**: `nimVision` 6º param `signal?` → `opts: {temperature?, signal?}` (aditivo). Permite afinar temperatura
    (OCR 0.05 / fotos 0.1; antes fija 0.1). Si `system` va vacío, NO envía mensaje de sistema (replica el patrón
    single-user-message de los agentes ialimp). Conserva `nimChat` (multi-turno) de main.
  - **Rutas migradas** (preservan modelo 90b-vision, temp y max_tokens exactos): `admin/ia/{analizar-foto(0.1/256),
    comparar-foto(0.1/400),analizar-botes(0.05/600)}`, `admin/escanear/process(0.05/800)`,
    `cron/procesar-documentos(0.05/800)`, `propietario/[token]/escanear(0.1/1200)`.
  - **sivra** `aiExtractInvoice`: adapta su llamada a `{ signal: AbortSignal.timeout(30_000) }` (forma opts). **ia-rest** `callAIVision`
    pasa 5 args → sin cambios. `upload-photo` solo llama a analizar/comparar server-to-server → no toca NVIDIA.
  - PR en draft; CI en cola. **Pendiente:** validar preview ialimp (escáner docs + análisis fotos) antes de mergear.

- **✅ PR #105 + #106 MERGEADOS A PRODUCCIÓN — 09/06/2026** (deploy ialimp `app.ialimp.es` READY, verificado en Vercel)
  - **#105** (unificar crypto + aiComplete): `core-identity/crypto.ts` (`genHex/genJti/sha256Hex`) + `core-ai/client.ts`
    (`aiComplete`). Adopción en ialimp (auth, propietario-auth, ai-client, enviar-acceso, 4 rutas hashPin), plataforma (auth),
    sivra (ai-client). Fix CI: `NimChatMessage` se importa de `./nim`, no `./types`. Fix audit: `enviar-acceso` usa `sha256Hex`.
  - **#106** (demo ia.rest): `GET /api/demo` + `POST /api/demo/seed` (protegido por env `DEMO_SEED_SECRET`) → crea "Bar Demo"
    (slug `demo`, código `DEMO`, PINs 1234/2222/3333/4444, 8 mesas, 17 productos, turno activo). Idempotente.
    **PENDIENTE de Alberto:** añadir env `DEMO_SEED_SECRET` en Vercel `ia-rest` y llamar al seed para testear.
  - **Auditoría exhaustiva del monorepo** (7 módulos + 4 apps): estado SANO. Pendientes menores: 2 rutas sivra con
    `crypto.subtle` inline (opcional), ia-rest financiero en plataforma (BD separada). **ia.rest mensajería** = tabla
    `mensajes_turno` (chat camarero↔cocina, privado/grupo, audio), totalmente implementada.
  - **Vanessa puede trabajar**: producción intacta y estable (los cambios solo mueven código, sin tocar BD/RLS/buckets).

- **✅ BD plataforma desmembrada (estructura real) — 09/06/2026**
  Sociedades reales en `wswbehlcuxqxyinousql` (tabla `sociedades`):
  - **Alberto Suárez Gutiérrez** (CIF vacío — editable desde `/dashboard` con ✎):
    - ia.rest (hostelería, app=ia-rest) — sin clientes aún, muestra "📊 BD separada"
    - Casa Sevillana (inmobiliario, app=sivra)
    - Busto Reform, Duplex Center, Luxury Busto (inmobiliario, app=sivra, con sus `ref_ext` de propiedades Smoobu)
  - **Sique Brilla SL** (B22992523, NIF real de `empresas`):
    - Sique Brilla (limpieza, app=ialimp, `ref_ext=05edacff-ea49-42fe-8997-f9369613a845`)
  Eliminada la sociedad fake "Tu Empresa SL" (CIF B12345678). Restructurado por SQL directo vía Supabase MCP.
  **Próximo paso:** cuando Vanessa empiece a operar (reactivar `documentos_contables.activo=true`), el financiero de Sique Brilla aparecerá automáticamente en el dashboard. Alberto puede ajustar el CIF de su sociedad personal desde la UI.

- **✅ HITO 5 — Plataforma CRUD completo (edición + registro de cuenta) — 09/06/2026**
  (PR #104 mergeado; producción `https://plataforma-ten-flame.vercel.app`)
  - `PATCH /api/sociedades/[id]` y `PATCH /api/negocios/[id]` — edición scoped por `cuenta_id`.
  - `POST /api/auth/register` + `/register` — alta de cuenta por UI con auto-login (`/register` público en middleware).
  - `EditarSociedadBtn`/`EditarNegocioBtn` — modales ✎ con valores precargados.
  - **Plataforma COMPLETA**: registro · login · CRUD sociedad/negocio · financiero real (ialimp+sivra).
  - **PENDIENTE:** volcar Sique Brilla (cuenta real) + ia-rest financiero (sin clientes aún).

- **✅ HITO 4 — Gestión de sociedades y negocios por UI en plataforma — 09/06/2026**
  (PR #103 mergeado)
  - `POST/DELETE /api/sociedades` y `POST/DELETE /api/negocios` — crear/eliminar scoped por `cuenta_id`.
  - `GestionSociedad.tsx` — modales ＋ Sociedad / ＋ Negocio / ✕, con `router.refresh()`.

- **✅ HITO 3 — Dashboard financiero en plataforma (ialimp + sivra) — 09/06/2026**
  (PR #102 mergeado; preview producción `https://plataforma-ten-flame.vercel.app`)
  - **`apps/plataforma/lib/financiero.ts`** nuevo: `getResumenNegocio(app, refExt, anio)` dispatcher.
    - `ialimp` → `getResumenIalimp(empresaId, anio)`: lee `v_contab_pyg` WHERE `empresa_id` + `anio`.
    - `sivra` → `getResumenSivra(anio, propertyId?)`: suma `incomes` + `expenses` por año, filtrado por piso si se pasa `refExt`.
    - `ia-rest` → `getResumenIaRest()`: devuelve `{disponible:false, nota:'BD separada'}` (BD separada).
  - **`apps/plataforma/app/dashboard/page.tsx`** actualizado: KPI bar consolidada (ingresos + resultado YTD)
    + tarjetas por negocio con Ingresos/Gastos/Resultado reales.
  - **Todos los builds verdes**: ia-rest ✅ · ialimp ✅ · sivra ✅ · plataforma ✅.
  - **PENDIENTE:** conectar ia-rest BD (`efncqyvhniaxsirhdxaa`) para mostrar datos reales (hoy: "📊 BD separada").

- **✅ HITO 2 CIMIENTO — `Cuenta → Sociedad → Negocio` + `apps/plataforma` shell — 09/06/2026**
  (PR #101 mergeado; Vercel `https://plataforma-ten-flame.vercel.app`)
  - **`packages/core-identity`** extendido: `Cuenta`, `Sociedad`, `Negocio`, `Sector`, `CuentaSession`.
  - **BD compartida (`wswbehlcuxqxyinousql`):** tablas `cuentas/sociedades/negocios` aplicadas.
    Cuenta de Alberto cargada con 3 negocios: ia.rest (hosteleria), Sique Brilla (limpieza), Casa Sevillana (inmobiliario).
  - **`apps/plataforma`** en producción: login + dashboard consolidado por sociedad/negocio + links a verticales.
    Auth: `plataforma_session` + `session_jti`. Stack: Next.js 15 · jose/bcryptjs · Prisma → BD compartida.
  - **HITO 3 siguiente:** resumen financiero real en tarjetas (federar `module-contabilidad` cruzando las 2 BD).

- **✅ HITO 1 CONTABILIDAD — `packages/module-contabilidad` creado y adoptado en las 3 verticales — 09/06/2026**
  (PR #100, rama `feat/module-contabilidad`, rebased sobre main con pnpm `workspace:*`)
  - `packages/module-contabilidad`: módulo TS puro, sin deps npm, DB-agnostic. Exports: tipos PORT
    (`Apunte`, `IVATrimestral`, `ResumenTesoreria`, `RentabilidadEntidad`, `PlantillaRecurrente`) +
    funciones puras (`calcularIVA`, `calcularPyG`, `calcularTesoreria`, `calcularRentabilidad`,
    `calcularCuotaIva`, `calcularTotal`, `round2`).
  - **ialimp** — `calcularCuotaIva`/`calcularTotal` en `apuntes/route.ts` e `ingresos/route.ts`.
  - **sivra** — `round2` en `facturacion/route.ts` (reemplaza `Math.round(x*100)/100` × 4 usos).
  - **ia-rest** — `round2` en `cron/cobro-inactividad/route.ts` (totalEur + comisión).
  - Todas las apps usan `workspace:*` + `transpilePackages` + `outputFileTracingRoot`.
  - Previews Vercel: **ialimp ✅ · sivra ✅ · ia-rest ✅** (tras rebase sobre main).

- **🧭 DECISIÓN ESTRATÉGICA: plataforma modular unificada — 09/06/2026 (ver `docs/PLAN-plataforma-modular.md`)**
  - **Norte del proyecto:** unificar los **módulos transversales** (contabilidad, ventas, almacén,
    RRHH, marketing, SEO, web, mensajería, IA) en UNA implementación que se **enciende** por vertical;
    las **verticales se quedan como especialidades** (cada una su peculiaridad). "Una mejora vale para todas".
  - **3 verticales:** **Hostelería** (ia.rest: restaurantes+catering/eventos+espacios) · **Limpieza/
    Mantenimiento** (ialimp, lado operativo + servicio) · **Inmobiliario/Propietarios** (= `sivra` +
    portal-propietario de `ialimp` **UNIFICADOS**; la limpieza es un servicio contratable). sivra+ialimp
    ya comparten BD; ia.rest tiene otra.
  - **Principio:** "motor común + enchufe por vertical" (ej. Contabilidad = motor IVA/PyG/tesorería común
    + de dónde salen ingresos/gastos según el sector). **Fase 1 = Contabilidad** (la de ialimp es la más
    madura → base del módulo compartido). Fase 2 = unificar Inmobiliario. Fase 3+ = resto de módulos.
  - **Añadidos al plan:** cuenta/identidad ÚNICA (`core-identity`, su 1er uso) · "marketplace" para
    encender servicios · datos-compartidos-vs-aislados (mismo motor, 2 BD). **Esquema:** `docs/esquema-
    casa-marcas.svg`. **Pendiente:** nombre de la matriz (Encaje) → rename del scope. **Metodología:
    esquema + preview verde antes de cada código; Vanessa intacta.**
  - **👉 DESARROLLO (lo programa Sonnet):** el plan maestro + **handoff/roadmap está en
    `docs/PLAN-plataforma-modular.md` §9** (patrón, guardarraíles, hitos, definición de hecho). **Empezar
    por HITO 1 = módulo Contabilidad compartido** (`packages/module-contabilidad`, agnóstico de BD,
    adoptar vertical a vertical preservando comportamiento, ialimp la última). Leerlo ENTERO antes de tocar código.
  - **🔑 EL CLIENTE REAL (§3.bis del plan):** un **DUEÑO con VARIOS negocios de sectores distintos**
    ("todo dueño accede a todo lo suyo"). Ej.: Joaquín Jaén = restaurante+catering+camiones+tiendas;
    otro = fontanería+taller. → jerarquía **Cuenta→Negocios→Sector**; **sectores ENCHUFABLES** (no solo
    3: transporte, fontanería, taller, retail…); `core-identity` es CENTRAL. Refuerza unificar módulos
    (contabilidad/RRHH/ventas/almacén = 80% igual en cualquier sector). **Nueva Fase 0.5** = cimiento
    Cuenta→Negocios + identidad única, antes de los módulos.

- **✅ pnpm WORKSPACES + FASE 3 REANUDADA (core-push, core-storage, core-email) — TODO EN PRODUCCIÓN — 09/06/2026**
  - **Migración a pnpm workspaces (PR #94, en prod las 3 verticales).** Sustituye los `file:` deps por
    `workspace:*`. Esto **desbloquea** núcleos compartidos con **dependencia npm propia** (lo que `file:`
    deps no resolvía en Vercel). Config: `pnpm-workspace.yaml`, `.npmrc` (`strict-peer-dependencies=false`
    + `auto-install-peers` + reintentos de fetch), root `package.json` con `packageManager: pnpm@10.33.0`
    + `pnpm.onlyBuiltDependencies` (pnpm 10 no corre postinstall por defecto). CI (ci/qa.yml) migrado a pnpm.
  - 🔴 **CAUSA RAÍZ del fallo de build (resuelta) — LECCIÓN CLAVE:** Vercel **NO usa** nuestro
    `packageManager`; autodetecta otro pnpm que considera el `pnpm-lock.yaml` *"not compatible"* y
    **re-resuelve todo el workspace** contra el registro en vivo → tormenta de metadatos → bug de undici
    `ERR_INVALID_THIS` (`Value of "this" must be of type URLSearchParams`) → install KO. **NO era la
    versión de Node** (pasaba en 20 y 24). **FIX (en los 3 `apps/*/vercel.json`):** `installCommand` =
    **`npx --yes pnpm@10.33.0 install --no-frozen-lockfile`** → usa SIEMPRE 10.33, honra el lockfile,
    sin re-resolución → sin fetches → sin `ERR_INVALID_THIS`, determinista con store fría o caliente.
  - **Fase 3 reanudada — 2 núcleos nuevos extraídos y EN PRODUCCIÓN:**
    - **`@iarest/core-push` (PR #95)** — envoltura pura sobre `web-push` (`sendWebPush` → `{ok,gone,...}`).
      **1er núcleo con dep npm propia** (la prueba de que pnpm lo desbloquea). Consumido por **ia-rest**
      (`/api/push/send`) e **ialimp** (`lib/push.ts`). Pendiente menor: migrar `ia-rest/lib/qr-notify.ts`.
    - **`@iarest/core-storage` (PR #96)** — firmado de signed URLs de Supabase Storage vía REST (puro,
      sin `supabase-js`): `storageObjectPath`/`signStorageObject`/`publicStorageUrl`. Consumido por
      **ialimp** (`lib/cleaning-photos.ts`, exports preservados) y **sivra** (`/api/limpiadoras/photo`).
    - **`@iarest/core-email` (PR #97)** — transporter de `nodemailer` desde env (dep npm propia):
      `createMailTransporter()` (multi-proveedor Resend→SMTP→Gmail) + `gmailTransporter()` (Gmail
      explícito) + `MAIL_TIMEOUTS`. **ialimp** (`lib/mailer.ts` `getTransporter`/`MAIL_FROM`, idéntico)
      y **sivra** (4 rutas: resumen-semanal, alerta-ventana, huespedes-repetidos, detect-opportunities,
      usaban Gmail inline → `gmailTransporter()`; el stub auto-reply no se tocó). sivra solo tiene
      `GMAIL_*` → mismo proveedor, sin riesgo de cambio.
    - **`core-push` cerrado en ia-rest (PR #98):** `lib/qr-notify.ts` (último `web-push` inline) migrado a
      `sendWebPush`; se eliminó la dep `web-push`/`@types/web-push` de ia-rest (el núcleo trae su copia).
  - **Núcleos compartidos hoy:** `core-ai`, `core-fiscal`, `core-push`, `core-storage`, `core-email`
    (+ `core-identity` con consumidores: crypto en ialimp/plataforma, identidad en plataforma). Patrón para añadir uno:
    `packages/core-x` (mirror de `core-ai`) + `workspace:*`/`file:` en las apps + `transpilePackages`. Si tiene dep npm, va en su `package.json`.
  - **Pendiente Fase 3 (opcional):** que ia-rest adopte `core-email` para su envío con Resend (hoy usa su
    propio cliente); `core-security` (rate-limit en BD, 1 consumidor).
  - **Limpieza HECHA por Alberto (09/06):** auto-delete head branches ✅ activado · Vercel `ia-rest-app`
    e `ialimp-fuentes` ✅ borrados · repos viejos `sivra`/`ialimp` ✅ ARCHIVADOS (read-only). Quedan por
    borrar 10 ramas mergeadas (comando `git push origin --delete …` desde su terminal).
  - **🔧 Fix derivado del archivado (PR #99):** archivar el repo `ialimp` detuvo su Action "Deploy landing"
    = el ÚNICO que desplegaba `ialimp.es` (el workflow del monorepo estaba en `apps/ialimp/.github/`, que
    GitHub NO ejecuta — solo corre `.github/workflows/` de la RAÍZ). Reubicado a la raíz con rutas a
    `apps/ialimp/landing/ialimp-es`. **PENDIENTE de Alberto:** añadir el secreto **`VERCEL_TOKEN`** al repo
    `ia.rest` (Settings → Secrets → Actions) para que la landing vuelva a auto-desplegar; probar con "Run
    workflow". `ialimp.es` sigue ONLINE (lo ya publicado no se cayó). Proyecto Vercel `ialimp-landing` intacto.
  - **Pendiente clave:** **Marca de la matriz** → elegir nombre (Claude Design recomienda **"Encaje"**;
    dominios `encaje.ai`/`encaje.app` libres, `.com`/`.es` ocupados) → renombrar scope `@iarest/* → @<marca>/*`
    (rename mecánico, listo para ejecutar en cuanto se decida).

- **ℹ️ NOTA OPERATIVA (sesión 09/06):** el **proxy git local da 503 en push** toda la sesión → los push se hacen
  vía **MCP github** (`push_files`/`create_pull_request`), que sí funciona (API de GitHub directa). El repo GitHub
  sigue llamándose `ia.rest` (redirige desde/hacia `central`); las llamadas MCP usan `repo: "ia.rest"`.

- **✅ MATRIZ DEFINITIVA: `ia.rest` bajado a `apps/ia-rest`, LIVE en producción — 08/06/2026 (PR #90)**
  - **Las 3 verticales viven bajo `apps/` y la raíz es la matriz.** `iarest.es` ya sirve desde
    `apps/ia-rest` (deploy de producción **READY**, Next 16.2.6, `✓ Compiled`, alias `iarest.es`/
    `www.iarest.es`). `sivra` y `ialimp` ya estaban en `apps/*`.
  - **Cómo se resolvió que `apps/ia-rest` consuma `packages/*` sin pnpm** (patrón para futuras
    verticales): `file:` deps (`@iarest/core-ai|core-fiscal` → `node_modules/@iarest/*` por symlink) +
    `next.config` con `outputFileTracingRoot`/`turbopack.root` = raíz del monorepo + se quitaron los
    `tsconfig paths` de `@iarest/*` (resuelven por node_modules). CI a `working-directory: apps/ia-rest`.
    Detalle en `MATRIZ.md`.
  - **Cutover sin downtime (orden CRÍTICO):** primero Root Directory del proyecto Vercel `ia-rest` →
    `apps/ia-rest`, **después** merge. (Al revés: la raíz-matriz genera un build vacío de ~1s que
    "tiene éxito" y **reemplazaría producción** → caída.) Red: Instant Rollback de Vercel.
  - Verificado antes de mergear: build/tsc/lint/qa **locales** en verde + **CI de GitHub** verde
    (ambos ya en `apps/ia-rest`).
  - 🟡 **Limpieza pendiente (sin prisa):** proyectos Vercel `ia-rest-docs` y `repo` (catch-all del
    root, `live:false`, solo dominios `*.vercel.app`) ahora fallan porque la raíz ya no es app →
    **borrarlos** o ignorarlos (no afectan a producción). + archivar/borrar repos viejos `sivra`/
    `ialimp`. + Fase 3 (adopción de `packages/core-*` por sivra/ialimp).

- **🏛️ MATRIZ definida + corrección: `ia.rest` es una VERTICAL, no la matriz — 08/06/2026**
  - Alberto corrige (acertadamente): en la casa de marcas, **`ia.rest` es una vertical más**, no la
    matriz. La raíz hace de matriz; las 3 verticales son hermanas bajo `apps/`. Manifiesto nuevo:
    **`MATRIZ.md`** (raíz) define estructura, verticales y regla.
  - **Hallazgo técnico (cambia el riesgo del movimiento de ia.rest):** `ia.rest` **ya consume
    `packages/*`** (`@iarest/core-ai`, `@iarest/core-fiscal` vía `tsconfig paths` +
    `transpilePackages`, rutas relativas a la raíz). Por eso **bajar `ia.rest` a `apps/ia-rest` NO es
    un `git mv` simple**: requiere montar **workspace** (pnpm/npm que abarque `apps/*`+`packages/*`)
