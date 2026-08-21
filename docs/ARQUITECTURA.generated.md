# 🗺️ Arquitectura viva — casa de marcas `central`

> **Generado automáticamente** por `scripts/auditar-estructura.mjs` (2026-08-21T06:53:08Z). NO editar a mano.
> Se regenera en cada push (`.github/workflows/auditoria.yml`). Es el mapa que una sesión nueva lee del repo.
> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.

**Resumen:** 10 apps · 38 packages · 23 capacidades · 32 skills · 1177 rutas API.

## Apps (verticales)
### almacen
- **Módulos que usa:** core-identity, module-materiales
- **Capacidades:** Eventos / catering / BEO, Almacén / stock / ASN
- **Tablas (12):** almacen_comentarios, almacen_empleados, almacen_espacios, almacen_evento_lineas, almacen_eventos, almacen_familias, almacen_inventario_lineas, almacen_inventarios, almacen_materiales, almacen_movimientos, almacen_stock, almacen_transferencias
- **Rutas API:** 21
### alquiler
- **Módulos que usa:** core-identity, module-alquiler
- **Capacidades:** Almacén / stock / ASN
- **Tablas (3):** alquiler_alquileres, alquiler_lineas, alquiler_materiales
- **Rutas API:** 4
### housesevillana
- **Módulos que usa:** —
- **Capacidades:** —
- **Tablas (0):** —
- **Rutas API:** 0
### ia-rest
- **Módulos que usa:** core-ai, core-fiscal, core-payments, core-push, core-receipts, module-asn, module-contabilidad, module-crm, module-feedback, module-flota, module-horario, module-materiales, module-organizador-trabajo, module-presupuestos, module-proveedores, module-trazabilidad
- **Capacidades:** TPV / comanda, KDS (cocina), Eventos / catering / BEO, Reservas, QR / portal cliente, Feedback / propinas, Agenda / auto-asignación, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Hardware bridge, Escáner / OCR, Notificaciones (push), Asistente / copiloto IA
- **Tablas (83):** arqueos_caja_empleado, avisos_operador, beo_eventos, camareros, clientes_fiscales, cobro_config, comanda_items, comandas, config_horario, config_tienda, contract_acceptances, documentos_escaneados, facturas_cliente, feedback_visita, formularios_demo_recibidos, iarest.checklist_ejecuciones, iarest.checklist_plantillas, iarest.produccion_tareas, iarest.produccion_tiempos_estandar, iarest.recibos_digitales, incidencias_sistema, inventario_menaje, inventario_menaje_evento, leads, leads_eventos, leads_unsubscribes, leads_web_tracking, manual_voz_novedades, marchar_log, marketing_consentimientos…
- **Rutas API:** 493
### ialimp
- **Módulos que usa:** core-ai, core-email, core-firma, core-fiscal, core-identity, core-payments, core-push, core-receipts, core-storage, module-contabilidad, module-crm, module-documental, module-materiales, module-proveedores, module-rrhh
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, CRM / leads / cotizador, RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Escáner / OCR, Informes, Notificaciones (push), Asistente / copiloto IA
- **Tablas (34):** apuntes_recurrentes, auth_rate_limit, biblioteca_documentos, catalogo_tarifas, cliente_auth_tokens, cliente_consentimientos, concursos, concursos_licitaciones, concursos_perfil_empresa, concursos_radar_anuncios, concursos_seguidos, cuentas, documentos_contables, documentos_limpiadora, firma_otps_limpiadora, firmas_limpiadora, ingresos_manuales, mailing_campanas, mailing_envios, mailing_eventos, mailing_pasos, mailing_prospectos, negocios, partes_trabajo, protocolo_fotos, protocolo_items, protocolos, recordatorios_impagos, registro_actividad, repartidor_checklist_plantillas…
- **Rutas API:** 200
### mariscos
- **Módulos que usa:** core-identity, module-pesca
- **Capacidades:** —
- **Tablas (2):** mariscos_envasados, mariscos_partidas
- **Rutas API:** 4
### plataforma _(matriz)_
- **Módulos que usa:** core-ai, core-email, core-identity, core-telegram, module-concursos, module-contabilidad, module-intercompany, module-pagos, module-ses, module-subastas, module-trading
- **Capacidades:** Feedback / propinas, Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Facturación / VeriFactu, Asistente / copiloto IA, Concursos públicos
- **Tablas (107):** agente_latidos, agente_reparaciones, agente_salud, ai_usos, ayudas_perfiles, banca_destino_reglas, borme_eventos, broker_saldos, categoria_alertas, categoria_alertas_log, cima_liquidaciones, comunicacion_categorias, comunicacion_conversacion_participantes, comunicacion_conversaciones, comunicacion_grupo_miembros, comunicacion_grupos, comunicacion_mensajes, comunicacion_nodos, comunicacion_reglas, conexiones_banco, contable_accion, contable_feedback, contable_log, contable_memoria, correduria_reglas, correo_cursor, correo_reglas, correo_triaje, cron_dispatch_cursor, cuentas_bancarias…
- **Rutas API:** 294
### rrhh
- **Módulos que usa:** core-ai, core-email, core-firma, core-identity, core-storage, core-telegram, module-chat, module-documental, module-geo, module-horario, module-nominas, module-rrhh
- **Capacidades:** Notificaciones (push), Asistente / copiloto IA
- **Tablas (12):** rrhh.contratos_laborales, rrhh.documentos, rrhh.empleados, rrhh.empresas, rrhh.firma_otps, rrhh.firmas, rrhh.incidencias_mes, rrhh.mensajes, rrhh.nominas, rrhh.push_subscriptions, rrhh.solicitudes, rrhh.usuarios_rrhh
- **Rutas API:** 58
### sivra
- **Módulos que usa:** core-ai, core-email, core-push, core-storage, module-contabilidad, module-materiales, module-proveedores
- **Capacidades:** Eventos / catering / BEO, Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, Marketing (blog/IG/SEO), Almacén / stock / ASN, Proveedores / compras, Asistente / copiloto IA
- **Tablas (1):** gastos_fijos
- **Rutas API:** 94
### transporte
- **Módulos que usa:** core-identity, module-flota, module-geo, module-transporte
- **Capacidades:** —
- **Tablas (9):** flota_conductores, flota_documentos, flota_mantenimientos, flota_posiciones, flota_repostajes, flota_vehiculos, transporte_paradas, transporte_portes, transporte_servicios
- **Rutas API:** 9

## Packages compartidos (`@central/*`)
- **core-ai** (core) → `@central/core-ai`
  - Lo usan: ia-rest, ialimp, plataforma, rrhh, sivra
  - Depende de: —
- **core-email** (core) → `@central/core-email`
  - Lo usan: ialimp, plataforma, rrhh, sivra
  - Depende de: —
- **core-firma** (core) → `@central/core-firma`
  - Lo usan: ialimp, rrhh
  - Depende de: —
- **core-fiscal** (core) → `@central/core-fiscal`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-identity** (core) → `@central/core-identity`
  - Lo usan: almacen, alquiler, ialimp, mariscos, plataforma, rrhh, transporte
  - Depende de: —
- **core-payments** (core) → `@central/core-payments`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-push** (core) → `@central/core-push`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **core-receipts** (core) → `@central/core-receipts`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-storage** (core) → `@central/core-storage`
  - Lo usan: ialimp, rrhh, sivra
  - Depende de: —
- **core-telegram** (core) → `@central/core-telegram`
  - Lo usan: plataforma, rrhh
  - Depende de: —
- **module-agenda** (module) → `@central/module-agenda`
  - Lo usan: —
  - Depende de: —
- **module-alquiler** (module) → `@central/module-alquiler`
  - Lo usan: alquiler
  - Depende de: module-encargo, module-intercompany, module-materiales
- **module-asn** (module) → `@central/module-asn`
  - Lo usan: ia-rest
  - Depende de: —
- **module-chat** (module) → `@central/module-chat`
  - Lo usan: rrhh
  - Depende de: —
- **module-concursos** (module) → `@central/module-concursos`
  - Lo usan: plataforma
  - Depende de: —
- **module-contabilidad** (module) → `@central/module-contabilidad`
  - Lo usan: ia-rest, ialimp, plataforma, sivra
  - Depende de: —
- **module-crm** (module) → `@central/module-crm`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **module-documental** (module) → `@central/module-documental`
  - Lo usan: ialimp, rrhh
  - Depende de: —
- **module-encargo** (module) → `@central/module-encargo`
  - Lo usan: —
  - Depende de: —
- **module-feedback** (module) → `@central/module-feedback`
  - Lo usan: ia-rest
  - Depende de: —
- **module-flota** (module) → `@central/module-flota`
  - Lo usan: ia-rest, transporte
  - Depende de: —
- **module-geo** (module) → `@central/module-geo`
  - Lo usan: rrhh, transporte
  - Depende de: —
- **module-horario** (module) → `@central/module-horario`
  - Lo usan: ia-rest, rrhh
  - Depende de: —
- **module-intercompany** (module) → `@central/module-intercompany`
  - Lo usan: plataforma
  - Depende de: module-flota, module-materiales
- **module-materiales** (module) → `@central/module-materiales`
  - Lo usan: almacen, ia-rest, ialimp, sivra
  - Depende de: —
- **module-nominas** (module) → `@central/module-nominas`
  - Lo usan: rrhh
  - Depende de: —
- **module-organizador-trabajo** (module) → `@central/module-organizador-trabajo`
  - Lo usan: ia-rest
  - Depende de: —
- **module-pagos** (module) → `@central/module-pagos`
  - Lo usan: plataforma
  - Depende de: —
- **module-pesca** (module) → `@central/module-pesca`
  - Lo usan: mariscos
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
- **module-rrhh** (module) → `@central/module-rrhh`
  - Lo usan: ialimp, rrhh
  - Depende de: core-firma, module-documental
- **module-ses** (module) → `@central/module-ses`
  - Lo usan: plataforma
  - Depende de: —
- **module-subastas** (module) → `@central/module-subastas`
  - Lo usan: plataforma
  - Depende de: module-concursos
- **module-trading** (module) → `@central/module-trading`
  - Lo usan: plataforma
  - Depende de: —
- **module-transporte** (module) → `@central/module-transporte`
  - Lo usan: transporte
  - Depende de: module-encargo, module-flota, module-intercompany
- **module-trazabilidad** (module) → `@central/module-trazabilidad`
  - Lo usan: ia-rest
  - Depende de: —

## Skills del proyecto
- **adobe-diseno** — >
- **agentes-entrenador** — Agente PROGRAMADO semanal (domingo) que mejora los prompts de los agentes por RENDIMIENTO y calidad transversal. NO vigila frescura factual (eso es /auditoria-diaria). Cambios de comportamiento SIEMPRE por PR draft + Telegram; nunca se auto-modifica. Úsala si Alberto pide "revisa/mejora los prompts de los agentes" o al disparo semanal. Sin secretos.
- **alquiler-maestro** — >
- **auditoria-central** — Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
- **brainstorming** — "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
- **buscador-ia** — Agente PROGRAMADO semanal que vigila los LLMs de la cadena de fallback de `@central/core-ai` por CALIDAD/PRECIO — watch de deprecación de los modelos cableados (NIM, Groq, Gemini, Kimi), descubrimiento de candidatos y mini-eval. Estado en docs/BUSCADOR-IA.md; Telegram + PR draft solo para swaps seguros. Úsala si Alberto pide "revisa las novedades de IA / si hay una IA mejor" o al disparo semanal. Sin secretos.
- **central-maestro** — >
- **code-map** — Úsala al EMPEZAR cualquier tarea de CÓDIGO cuando haya que localizar QUÉ archivo/función maneja algo, ANTES de Grep/Read a ciegas — consulta la tabla Supabase `mapa_arquitectura` (índice de firmas del repo) para acotar candidatos a coste ~0 y leer SOLO esos. No reemplaza a Grep/Read: los enfoca. Sin tabla o sin candidatos, método clásico.
- **correo-triaje** — Router de contexto del agente de TRIAJE DE CORREO — cron de Vercel en apps/plataforma cada ~10 min (NO sesión Claude) que lee Gmail por IMAP, clasifica y actúa (etiquetas, archivado, aviso Telegram). Úsala si Alberto pide "revisa/ajusta el triaje de correo", añadir categoría/remitente, o cuando /auditoria-diaria reconcilie la tabla de rutas. Sin secretos.
- **delegar-codigo** — Úsala cuando una tarea tenga código MECÁNICO o VOLUMINOSO (renames masivos, mismo patrón en N archivos, boilerplate, migraciones planas) — Claude planifica y REVISA, y delega la escritura a un coder barato vía `/api/ai/ejecutar` de plataforma (OpenRouter, categoría `codigo`). NO para lógica sutil ni cambios de 1-2 archivos. Complementa a `code-map`.
- **facturas-correo** — Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
- **fiscal-novedades** — Agente PROGRAMADO (mensual + pre-renta) con DOS radares fiscales; (1) deducciones IRPF (BOE estatal, BOJA/AEAT Andalucía) contrastadas con IMPORTES_POR_ANIO de apps/plataforma/lib/fiscal-deducciones.ts — si cambian, PR draft + fila en fiscal_novedades; (2) convocatorias de AYUDAS/SUBVENCIONES (BOJA/Junta/estatales) que encajen con el perfil de Alberto y Pilar — si hay una nueva, aviso Telegram con plazo y requisitos, estado en docs/FISCAL-AYUDAS.md. Úsala si Alberto pide "revisa si han cambiado las deducciones" o "¿hay ayudas nuevas?".
- **github-vigia** — Agente PROGRAMADO mensual (día 15) que vigila el ecosistema GitHub/OSS — releases de los repos curados en docs/VIGIA-OSS.md, descubrimiento por vertical, y deps npm desactualizadas o con CVE. Actualiza docs/VIGIA-OSS.md, Telegram + PR draft solo para bumps seguros. Úsala si Alberto pide "revisa las novedades de GitHub / del ecosistema". Sin secretos.
- **ia-rest-maestro** — >
- **ialimp-client-health** — Monitorización semanal de la salud de la cuenta de Sique Brilla (único cliente en producción de ialimp). Comprueba PMS sync, programaciones sin asignar, impagos activos y errores recientes. Genera un resumen de viernes para cerrar la semana operativa. Úsala en la rutina semanal o cuando Alberto quiera un pulso rápido del cliente. Sin secretos: solo nombres de variable.
- **ialimp-maestro** — >
- **marca-cliente** — Alta/intake de la identidad corporativa de un cliente/tenant y aplicación 100% a su app — convierte su marca real (logo, web, fotos) en un objeto `Marca` de `@central/brand` y lo enchufa dejando la UI IDÉNTICA a su marca. Úsala con cliente nuevo, rebrand, o si Alberto pide "adáptalo a la imagen corporativa de X". Complementa `adobe-diseno` y Adobe Fonts.
- **mercado-booking** — Rutina PROGRAMADA diaria que mide el precio REAL por fecha y aforo con el conector de Booking.com y lo escribe en market_rates (fuente booking_mcp) — la única fuente de SIVRA que distingue temporada. Úsala al disparo diario o si Alberto pide "mide el mercado de verdad" / "refresca los comparables por fecha". Sin secretos: solo nombres de variable.
- **perfil-fiscal** — Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, o su asesoría, y al trabajar con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. Sin cifras ni datos sensibles.
- **plataforma-maestro** — >
- **pricing-agente** — >
- **psd2-health-check** — Guardián de la sincronización bancaria (Enable Banking / PSD2). Verifica que los movimientos bancarios llegan frescos (< 48h) a `movimientos_bancarios`. Si la última importación es antigua o hay una caída >50% en volumen, alerta por Telegram y anota en CONTEXTO-SESIONES.md. Úsala en la rutina semanal de salud financiera o cuando Alberto sospeche que el sync está roto. Sin secretos: solo nombres de variable.
- **receiving-code-review** — Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
- **requesting-code-review** — Use when completing tasks, implementing major features, or before merging to verify work meets requirements
- **rrhh-compliance-calendar** — Recordatorio mensual de obligaciones legales pendientes de implementar en la vertical RRHH (Portal del Empleado). Lee el roadmap, filtra los ítems 🔴 obligatorios no completados y genera un informe de plazos. Úsala el primer día de cada mes o cuando Alberto quiera un pulso del estado de compliance de RRHH.
- **sivra-maestro** — >
- **systematic-debugging** — Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
- **trading-analista** — Pasada diaria del agente de inversión sobre Interactive Brokers (Fase 1, SOLO paper). Lee cartera real + watchlist, tira precios (IBKR) y fundamentales por MCP, llama a /api/trading/analizar y /api/trading/puntuar de plataforma, y resume por Telegram. Copiloto de órdenes: solo INSTRUCCIONES que Alberto confirma en IBKR, y solo si él las pide. NUNCA ejecuta órdenes reales.
- **transporte-maestro** — >
- **using-superpowers** — Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
- **verification-before-completion** — Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
- **writing-plans** — Use when you have a spec or requirements for a multi-step task, before touching code

## Avisos de arquitectura
- 🔴 **Almacén / stock / ASN**: duplicada en alquiler (debería usar `module-materiales`).
- ⚠️ **TPV / comanda**: en ia-rest; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, sivra, transporte.
- ⚠️ **KDS (cocina)**: en ia-rest; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, sivra, transporte.
- ⚠️ **Eventos / catering / BEO**: en almacen, ia-rest, sivra; falta en alquiler, housesevillana, ialimp, mariscos, rrhh, transporte.
- ⚠️ **Reservas**: en ia-rest; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, sivra, transporte.
- ⚠️ **QR / portal cliente**: en ia-rest; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, sivra, transporte.
- ⚠️ **Feedback / propinas**: en ia-rest; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, sivra, transporte.
- ⚠️ **Equipo limpiadoras**: en ialimp, sivra; falta en almacen, alquiler, housesevillana, ia-rest, mariscos, rrhh, transporte.
- ⚠️ **Agenda / auto-asignación**: en ia-rest, ialimp, sivra; falta en almacen, alquiler, housesevillana, mariscos, rrhh, transporte.
- ⚠️ **Pricing dinámico**: en sivra; falta en almacen, alquiler, housesevillana, ia-rest, ialimp, mariscos, rrhh, transporte.
- ⚠️ **Mercado / ingest**: en sivra; falta en almacen, alquiler, housesevillana, ia-rest, ialimp, mariscos, rrhh, transporte.
- ⚠️ **CRM / leads / cotizador**: en ia-rest, ialimp; falta en almacen, alquiler, housesevillana, mariscos, rrhh, sivra, transporte.
- ⚠️ **Marketing (blog/IG/SEO)**: en ia-rest, sivra; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, transporte.
- ⚠️ **RRHH / equipo**: en ia-rest, ialimp; falta en almacen, alquiler, housesevillana, mariscos, rrhh, sivra, transporte.
- ⚠️ **Almacén / stock / ASN**: en almacen, alquiler, ia-rest, ialimp, sivra; falta en housesevillana, mariscos, rrhh, transporte.
- ⚠️ **Proveedores / compras**: en ia-rest, ialimp, sivra; falta en almacen, alquiler, housesevillana, mariscos, rrhh, transporte.
- ⚠️ **Contabilidad**: en ia-rest, ialimp; falta en almacen, alquiler, housesevillana, mariscos, rrhh, sivra, transporte.
- ⚠️ **Facturación / VeriFactu**: en ia-rest, ialimp; falta en almacen, alquiler, housesevillana, mariscos, rrhh, sivra, transporte.
- ⚠️ **Hardware bridge**: en ia-rest; falta en almacen, alquiler, housesevillana, ialimp, mariscos, rrhh, sivra, transporte.
- ⚠️ **Escáner / OCR**: en ia-rest, ialimp; falta en almacen, alquiler, housesevillana, mariscos, rrhh, sivra, transporte.
- ⚠️ **Informes**: en ialimp; falta en almacen, alquiler, housesevillana, ia-rest, mariscos, rrhh, sivra, transporte.
- ⚠️ **Notificaciones (push)**: en ia-rest, ialimp, rrhh; falta en almacen, alquiler, housesevillana, mariscos, sivra, transporte.
- ⚠️ **Asistente / copiloto IA**: en ia-rest, ialimp, rrhh, sivra; falta en almacen, alquiler, housesevillana, mariscos, transporte.

## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)
- La guest app tiene API JSON abierta con el token del propio enlace:
- Precedencia:
- Entregas 2-5 también hechas
- Mergeado y VIVO
- `?dry=1`
- 🪤 Landmine caro:
- Aplicado en prod con OK de Alberto:
- Rutina nueva
- Plusvalía: método objetivo (~970€) vs real (~24.900€)
- Palanca grande:

