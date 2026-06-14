# 🗺️ Arquitectura viva — casa de marcas `central`

> **Generado automáticamente** por `scripts/auditar-estructura.mjs` (2026-06-14T08:50:37Z). NO editar a mano.
> Se regenera en cada push (`.github/workflows/auditoria.yml`). Es el mapa que una sesión nueva lee del repo.
> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.

**Resumen:** 4 apps · 17 packages · 23 capacidades · 13 skills · 755 rutas API.

## Apps (verticales)
### ia-rest
- **Módulos que usa:** core-ai, core-fiscal, core-push, module-asn, module-contabilidad, module-crm, module-feedback, module-horario, module-materiales, module-presupuestos, module-proveedores
- **Capacidades:** TPV / comanda, KDS (cocina), Eventos / catering / BEO, Reservas, QR / portal cliente, Feedback / propinas, Agenda / auto-asignación, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Hardware bridge, Escáner / OCR, Notificaciones (push), Asistente / copiloto IA
- **Tablas (80):** arqueos_caja_empleado, beo_eventos, camareros, clientes_fiscales, cobro_config, comanda_items, comandas, config_horario, config_tienda, contract_acceptances, documentos_escaneados, facturas_cliente, feedback_visita, formularios_demo_recibidos, iarest.checklist_ejecuciones, iarest.checklist_plantillas, iarest.produccion_tareas, iarest.produccion_tiempos_estandar, incidencias_sistema, inventario_menaje, inventario_menaje_evento, leads, leads_eventos, leads_unsubscribes, leads_web_tracking, manual_voz_novedades, marchar_log, marketing_consentimientos, materiales, materiales_asignacion…
- **Rutas API:** 456
### ialimp
- **Módulos que usa:** core-ai, core-email, core-fiscal, core-identity, core-push, core-storage, module-concursos, module-contabilidad, module-crm, module-materiales, module-proveedores
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, CRM / leads / cotizador, RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Escáner / OCR, Informes, Notificaciones (push), Asistente / copiloto IA, Concursos públicos
- **Tablas (27):** apuntes_recurrentes, auth_rate_limit, biblioteca_documentos, catalogo_tarifas, cliente_auth_tokens, cliente_consentimientos, concursos, concursos_licitaciones, concursos_perfil_empresa, concursos_radar_anuncios, cuentas, documentos_contables, ingresos_manuales, mailing_campanas, mailing_envios, mailing_eventos, mailing_pasos, mailing_prospectos, negocios, partes_trabajo, protocolo_fotos, protocolo_items, protocolos, recordatorios_impagos, sociedades, stock_consumos, tenant_modulos
- **Rutas API:** 185
### plataforma _(matriz)_
- **Módulos que usa:** core-ai, core-identity, module-contabilidad
- **Capacidades:** —
- **Tablas (10):** comunicacion_categorias, comunicacion_conversacion_participantes, comunicacion_conversaciones, comunicacion_grupo_miembros, comunicacion_grupos, comunicacion_mensajes, comunicacion_nodos, comunicacion_reglas, cuentas_bancarias, movimientos_bancarios
- **Rutas API:** 26
### sivra
- **Módulos que usa:** core-ai, core-email, core-push, core-storage, module-contabilidad, module-materiales, module-proveedores
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, Marketing (blog/IG/SEO), Almacén / stock / ASN, Proveedores / compras, Asistente / copiloto IA
- **Tablas (1):** gastos_fijos
- **Rutas API:** 88

## Packages compartidos (`@central/*`)
- **core-ai** (core) → `@central/core-ai`
  - Lo usan: ia-rest, ialimp, plataforma, sivra
  - Depende de: —
- **core-email** (core) → `@central/core-email`
  - Lo usan: ialimp, sivra
  - Depende de: —
- **core-fiscal** (core) → `@central/core-fiscal`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-identity** (core) → `@central/core-identity`
  - Lo usan: ialimp, plataforma
  - Depende de: —
- **core-push** (core) → `@central/core-push`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **core-storage** (core) → `@central/core-storage`
  - Lo usan: ialimp, sivra
  - Depende de: —
- **module-agenda** (module) → `@central/module-agenda`
  - Lo usan: —
  - Depende de: —
- **module-asn** (module) → `@central/module-asn`
  - Lo usan: ia-rest
  - Depende de: —
- **module-concursos** (module) → `@central/module-concursos`
  - Lo usan: ialimp
  - Depende de: —
- **module-contabilidad** (module) → `@central/module-contabilidad`
  - Lo usan: ia-rest, ialimp, plataforma, sivra
  - Depende de: —
- **module-crm** (module) → `@central/module-crm`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **module-feedback** (module) → `@central/module-feedback`
  - Lo usan: ia-rest
  - Depende de: —
- **module-horario** (module) → `@central/module-horario`
  - Lo usan: ia-rest
  - Depende de: —
- **module-materiales** (module) → `@central/module-materiales`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **module-presupuestos** (module) → `@central/module-presupuestos`
  - Lo usan: ia-rest
  - Depende de: —
- **module-proveedores** (module) → `@central/module-proveedores`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **module-revenue** (module) → `@central/module-revenue`
  - Lo usan: —
  - Depende de: —

## Skills del proyecto
- **auditoria-central** — Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
- **brainstorming** — "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
- **central-maestro** — >
- **ia-rest-maestro** — >
- **ialimp-maestro** — >
- **plataforma-maestro** — >
- **receiving-code-review** — Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
- **requesting-code-review** — Use when completing tasks, implementing major features, or before merging to verify work meets requirements
- **sivra-maestro** — >
- **systematic-debugging** — Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
- **using-superpowers** — Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
- **verification-before-completion** — Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
- **writing-plans** — Use when you have a spec or requirements for a multi-step task, before touching code

## Avisos de arquitectura
- ⚠️ **TPV / comanda**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **KDS (cocina)**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Eventos / catering / BEO**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Reservas**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **QR / portal cliente**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Feedback / propinas**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Equipo limpiadoras**: en ialimp, sivra; falta en ia-rest.
- ⚠️ **Pricing dinámico**: en sivra; falta en ia-rest, ialimp.
- ⚠️ **Mercado / ingest**: en sivra; falta en ia-rest, ialimp.
- ⚠️ **CRM / leads / cotizador**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Marketing (blog/IG/SEO)**: en ia-rest, sivra; falta en ialimp.
- ⚠️ **RRHH / equipo**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Contabilidad**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Facturación / VeriFactu**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Hardware bridge**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Escáner / OCR**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Informes**: en ialimp; falta en ia-rest, sivra.
- ⚠️ **Notificaciones (push)**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Concursos públicos**: en ialimp; falta en ia-rest, sivra.

## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)
- (14/06/2026) 💶 SIVRA: gastos fijos mensuales AUTOMÁTICOS + fix dashboard — PR #208 (merged) y #209
- (14/06/2026) ⏱️ Control horario en ia-rest (roadmap #2) — branch `claude/control-horario` — 14/06/2026 (PR #205, draft)
- (14/06/2026) 📦 Reposición de stock (ia-rest) — branch `claude/reposicion-stock-iarest`
- (14/06/2026) ⭐ Scoring/ranking de limpiadoras (ialimp) — branch `claude/scoring-limpiadoras-ialimp` (PR #207)
- (14/06/2026) 💸 Agente de impagos (ialimp) — branch `claude/impagos-ialimp`
- (14/06/2026) 📊 Briefing consolidado (plataforma) — branch `claude/briefing-consolidado-plataforma`
- (13/06/2026) ⏰ Cron huérfano arreglado: `instagram-ideas` (ia-rest) — branch `claude/agents-missing-schedules-u838j3`
- (13/06/2026) 🔎 Agente SEO autónomo de ia.rest (Fase 1) — branch `claude/seo-agent-auto-activation-5ypj5x`
- (13/06/2026) 🔎 Auditoría de caja POR EMPLEADO en ia-rest — branch `claude/logistastrator-analysis-q78y60` — 13/06/2026 (PR #199)
- (13/06/2026) 💶 Cuadre de caja en ia-rest — branch `claude/logistastrator-analysis-q78y60`

