-- 20261102_auditoria.sql
--
-- Arreglos de la auditoria BD/infra del 02/11/2026 (proyecto Supabase central
-- `wswbehlcuxqxyinousql`). PREPARADO, NO APLICADO: lo aplica Alberto (o la sesion
-- con su OK) por `apply_migration`. Revertir: `20261102_auditoria_rollback.sql`.
--
-- Todo lo de aqui se ha decidido leyendo la BD (solo SELECT) el 02/11/2026:
--   1. search_path fijo en las 30 funciones del advisor `function_search_path_mutable`
--      (27 seguros + 3 public). Se ha leido el cuerpo de cada una: TODAS califican sus
--      tablas con esquema (`seguros.x`, `public.x`), salvo `_volcado_verificar`, que
--      llama a `dblink()` sin calificar (extension en `extensions`). Por eso el
--      search_path es el de su esquema + pg_temp, y `extensions` solo en esa.
--   2. pg_cron: fuera `fuera-carta-cleanup` (jobid 10, redundante con `limpiar-fuera-carta`)
--      y `nim-daily-briefing-9am` (jobid 21, inactivo desde el 28/09).
--      NO se toca `infra-monitor` / `monitor-health-cron`: NO son equivalentes
--      (monitor-health = auto-healer que reencola comandas, resetea mesas, cierra turnos;
--      infra-monitor-cron = push al owner por bridge caido / errores / turno inactivo).
--   3. `app_user`: NO se pasa a NOLOGIN. Esta en uso: pg_stat_statements (desde el
--      26/04/2026) le atribuye 32.524 llamadas de Prisma contra public.incomes,
--      properties, gastos y rate_snapshots (sivra/plataforma/pricing). Antes de tocarlo
--      hay que saber que DATABASE_URL lo usa (Vercel env) y migrarlo a su prisma_*.
--   4. iarest SECURITY DEFINER: REVOKE EXECUTE en 73 de las 79. OJO: el ACL de todas
--      incluye PUBLIC (grantee 0), asi que un `REVOKE ... FROM anon` a secas NO quita
--      nada (anon hereda de PUBLIC). Se revoca de PUBLIC, anon y authenticated; postgres
--      (dueno) y service_role conservan su GRANT explicito.
--
-- Que se rompe si esto esta mal y como se ve:
--   - (1) una funcion que resolviera un objeto sin calificar fuera de su esquema daria
--     `relation/function ... does not exist` al dispararse (trigger) -> la escritura
--     que lo dispara falla en la app. Verificacion: el SELECT de comprobacion al final
--     y, tras aplicar, `pnpm test` de asegura (triggers de presupuesto/siniestro/portal).
--   - (4) una llamada desde navegador (clave anon/publishable) a una funcion revocada
--     devolveria `permission denied for function` (42501) en ia-rest. Solo se mantienen
--     abiertas las que llama el navegador o usan las politicas RLS / vistas (lista en
--     el bloque 4). Las llamadas de servidor y edge functions usan la service_role
--     (`createServerClient()` / `claveSecreta()`), que no se toca.

BEGIN;

-- =====================================================================================
-- 1. search_path fijo (advisor function_search_path_mutable, 30 funciones)
-- =====================================================================================

-- 1a. seguros: 26 funciones que solo tocan objetos `seguros.*` (o NEW/OLD) y builtins
--     de pg_catalog (gen_random_uuid, regexp_*, jsonb_*, now...). pg_catalog va siempre
--     implicito delante.
ALTER FUNCTION seguros._fusion_lote7_tanda(v_limit integer)                       SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.avanzar_vencimientos_por_recibo()                           SET search_path = seguros, pg_temp;
-- cliente_segmento_actual es LANGUAGE sql: con SET deja de poder inlinearse. Sin
-- dependencias en BD (pg_depend vacio) ni usos en el repo, asi que no cuesta nada hoy.
ALTER FUNCTION seguros.cliente_segmento_actual(p_cliente_id uuid)                  SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.firma_reject_modification()                                 SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.interviniente_purga_log_reject_modification()               SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_documento_inmutable()                     SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_importacion_cerrar()                      SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_importacion_fila_abierta()                SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_importacion_no_reabrir()                  SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_inmueble_un_nivel()                       SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_inquilino_acceso_inmutable()              SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_recomendacion_inmutable()                 SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_titular_coherente()                       SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.portal_patrimonio_tocar()                                   SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_evento_reject_modification()                    SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_no_enviar_simulado()                            SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_propuesta_item_misma_correduria()               SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_propuesta_referencia()                          SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_referencia_al_insertar()                        SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_referencia_inmutable()                          SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.presupuesto_tarificacion_codeoscopic()                      SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.siguiente_referencia_presupuesto(p_correduria uuid, p_momento timestamp with time zone) SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.siguiente_referencia_propuesta(p_correduria uuid, p_momento timestamp with time zone)   SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.siniestro_mensajes_solo_anadir()                            SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.tarificacion_emision_autorizacion_inmutable()               SET search_path = seguros, pg_temp;
ALTER FUNCTION seguros.tarificacion_exploracion_ancla_valida()                     SET search_path = seguros, pg_temp;

-- 1b. seguros._volcado_verificar: usa `dblink(...)` SIN calificar (extension dblink en
--     el esquema `extensions`) y `vault.decrypted_secrets` calificado. Herramienta del
--     volcado de septiembre (apps/asegura/prisma/sql/2026-09-01_seguros_volcado_datos.sql).
ALTER FUNCTION seguros._volcado_verificar()                                        SET search_path = seguros, extensions, pg_temp;

-- 1c. public: los 3 triggers de facturas de huesped de sivra; califican `public.*`.
ALTER FUNCTION public.sivra_factura_inmutable()                                    SET search_path = public, pg_temp;
ALTER FUNCTION public.sivra_factura_numero_correlativo()                           SET search_path = public, pg_temp;
ALTER FUNCTION public.sivra_factura_serie_contador()                               SET search_path = public, pg_temp;

-- =====================================================================================
-- 2. pg_cron
-- =====================================================================================

-- 2a. `fuera-carta-cleanup` (jobid 10, 00:05 diario) es un subconjunto de
--     `limpiar-fuera-carta` (jobid 9, cada hora -> iarest.fn_limpiar_fuera_carta(),
--     search_path=iarest, 168/168 ejecuciones OK en 7 dias). Mismo WHERE; el de la hora
--     ademas pone es_fuera_carta=false. Lo que el de las 00:05 coja (caducado entre
--     00:00 y 00:05) lo coge el de la 01:00. Diferencia unica: el de las 00:05 dejaba
--     es_fuera_carta=true en esas filas; con esto quedan como las demas.
--     Guardado: solo se desprograma si el comando sigue siendo EXACTAMENTE el leido.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'fuera-carta-cleanup'
   AND command = 'UPDATE iarest.productos SET activo = false WHERE es_fuera_carta = true AND activo = true AND expira_at IS NOT NULL AND expira_at < now();';

-- 2b. `nim-daily-briefing-9am` (jobid 21): inactivo desde la migracion del 28/09; llama
--     a la edge function `daily-briefing`, que queda muerta (ver fix-bd.md).
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'nim-daily-briefing-9am' AND active = false;

-- 2c. `infra-monitor` / `monitor-health-cron`: NO equivalentes, se quedan (ver cabecera).

-- =====================================================================================
-- 3. app_user -> NO se toca (en uso, ver cabecera).
-- =====================================================================================

-- =====================================================================================
-- 4. iarest SECURITY DEFINER: fuera EXECUTE de PUBLIC/anon/authenticated
-- =====================================================================================
-- SE QUEDAN ABIERTAS (6), por que:
--   get_tenant_id()                -> 65 politicas RLS (roles anon/public): la RLS evalua
--                                     la funcion con el rol que consulta.
--   is_super_admin()               -> 11 politicas RLS (rol public).
--   calcular_compra_evento(uuid)   -> la usa la vista iarest.v_necesidades_pedido; las
--                                     funciones de una vista se comprueban con el rol que
--                                     la consulta. (Tambien la llama el servidor.)
--   crear_fuera_carta(...)         -> navegador: components/owner/FueraCartaSection.tsx
--                                     (cliente `supabase` anon de lib/supabase.ts).
--   rpc_modificar_comanda_item(...)-> navegador: components/ComandaModModal.tsx.
--   validate_pin_with_rate_limit(...) -> navegador: components/ComandaModModal.tsx.
--   (Cada una sigue siendo SECURITY DEFINER callable por anon: revisar su cuerpo aparte.)
--
-- SE CIERRAN (73): o las llama solo el servidor (createServerClient = service_role) /
-- edge functions (claveSecreta() = service_role) / pg_cron (postgres), o son triggers
-- (el EXECUTE de una funcion trigger se comprueba al CREATE TRIGGER, no al dispararse),
-- o no tienen ninguna referencia en el repo, en politicas, vistas, defaults ni cron.
-- 🚨 La mas grave: iarest.ejecutar_qa_patron(text) hace EXECUTE de SQL libre como
-- postgres con un filtro de palabras; hoy cualquiera con la clave anon puede leer
-- `select * from seguros.<tabla>` (o cualquier esquema) por PostgREST. Solo la usa
-- lib/qa-runner.ts con la service_role.
REVOKE EXECUTE ON FUNCTION iarest.activar_plan(p_restaurante_id uuid, p_user_id uuid, p_plan text, p_billing text, p_stripe_sub_id text, p_num_usuarios integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.actualizar_total_cobrado() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.aplicar_checklist_evento(p_evento_id uuid, p_template_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.aplicar_menu_a_evento(p_evento_id uuid, p_menu_id uuid, p_hora_inicio time without time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.buscar_mesa_por_voz(p_restaurante_id uuid, p_numero integer, p_zona text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.buscar_mesa_voz(p_restaurante_id uuid, p_zona text, p_numero integer, p_texto_libre text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.buscar_receptor_marchar(p_comanda_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.calcular_comision_evento(p_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.calcular_margen_evento(p_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.calcular_precio_transferencia(p_cuenta_id uuid, p_coste_real numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.calcular_rentabilidad_evento(p_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.cancelar_plan(p_stripe_sub_id text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.cleanup_sms_verification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.clonar_evento(p_evento_id uuid, p_nueva_fecha date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.crear_checklist_defecto_boda(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.crear_conceptos_gasto_defecto(p_restaurante_id uuid, p_cuenta_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.crear_portal_evento(p_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.decrementar_stock_fuera_carta(p_producto_id uuid, p_restaurante_id uuid, p_cantidad integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.ejecutar_qa_patron(p_query text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.espacio_disponibilidad_rango(p_espacio_id uuid, p_desde date, p_hasta date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.espacio_disponible(p_espacio_id uuid, p_fecha date, p_excluir_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.espacio_disponible(p_espacio_id uuid, p_fecha_inicio date, p_fecha_fin date, p_excluir_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.fichar_entrada(p_camarero_id uuid, p_restaurante_id uuid, p_ip text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.fichar_salida(p_camarero_id uuid, p_restaurante_id uuid, p_ip text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.fn_alerta_super(p_tipo text, p_mensaje text) FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.fn_autoasignar_camarero_mesa() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.fn_avisos_trial() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.fn_check_ia_hitos() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.fn_generar_alertas_consumo() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.fn_limpiar_camarero_mesa() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.fn_limpiar_fuera_carta() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.fn_mesa_ocupada_desde() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.fn_track_consumo_comanda() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.fn_transcripcion_to_training_log() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.generar_factura_verifactu(p_comanda_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.get_billing_estado(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.get_carta_i18n(p_restaurante_id uuid, p_idioma text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.get_consumo_owner(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.get_mesas_voz_context(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.get_mis_mesas(p_camarero_id uuid, p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.get_sesiones_inactivas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.handle_new_user() FROM PUBLIC, anon, authenticated;  -- trigger
REVOKE EXECUTE ON FUNCTION iarest.imputar_coste_recepcion_evento(p_evento_id uuid, p_restaurante_id uuid, p_descripcion text, p_importe numeric, p_origen_id uuid, p_proveedor_id uuid, p_proveedor_nombre text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.imputar_recepcion_a_evento(p_recepcion_id uuid, p_evento_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.is_owner_of_restaurante(rid uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.log_comanda_accion(p_comanda_id uuid, p_camarero_id uuid, p_accion text, p_item_nombre text, p_cant_antes integer, p_cant_despues integer, p_notas_antes text, p_notas_despues text, p_detalle jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.login_pin(p_restaurante_id uuid, p_pin text, p_ip_address text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.marcar_mensaje_leido(p_mensaje_id uuid, p_camarero_id uuid, p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.onboarding_restaurante(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.productos_bajo_minimo(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.purge_old_alerta_log() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.purge_old_auth_attempts() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.purge_old_cron_history() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.purge_old_security_log() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.purge_old_transcripciones() FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.recalcular_alertas_margen(p_articulo_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.recalcular_consumo_mensual(p_restaurante_id uuid, p_anno integer, p_mes integer) FROM PUBLIC, anon, authenticated;  -- pg_cron (postgres)
REVOKE EXECUTE ON FUNCTION iarest.reencolar_comanda(p_comanda_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.registrar_cobro_caja(p_restaurante_id uuid, p_turno_id uuid, p_camarero_id uuid, p_camarero_nombre text, p_factura_id uuid, p_comanda_id uuid, p_mesa_label text, p_importe numeric, p_entregado numeric, p_cambio numeric, p_metodo_tipo text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.registrar_sobrante_evento(p_evento_id uuid, p_concepto text, p_importe numeric, p_cantidad numeric, p_unidad text, p_producto_id uuid, p_devolver_stock boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.reponer_stock_fuera_carta(p_producto_id uuid, p_restaurante_id uuid, p_nuevo_stock integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.resolve_restaurante(p_slug_or_code text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.resolver_error(p_error_id uuid, p_notas text, p_resuelto_por text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.rotate_kds_token(p_restaurante_id uuid, p_owner_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.search_leads_sevilla_nuevos(limit_count integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.sembrar_restaurante_nuevo(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.set_session_context(rid uuid, cid uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.set_tenant_context(rid uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.siguiente_numero_factura(p_restaurante_id uuid, p_serie text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.super_get_all_restaurantes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.super_get_restaurantes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.trial_dias_restantes(p_restaurante_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION iarest.trigger_factura_al_cobrar() FROM PUBLIC, anon, authenticated;  -- trigger

-- service_role y postgres conservan su GRANT explicito en las 79 (ACL leido el 02/11/2026:
-- `{=X/postgres, anon=X, authenticated=X, postgres=X, service_role=X}`), no se tocan.

COMMIT;

-- =====================================================================================
-- Comprobacion tras aplicar (solo lectura):
--   -- (1) debe dar 0 filas:
--   SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname IN ('seguros','public') AND p.prokind = 'f' AND p.proconfig IS NULL
--      AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql','sql'))
--      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
--   -- (2) no deben salir 'fuera-carta-cleanup' ni 'nim-daily-briefing-9am':
--   SELECT jobname FROM cron.job ORDER BY 1;
--   -- (4) solo deben salir las 6 que se quedan:
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'iarest' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'execute');
--   -- y advisors de seguridad: function_search_path_mutable = 0 y
--   -- anon_security_definer_function_executable = 6.
-- Pendiente aparte (no va aqui): ALTER DEFAULT PRIVILEGES para que las funciones NUEVAS
-- de iarest no nazcan con EXECUTE a PUBLIC.
-- =====================================================================================
