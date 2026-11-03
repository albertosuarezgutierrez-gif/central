-- 20261102_auditoria_rollback.sql
--
-- Deshace 20261102_auditoria.sql bloque a bloque. Deja la BD como estaba el 02/11/2026
-- (search_path sin fijar, los dos cron jobs y el EXECUTE de PUBLIC/anon/authenticated).
-- Si solo falla un bloque, ejecuta solo ese bloque.

BEGIN;

-- 1. search_path: RESET (vuelven a heredar el del rol que las ejecuta)
ALTER FUNCTION seguros._fusion_lote7_tanda(v_limit integer) RESET search_path;
ALTER FUNCTION seguros.avanzar_vencimientos_por_recibo() RESET search_path;
ALTER FUNCTION seguros.cliente_segmento_actual(p_cliente_id uuid) RESET search_path;
ALTER FUNCTION seguros.firma_reject_modification() RESET search_path;
ALTER FUNCTION seguros.interviniente_purga_log_reject_modification() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_documento_inmutable() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_importacion_cerrar() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_importacion_fila_abierta() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_importacion_no_reabrir() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_inmueble_un_nivel() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_inquilino_acceso_inmutable() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_recomendacion_inmutable() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_titular_coherente() RESET search_path;
ALTER FUNCTION seguros.portal_patrimonio_tocar() RESET search_path;
ALTER FUNCTION seguros.presupuesto_evento_reject_modification() RESET search_path;
ALTER FUNCTION seguros.presupuesto_no_enviar_simulado() RESET search_path;
ALTER FUNCTION seguros.presupuesto_propuesta_item_misma_correduria() RESET search_path;
ALTER FUNCTION seguros.presupuesto_propuesta_referencia() RESET search_path;
ALTER FUNCTION seguros.presupuesto_referencia_al_insertar() RESET search_path;
ALTER FUNCTION seguros.presupuesto_referencia_inmutable() RESET search_path;
ALTER FUNCTION seguros.presupuesto_tarificacion_codeoscopic() RESET search_path;
ALTER FUNCTION seguros.siguiente_referencia_presupuesto(p_correduria uuid, p_momento timestamp with time zone) RESET search_path;
ALTER FUNCTION seguros.siguiente_referencia_propuesta(p_correduria uuid, p_momento timestamp with time zone) RESET search_path;
ALTER FUNCTION seguros.siniestro_mensajes_solo_anadir() RESET search_path;
ALTER FUNCTION seguros.tarificacion_emision_autorizacion_inmutable() RESET search_path;
ALTER FUNCTION seguros.tarificacion_exploracion_ancla_valida() RESET search_path;
ALTER FUNCTION seguros._volcado_verificar() RESET search_path;
ALTER FUNCTION public.sivra_factura_inmutable() RESET search_path;
ALTER FUNCTION public.sivra_factura_numero_correlativo() RESET search_path;
ALTER FUNCTION public.sivra_factura_serie_contador() RESET search_path;

-- 2. pg_cron: se vuelven a programar con el comando y horario leidos el 02/11/2026.
SELECT cron.schedule(
  'fuera-carta-cleanup', '5 0 * * *',
  $cmd$UPDATE iarest.productos SET activo = false WHERE es_fuera_carta = true AND activo = true AND expira_at IS NOT NULL AND expira_at < now();$cmd$
) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fuera-carta-cleanup');

SELECT cron.schedule(
  'nim-daily-briefing-9am', '0 7 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/daily-briefing',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 30000
  )
$cmd$
) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nim-daily-briefing-9am');
-- estaba INACTIVO: se deja igual
SELECT cron.alter_job(job_id := jobid, active := false) FROM cron.job WHERE jobname = 'nim-daily-briefing-9am';

-- 3. app_user: nada que deshacer (no se toco).

-- 4. iarest: se devuelve EXECUTE a PUBLIC, anon y authenticated en las 73
GRANT EXECUTE ON FUNCTION iarest.activar_plan(p_restaurante_id uuid, p_user_id uuid, p_plan text, p_billing text, p_stripe_sub_id text, p_num_usuarios integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.actualizar_total_cobrado() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.aplicar_checklist_evento(p_evento_id uuid, p_template_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.aplicar_menu_a_evento(p_evento_id uuid, p_menu_id uuid, p_hora_inicio time without time zone) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.buscar_mesa_por_voz(p_restaurante_id uuid, p_numero integer, p_zona text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.buscar_mesa_voz(p_restaurante_id uuid, p_zona text, p_numero integer, p_texto_libre text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.buscar_receptor_marchar(p_comanda_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.calcular_comision_evento(p_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.calcular_margen_evento(p_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.calcular_precio_transferencia(p_cuenta_id uuid, p_coste_real numeric) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.calcular_rentabilidad_evento(p_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.cancelar_plan(p_stripe_sub_id text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.cleanup_sms_verification() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.clonar_evento(p_evento_id uuid, p_nueva_fecha date) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.crear_checklist_defecto_boda(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.crear_conceptos_gasto_defecto(p_restaurante_id uuid, p_cuenta_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.crear_portal_evento(p_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.decrementar_stock_fuera_carta(p_producto_id uuid, p_restaurante_id uuid, p_cantidad integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.ejecutar_qa_patron(p_query text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.espacio_disponibilidad_rango(p_espacio_id uuid, p_desde date, p_hasta date) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.espacio_disponible(p_espacio_id uuid, p_fecha date, p_excluir_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.espacio_disponible(p_espacio_id uuid, p_fecha_inicio date, p_fecha_fin date, p_excluir_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fichar_entrada(p_camarero_id uuid, p_restaurante_id uuid, p_ip text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fichar_salida(p_camarero_id uuid, p_restaurante_id uuid, p_ip text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_alerta_super(p_tipo text, p_mensaje text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_autoasignar_camarero_mesa() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_avisos_trial() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_check_ia_hitos() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_generar_alertas_consumo() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_limpiar_camarero_mesa() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_limpiar_fuera_carta() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_mesa_ocupada_desde() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_track_consumo_comanda() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.fn_transcripcion_to_training_log() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.generar_factura_verifactu(p_comanda_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.get_billing_estado(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.get_carta_i18n(p_restaurante_id uuid, p_idioma text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.get_consumo_owner(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.get_mesas_voz_context(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.get_mis_mesas(p_camarero_id uuid, p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.get_sesiones_inactivas() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.handle_new_user() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.imputar_coste_recepcion_evento(p_evento_id uuid, p_restaurante_id uuid, p_descripcion text, p_importe numeric, p_origen_id uuid, p_proveedor_id uuid, p_proveedor_nombre text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.imputar_recepcion_a_evento(p_recepcion_id uuid, p_evento_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.is_owner_of_restaurante(rid uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.log_comanda_accion(p_comanda_id uuid, p_camarero_id uuid, p_accion text, p_item_nombre text, p_cant_antes integer, p_cant_despues integer, p_notas_antes text, p_notas_despues text, p_detalle jsonb) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.login_pin(p_restaurante_id uuid, p_pin text, p_ip_address text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.marcar_mensaje_leido(p_mensaje_id uuid, p_camarero_id uuid, p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.onboarding_restaurante(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.productos_bajo_minimo(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.purge_old_alerta_log() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.purge_old_auth_attempts() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.purge_old_cron_history() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.purge_old_security_log() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.purge_old_transcripciones() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.recalcular_alertas_margen(p_articulo_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.recalcular_consumo_mensual(p_restaurante_id uuid, p_anno integer, p_mes integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.reencolar_comanda(p_comanda_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.registrar_cobro_caja(p_restaurante_id uuid, p_turno_id uuid, p_camarero_id uuid, p_camarero_nombre text, p_factura_id uuid, p_comanda_id uuid, p_mesa_label text, p_importe numeric, p_entregado numeric, p_cambio numeric, p_metodo_tipo text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.registrar_sobrante_evento(p_evento_id uuid, p_concepto text, p_importe numeric, p_cantidad numeric, p_unidad text, p_producto_id uuid, p_devolver_stock boolean) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.reponer_stock_fuera_carta(p_producto_id uuid, p_restaurante_id uuid, p_nuevo_stock integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.resolve_restaurante(p_slug_or_code text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.resolver_error(p_error_id uuid, p_notas text, p_resuelto_por text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.rotate_kds_token(p_restaurante_id uuid, p_owner_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.search_leads_sevilla_nuevos(limit_count integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.sembrar_restaurante_nuevo(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.set_session_context(rid uuid, cid uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.set_tenant_context(rid uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.siguiente_numero_factura(p_restaurante_id uuid, p_serie text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.super_get_all_restaurantes() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.super_get_restaurantes() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.trial_dias_restantes(p_restaurante_id uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iarest.trigger_factura_al_cobrar() TO PUBLIC, anon, authenticated;

COMMIT;
