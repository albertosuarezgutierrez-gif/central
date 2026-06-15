-- Banca · campo "destino"/negocio en movimientos_bancarios. Clasifica a quién pertenece cada
-- movimiento (pisos turísticos, Dúplex, seguros/correduría, traspaso interno, personal) por
-- reglas de banco + palabras clave (lib/categorizar.ts clasificarDestino). Aditivo, ya
-- aplicado por Supabase MCP.
alter table public.movimientos_bancarios
  add column if not exists destino text;
