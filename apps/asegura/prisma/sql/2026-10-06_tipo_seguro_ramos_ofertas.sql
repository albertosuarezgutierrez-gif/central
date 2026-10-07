-- Añade 12 ramos al enum seguros.tipo_seguro (oportunidades «con ofertas de compañías»):
-- empresas, rc_profesional, dyo, flotas, transporte_mercancias, ciberriesgos, decenal,
-- embarcaciones, mascotas, impago_alquiler, viaje, caucion.
--
-- ⚠️ IRREVERSIBLE: un valor de enum no se puede QUITAR después, solo añadir.
-- ⚠️ Se aplica A MANO (no lo ejecuta ningún despliegue). ALTER TYPE ... ADD VALUE no puede
-- usarse en la misma transacción en la que se añade, así que va sin BEGIN/COMMIT y sin más
-- sentencias que lo usen.
--
-- Verificación tras aplicarlo:
--   SELECT enum_range(NULL::seguros.tipo_seguro);
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'empresas';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'rc_profesional';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'dyo';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'flotas';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'transporte_mercancias';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'ciberriesgos';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'decenal';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'embarcaciones';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'mascotas';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'impago_alquiler';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'viaje';
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'caucion';
