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
    (quedó en chat) y **jubilar `efncqyvhniaxsirhdxaa`** cuando lo vea estable; aplicar `add_concursos.sql` (del #116).
    Opcional/mío con tu OK: `DROP iarest._mig_ddl` (andamiaje de la migración, destructivo). Rollback del corte =
    revertir las 3 envs de Vercel de ia-rest (el código en `main` sin `NEXT_PUBLIC_SUPABASE_SCHEMA` vuelve a `public`).
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
  - **⚠️ Pendiente de Alberto:** aplicar `add_concursos.sql` en Supabase (BD compartida en vivo — no aplicado desde la
    sesión a propósito); el v1 lee `NVIDIA_API_KEY` (ya configurada en ialimp). Manual `public/manual.html` y la doc
    de regla de `apps/ialimp/CLAUDE.md` quedan como follow-up al promover la sección a producción.

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
  - **⚠️ Pendiente de Alberto en Vercel (proyecto sivra):** definir `CRON_SECRET` (sin él el auto-apply diario NO corre —
    de hecho más seguro: nada se escribe en Smoobu solo; el panel manual sí funciona) y `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/
    `VAPID_PRIVATE_KEY` (avisos push). Activar `apply_enabled` por piso según quite PriceLabs. Doc: `apps/sivra/docs/pricing-automatico.md`.

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
