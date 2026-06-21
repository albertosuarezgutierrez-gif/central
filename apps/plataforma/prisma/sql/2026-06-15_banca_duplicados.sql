-- Banca · resolución de cargos duplicados. duplicado_estado guarda la decisión del dueño
-- sobre un par sospechoso (mismo importe + contraparte en ±4 días):
--   NULL        → sospechoso sin resolver (lo ve el detector)
--   'ignorado'  → "es normal, no avisar"  → excluido de la detección
--   'confirmado'→ "es un cobro doble real" → fuera de pendientes, queda registrado
-- Aditivo y nullable, mismo patrón que requiere_revision/conciliado/destino.
alter table public.movimientos_bancarios
  add column if not exists duplicado_estado text;

-- Acelera el filtro de pendientes (gastos sin resolver). Volumen pequeño, parcial.
create index if not exists idx_mov_dup_pendiente
  on public.movimientos_bancarios (cuenta_bancaria_id, fecha_operacion)
  where duplicado_estado is null and importe < 0;
