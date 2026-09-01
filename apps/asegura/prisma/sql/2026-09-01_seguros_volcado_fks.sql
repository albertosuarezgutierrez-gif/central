-- =============================================================================
-- Volcado de la correduría: CLAVES FORÁNEAS (131)
-- =============================================================================
-- Ejecutar AL FINAL: después del DDL y después de cargar los datos.
--
-- 🚨 CORRIGE UN DATO FALSO DEL RUNBOOK. `docs/TRASPASO-CORREDURIA.md` afirmaba
--    «Cero claves foráneas en 52 tablas… La integridad referencial está en el
--    código, no en la BD» y concluía «para el volcado es buena noticia: no hay
--    orden de carga que respetar». Medido el 01/09/2026 sobre el origen:
--    **131 claves foráneas** (`pg_constraint.contype = 'f'`). Sí hay integridad
--    en la BD y sí importa el orden.
--
-- Por eso las FKs van SEPARADAS y al final, y no dentro del DDL:
--   1. Sin FKs activas, las 52 tablas se cargan en cualquier orden. Con ellas,
--      haría falta un orden topológico — y hay ciclos (`polizas.poliza_padre_id`
--      y `clientes.merged_into_cliente_id` se referencian a sí mismas), así que
--      no existe un orden que funcione sin diferirlas.
--   2. Crearlas al final es la VERIFICACIÓN más dura del volcado: si una falla,
--      es que falta una fila. Un volcado que aguanta las 131 está completo de
--      verdad, no «parece completo».
--
-- Si alguna falla, NO borrarla para «que pase». Significa que el volcado dejó
-- huérfanos y hay que averiguar por qué.
-- =============================================================================

SET search_path = seguros, public;

ALTER TABLE seguros.bien_documentos ADD CONSTRAINT bien_documentos_bien_id_fkey FOREIGN KEY (bien_id) REFERENCES seguros.bienes_asegurables(id) ON DELETE CASCADE;
ALTER TABLE seguros.bien_documentos ADD CONSTRAINT bien_documentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.bien_documentos ADD CONSTRAINT bien_documentos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.bien_documentos ADD CONSTRAINT bien_documentos_uploaded_by_usuario_id_fkey FOREIGN KEY (uploaded_by_usuario_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.bienes_asegurables ADD CONSTRAINT bienes_asegurables_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.bot_eval_scores ADD CONSTRAINT bot_eval_scores_run_id_fkey FOREIGN KEY (run_id) REFERENCES seguros.bot_eval_runs(id) ON DELETE CASCADE;
ALTER TABLE seguros.bot_turn_traces ADD CONSTRAINT bot_turn_traces_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES seguros.conversaciones(id);
ALTER TABLE seguros.bot_turn_traces ADD CONSTRAINT bot_turn_traces_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.channel_inbound_messages ADD CONSTRAINT channel_inbound_messages_cliente_id_clientes_id_fk FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.channel_inbound_messages ADD CONSTRAINT channel_inbound_messages_conversacion_id_conversaciones_id_fk FOREIGN KEY (conversacion_id) REFERENCES seguros.conversaciones(id);
ALTER TABLE seguros.channel_inbound_messages ADD CONSTRAINT channel_inbound_messages_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.channel_inbound_messages ADD CONSTRAINT channel_inbound_messages_mensaje_id_mensajes_id_fk FOREIGN KEY (mensaje_id) REFERENCES seguros.mensajes(id);
ALTER TABLE seguros.cima_ficheros ADD CONSTRAINT cima_ficheros_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cima_ficheros ADD CONSTRAINT cima_ficheros_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.cima_ficheros ADD CONSTRAINT cima_ficheros_poliza_id_polizas_id_fk FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE SET NULL;
ALTER TABLE seguros.cliente_carnets_conducir ADD CONSTRAINT cliente_carnets_conducir_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.cliente_carnets_conducir ADD CONSTRAINT cliente_carnets_conducir_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cliente_emails ADD CONSTRAINT cliente_emails_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.cliente_emails ADD CONSTRAINT cliente_emails_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cliente_merge_log ADD CONSTRAINT cliente_merge_log_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cliente_merge_log ADD CONSTRAINT cliente_merge_log_merged_cliente_id_fkey FOREIGN KEY (merged_cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.cliente_merge_log ADD CONSTRAINT cliente_merge_log_surviving_cliente_id_fkey FOREIGN KEY (surviving_cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.cliente_relaciones ADD CONSTRAINT cliente_relaciones_cliente_a_id_fkey FOREIGN KEY (cliente_a_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.cliente_relaciones ADD CONSTRAINT cliente_relaciones_cliente_b_id_fkey FOREIGN KEY (cliente_b_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.cliente_relaciones ADD CONSTRAINT cliente_relaciones_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cliente_telefonos ADD CONSTRAINT cliente_telefonos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.cliente_telefonos ADD CONSTRAINT cliente_telefonos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.clientes ADD CONSTRAINT clientes_comercial_id_fkey FOREIGN KEY (comercial_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.clientes ADD CONSTRAINT clientes_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.clientes ADD CONSTRAINT clientes_merged_into_cliente_id_fkey FOREIGN KEY (merged_into_cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.clientes ADD CONSTRAINT clientes_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.codeoscopic_documents ADD CONSTRAINT codeoscopic_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES seguros.codeoscopic_projects(id) ON DELETE CASCADE;
ALTER TABLE seguros.codeoscopic_offers ADD CONSTRAINT codeoscopic_offers_project_id_fkey FOREIGN KEY (project_id) REFERENCES seguros.codeoscopic_projects(id) ON DELETE CASCADE;
ALTER TABLE seguros.codeoscopic_participants ADD CONSTRAINT codeoscopic_participants_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.codeoscopic_participants ADD CONSTRAINT codeoscopic_participants_project_id_fkey FOREIGN KEY (project_id) REFERENCES seguros.codeoscopic_projects(id) ON DELETE CASCADE;
ALTER TABLE seguros.codeoscopic_prices ADD CONSTRAINT codeoscopic_prices_project_id_fkey FOREIGN KEY (project_id) REFERENCES seguros.codeoscopic_projects(id) ON DELETE CASCADE;
ALTER TABLE seguros.codeoscopic_product_forms ADD CONSTRAINT codeoscopic_product_forms_project_id_fkey FOREIGN KEY (project_id) REFERENCES seguros.codeoscopic_projects(id) ON DELETE CASCADE;
ALTER TABLE seguros.codeoscopic_projects ADD CONSTRAINT codeoscopic_projects_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.codeoscopic_projects ADD CONSTRAINT codeoscopic_projects_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.codeoscopic_projects ADD CONSTRAINT codeoscopic_projects_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.codeoscopic_projects ADD CONSTRAINT codeoscopic_projects_oportunidad_id_fkey FOREIGN KEY (oportunidad_id) REFERENCES seguros.oportunidades(id);
ALTER TABLE seguros.codeoscopic_projects ADD CONSTRAINT codeoscopic_projects_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.codeoscopic_webhook_events ADD CONSTRAINT codeoscopic_webhook_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES seguros.codeoscopic_projects(id) ON DELETE SET NULL;
ALTER TABLE seguros.consent_logs ADD CONSTRAINT consent_logs_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.consent_logs ADD CONSTRAINT consent_logs_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.conversaciones ADD CONSTRAINT conversaciones_cliente_id_clientes_id_fk FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.conversaciones ADD CONSTRAINT conversaciones_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.conversaciones ADD CONSTRAINT conversaciones_escalado_a_usuarios_id_fk FOREIGN KEY (escalado_a) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.cotizaciones ADD CONSTRAINT cotizaciones_cliente_id_clientes_id_fk FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.cotizaciones ADD CONSTRAINT cotizaciones_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cotizaciones ADD CONSTRAINT cotizaciones_poliza_origen_id_polizas_id_fk FOREIGN KEY (poliza_origen_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.cotizaciones ADD CONSTRAINT cotizaciones_poliza_resultante_id_fkey FOREIGN KEY (poliza_resultante_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.cotizaciones ADD CONSTRAINT cotizaciones_user_id_fkey FOREIGN KEY (user_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.cotizaciones_anonimas ADD CONSTRAINT cotizaciones_anonimas_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.cotizaciones_anonimas ADD CONSTRAINT cotizaciones_anonimas_merged_cotizacion_id_fkey FOREIGN KEY (merged_cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.cuenta_efectivo ADD CONSTRAINT cuenta_efectivo_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_destinada_a_fkey FOREIGN KEY (destinada_a) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_oportunidad_id_fkey FOREIGN KEY (oportunidad_id) REFERENCES seguros.oportunidades(id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_siniestro_id_fkey FOREIGN KEY (siniestro_id) REFERENCES seguros.siniestros(id);
ALTER TABLE seguros.historial_interno ADD CONSTRAINT historial_interno_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.historial_interno ADD CONSTRAINT historial_interno_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id) ON DELETE CASCADE;
ALTER TABLE seguros.historial_interno ADD CONSTRAINT historial_interno_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.historial_interno ADD CONSTRAINT historial_interno_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE CASCADE;
ALTER TABLE seguros.lds_consent ADD CONSTRAINT lds_consent_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.lds_consent ADD CONSTRAINT lds_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES seguros.usuarios(id) ON DELETE CASCADE;
ALTER TABLE seguros.liquidacion_movimientos ADD CONSTRAINT liquidacion_movimientos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.liquidacion_movimientos ADD CONSTRAINT liquidacion_movimientos_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES seguros.liquidaciones(id) ON DELETE CASCADE;
ALTER TABLE seguros.liquidacion_movimientos ADD CONSTRAINT liquidacion_movimientos_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE SET NULL;
ALTER TABLE seguros.liquidacion_movimientos ADD CONSTRAINT liquidacion_movimientos_recibo_id_fkey FOREIGN KEY (recibo_id) REFERENCES seguros.poliza_recibos(id) ON DELETE SET NULL;
ALTER TABLE seguros.liquidaciones ADD CONSTRAINT liquidaciones_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.liquidaciones ADD CONSTRAINT liquidaciones_cuenta_efectivo_id_fkey FOREIGN KEY (cuenta_efectivo_id) REFERENCES seguros.cuenta_efectivo(id) ON DELETE CASCADE;
ALTER TABLE seguros.mediator_audit_log ADD CONSTRAINT mediator_audit_log_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.mediator_audit_log ADD CONSTRAINT mediator_audit_log_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.mediator_audit_log ADD CONSTRAINT mediator_audit_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.mensajes ADD CONSTRAINT mensajes_conversacion_id_conversaciones_id_fk FOREIGN KEY (conversacion_id) REFERENCES seguros.conversaciones(id);
ALTER TABLE seguros.ofertas_automaticas ADD CONSTRAINT ofertas_automaticas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.ofertas_automaticas ADD CONSTRAINT ofertas_automaticas_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.ofertas_automaticas ADD CONSTRAINT ofertas_automaticas_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.ofertas_automaticas ADD CONSTRAINT ofertas_automaticas_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.operational_events ADD CONSTRAINT operational_events_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.operational_events ADD CONSTRAINT operational_events_cotizacion_id_cotizaciones_id_fk FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_comercial_id_fkey FOREIGN KEY (comercial_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_poliza_ganada_id_fkey FOREIGN KEY (poliza_ganada_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.peticiones ADD CONSTRAINT peticiones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.peticiones ADD CONSTRAINT peticiones_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.peticiones ADD CONSTRAINT peticiones_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.poliza_coberturas ADD CONSTRAINT poliza_coberturas_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.poliza_coberturas ADD CONSTRAINT poliza_coberturas_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE CASCADE;
ALTER TABLE seguros.poliza_documentos ADD CONSTRAINT poliza_documentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.poliza_documentos ADD CONSTRAINT poliza_documentos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.poliza_documentos ADD CONSTRAINT poliza_documentos_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE CASCADE;
ALTER TABLE seguros.poliza_documentos ADD CONSTRAINT poliza_documentos_uploaded_by_usuario_id_fkey FOREIGN KEY (uploaded_by_usuario_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.poliza_intervinientes ADD CONSTRAINT poliza_intervinientes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.poliza_intervinientes ADD CONSTRAINT poliza_intervinientes_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.poliza_intervinientes ADD CONSTRAINT poliza_intervinientes_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE CASCADE;
ALTER TABLE seguros.poliza_merge_log ADD CONSTRAINT poliza_merge_log_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.poliza_merge_log ADD CONSTRAINT poliza_merge_log_merged_poliza_id_fkey FOREIGN KEY (merged_poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.poliza_merge_log ADD CONSTRAINT poliza_merge_log_surviving_poliza_id_fkey FOREIGN KEY (surviving_poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.poliza_recibos ADD CONSTRAINT poliza_recibos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.poliza_recibos ADD CONSTRAINT poliza_recibos_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id) ON DELETE CASCADE;
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_cliente_id_clientes_id_fk FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_comercial_id_fkey FOREIGN KEY (comercial_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_merged_into_poliza_id_fkey FOREIGN KEY (merged_into_poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_oportunidad_origen_id_fkey FOREIGN KEY (oportunidad_origen_id) REFERENCES seguros.oportunidades(id);
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_poliza_padre_id_fkey FOREIGN KEY (poliza_padre_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.recordatorios ADD CONSTRAINT recordatorios_cliente_id_clientes_id_fk FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.recordatorios ADD CONSTRAINT recordatorios_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.recordatorios ADD CONSTRAINT recordatorios_cotizacion_id_cotizaciones_id_fk FOREIGN KEY (cotizacion_id) REFERENCES seguros.cotizaciones(id);
ALTER TABLE seguros.recordatorios ADD CONSTRAINT recordatorios_poliza_id_polizas_id_fk FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.siniestro_contrarios ADD CONSTRAINT siniestro_contrarios_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.siniestro_contrarios ADD CONSTRAINT siniestro_contrarios_siniestro_id_fkey FOREIGN KEY (siniestro_id) REFERENCES seguros.siniestros(id) ON DELETE CASCADE;
ALTER TABLE seguros.siniestro_lesionados ADD CONSTRAINT siniestro_lesionados_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.siniestro_lesionados ADD CONSTRAINT siniestro_lesionados_siniestro_id_fkey FOREIGN KEY (siniestro_id) REFERENCES seguros.siniestros(id) ON DELETE CASCADE;
ALTER TABLE seguros.siniestro_testigos ADD CONSTRAINT siniestro_testigos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.siniestro_testigos ADD CONSTRAINT siniestro_testigos_siniestro_id_fkey FOREIGN KEY (siniestro_id) REFERENCES seguros.siniestros(id) ON DELETE CASCADE;
ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_comercial_id_fkey FOREIGN KEY (comercial_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_poliza_id_fkey FOREIGN KEY (poliza_id) REFERENCES seguros.polizas(id);
ALTER TABLE seguros.solicitud_cambio_documentos ADD CONSTRAINT solicitud_cambio_documentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES seguros.clientes(id);
ALTER TABLE seguros.solicitud_cambio_documentos ADD CONSTRAINT solicitud_cambio_documentos_correduria_id_fkey FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.solicitud_cambio_documentos ADD CONSTRAINT solicitud_cambio_documentos_operational_event_id_fkey FOREIGN KEY (operational_event_id) REFERENCES seguros.operational_events(id) ON DELETE CASCADE;
ALTER TABLE seguros.solicitud_cambio_documentos ADD CONSTRAINT solicitud_cambio_documentos_uploaded_by_usuario_id_fkey FOREIGN KEY (uploaded_by_usuario_id) REFERENCES seguros.usuarios(id);
ALTER TABLE seguros.usuarios ADD CONSTRAINT usuarios_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
ALTER TABLE seguros.whatsapp_outbound_messages ADD CONSTRAINT whatsapp_outbound_messages_correduria_id_corredurias_id_fk FOREIGN KEY (correduria_id) REFERENCES seguros.corredurias(id);
