-- 2026-09-25a — «Eliminar» de Oportunidades una póliza del VOLCADO HISTÓRICO.
-- La ficha pone en el cubo «Oportunidades» la póliza histórica más reciente de
-- cada ramo sin nada más nuevo (lib/correduria/seguros-cliente.ts de plataforma).
-- No hay oportunidad detrás que descartar, así que la marca va en la póliza:
-- NULL = sigue siendo oportunidad; con fecha = el corredor la quitó (motivo
-- obligatorio en la UI). Aditivo y nullable: no toca ninguna fila existente.
-- Se deshace poniendo las dos columnas a NULL («Recuperar» en la ficha).
ALTER TABLE seguros.polizas
  ADD COLUMN IF NOT EXISTS lead_descartado_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_descartado_motivo varchar(300);
