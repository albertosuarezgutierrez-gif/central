-- Fix: security_definer_view (62 vistas) + rls_disabled (1 tabla)
-- Resolución: security_invoker=on para que las vistas respeten la RLS del llamante.
-- service_role sigue bypasseando RLS → los usos server-side no se rompen.
-- Ver: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

-- schema: iarest
ALTER VIEW iarest."camareros" SET (security_invoker = on);
ALTER VIEW iarest."v_alergenos_menu" SET (security_invoker = on);
ALTER VIEW iarest."v_billing_estado" SET (security_invoker = on);
ALTER VIEW iarest."v_candidatos_con_analisis" SET (security_invoker = on);
ALTER VIEW iarest."v_cashlogy_stats" SET (security_invoker = on);
ALTER VIEW iarest."v_cobro_resumen_super" SET (security_invoker = on);
ALTER VIEW iarest."v_cobros_resumen" SET (security_invoker = on);
ALTER VIEW iarest."v_comisiones_comercial" SET (security_invoker = on);
ALTER VIEW iarest."v_comisiones_coordinador" SET (security_invoker = on);
ALTER VIEW iarest."v_cuentas_con_restaurantes" SET (security_invoker = on);
ALTER VIEW iarest."v_disponibilidad_espacios" SET (security_invoker = on);
ALTER VIEW iarest."v_distilacion_ratio" SET (security_invoker = on);
ALTER VIEW iarest."v_distilacion_stats" SET (security_invoker = on);
ALTER VIEW iarest."v_elaboraciones_activas" SET (security_invoker = on);
ALTER VIEW iarest."v_escandallos" SET (security_invoker = on);
ALTER VIEW iarest."v_eventos_calendario" SET (security_invoker = on);
ALTER VIEW iarest."v_facturas_con_comanda" SET (security_invoker = on);
ALTER VIEW iarest."v_fuera_carta_activos" SET (security_invoker = on);
ALTER VIEW iarest."v_fuera_carta_disponibles" SET (security_invoker = on);
ALTER VIEW iarest."v_heal_stats" SET (security_invoker = on);
ALTER VIEW iarest."v_heal_stats_restaurante" SET (security_invoker = on);
ALTER VIEW iarest."v_incidencias_resumen" SET (security_invoker = on);
ALTER VIEW iarest."v_leads_pipeline" SET (security_invoker = on);
ALTER VIEW iarest."v_necesidades_pedido" SET (security_invoker = on);
ALTER VIEW iarest."v_patrones_fallos" SET (security_invoker = on);
ALTER VIEW iarest."v_pedidos_pendientes_grupo" SET (security_invoker = on);
ALTER VIEW iarest."v_pipeline_eventos" SET (security_invoker = on);
ALTER VIEW iarest."v_portal_stats" SET (security_invoker = on);
ALTER VIEW iarest."v_portal_ventas_semana" SET (security_invoker = on);
ALTER VIEW iarest."v_productos_con_proveedor" SET (security_invoker = on);
ALTER VIEW iarest."v_productos_con_seccion" SET (security_invoker = on);
ALTER VIEW iarest."v_proveedores_blog" SET (security_invoker = on);
ALTER VIEW iarest."v_pyl_sociedad" SET (security_invoker = on);
ALTER VIEW iarest."v_rappels_proyeccion" SET (security_invoker = on);
ALTER VIEW iarest."v_recepciones_resumen" SET (security_invoker = on);
ALTER VIEW iarest."v_recomendaciones_activas" SET (security_invoker = on);
ALTER VIEW iarest."v_rentabilidad_eventos" SET (security_invoker = on);
ALTER VIEW iarest."v_resumen_financiero_anual" SET (security_invoker = on);
ALTER VIEW iarest."v_stock_actual" SET (security_invoker = on);
ALTER VIEW iarest."v_stock_critico_grupo" SET (security_invoker = on);
ALTER VIEW iarest."v_stock_eventos_proximos" SET (security_invoker = on);
ALTER VIEW iarest."v_stock_resumen" SET (security_invoker = on);
ALTER VIEW iarest."v_sugerencias_stats" SET (security_invoker = on);
ALTER VIEW iarest."v_system_errors_resumen" SET (security_invoker = on);
ALTER VIEW iarest."v_training_global" SET (security_invoker = on);
ALTER VIEW iarest."v_vinos_stats" SET (security_invoker = on);
ALTER VIEW iarest."vinos_catalogo_compat" SET (security_invoker = on);

-- schema: public (sivra / ialimp)
ALTER VIEW public."agenda_dia" SET (security_invoker = on);
ALTER VIEW public."carga_limpiadora" SET (security_invoker = on);
ALTER VIEW public."coste_por_sesion" SET (security_invoker = on);
ALTER VIEW public."gastos_por_vencer" SET (security_invoker = on);
ALTER VIEW public."propiedades_resumen" SET (security_invoker = on);
ALTER VIEW public."rendimiento_limpiadoras" SET (security_invoker = on);
ALTER VIEW public."sesiones_completas" SET (security_invoker = on);
ALTER VIEW public."sesiones_con_precio" SET (security_invoker = on);
ALTER VIEW public."sesiones_limpiadora" SET (security_invoker = on);
ALTER VIEW public."v_consumo_medio_producto" SET (security_invoker = on);
ALTER VIEW public."v_contab_gastos" SET (security_invoker = on);
ALTER VIEW public."v_contab_ingresos" SET (security_invoker = on);
ALTER VIEW public."v_contab_iva" SET (security_invoker = on);
ALTER VIEW public."v_contab_pyg" SET (security_invoker = on);
ALTER VIEW public."v_contab_tesoreria" SET (security_invoker = on);

-- Fix: rls_disabled_in_public — iarest.instagram_estilos_usados
-- Tabla interna sin columna tenant; RLS sin política = solo service_role accede.
ALTER TABLE iarest.instagram_estilos_usados ENABLE ROW LEVEL SECURITY;
