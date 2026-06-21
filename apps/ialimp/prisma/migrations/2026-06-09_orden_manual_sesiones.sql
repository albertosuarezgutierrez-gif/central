-- Orden manual de limpiezas + urgencia manual (peticiones de Vanessa, jun-2026)
-- cleaning_sessions se gestiona por SQL crudo (no está en schema.prisma).
-- Ambas columnas son NULLABLE y sin default → seguras en la BD compartida con SIVRA
-- (no tocan RLS, buckets ni anon-key).
--
--  orden_manual    int   → posición fijada a mano por el admin para ese día.
--                          Cuando una limpieza del día tiene orden_manual, manda
--                          sobre el orden automático por urgencia. NULL = automático.
--  urgente_manual  bool  → el admin marca la limpieza como urgente a mano (sube
--                          arriba del todo aunque no tenga ventana ajustada).

ALTER TABLE cleaning_sessions ADD COLUMN IF NOT EXISTS orden_manual   integer;
ALTER TABLE cleaning_sessions ADD COLUMN IF NOT EXISTS urgente_manual boolean NOT NULL DEFAULT false;

-- Índice para ordenar rápido por día+orden manual (scope empresa).
CREATE INDEX IF NOT EXISTS idx_cleaning_sessions_orden_manual
  ON cleaning_sessions (empresa_id, session_date, orden_manual)
  WHERE orden_manual IS NOT NULL;

-- La app de la limpiadora (/l) lee de la VISTA sesiones_limpiadora, que NO exponía
-- `notas` (las especificaciones que escribe el admin no llegaban a la limpiadora) ni
-- las columnas nuevas. Se amplía con CREATE OR REPLACE (NUNCA DROP; solo se AÑADEN
-- columnas al final para no romper el contrato existente).
CREATE OR REPLACE VIEW sesiones_limpiadora AS
 SELECT cs.id,
    cs.session_date,
    cs.property_name,
    cs.tipo_servicio,
    cs.started_at,
    cs.completed_at,
    cs.hora_inicio,
    cs.hora_checkout::text AS hora_checkout,
    cs.hora_checkin_siguiente::text AS hora_checkin_siguiente,
    cs.ventana_minutos,
    cs.alerta_ventana,
    cs.num_huespedes,
    cs.checklist_data,
    cs.incidencias,
    cs.limpiadora_id,
    cs.empresa_id,
    cs.propiedad_id,
    cs.cliente_id,
    cs.guest_name,
        CASE
            WHEN cs.completed_at IS NOT NULL THEN 'completada'::text
            WHEN cs.started_at IS NOT NULL THEN 'en_curso'::text
            ELSE 'pendiente'::text
        END AS estado,
    p.direccion,
    p.codigo_postal,
    p.duracion_estimada_min,
    p.flexibilidad_horaria,
    p.hora_pactada::text AS hora_pactada,
    p.num_camas_135 AS num_camas_dobles,
    p.num_camas_90 AS num_camas_individuales,
    p.num_banos,
    p.tiene_piscina,
    p.gestion_lenceria,
    p.notas_material,
    p.instrucciones_acceso,
    p.archivos_acceso,
    p.tipo_acceso,
    p.codigo_acceso,
    c.nombre AS cliente_nombre,
    cs.notas,
    cs.orden_manual,
    cs.urgente_manual
   FROM cleaning_sessions cs
     LEFT JOIN propiedades p ON p.id = cs.propiedad_id
     LEFT JOIN clientes c ON c.id = cs.cliente_id;
