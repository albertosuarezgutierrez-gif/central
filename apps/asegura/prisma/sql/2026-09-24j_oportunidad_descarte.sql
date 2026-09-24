-- 2026-09-24j — «Descartar» una oportunidad (Fase 1 del rediseño de la ficha).
-- Una oportunidad abierta por error o duplicada se cierra como `perdida` con
-- motivo `error_alta`, NO se borra: `oportunidad_historial` la referencia y el
-- rastro se queda. Las cuentas de ventas perdidas la excluyen
-- (`MOTIVO_DESCARTE` de @central/module-seguros).
-- La lista tiene que ser la de MOTIVOS_PERDIDA (la vigila oportunidad-seguimiento.test.ts
-- contra 2026-09-23_oportunidad_seguimiento.sql, que se ha actualizado igual).
ALTER TABLE seguros.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_motivo_perdida_ck;
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_motivo_perdida_ck CHECK (
  motivo_perdida IS NULL OR motivo_perdida IN
    ('precio','competidor','coberturas','cliente_desiste','sin_respuesta','no_contactable','ya_asegurado','otro','error_alta')
);
