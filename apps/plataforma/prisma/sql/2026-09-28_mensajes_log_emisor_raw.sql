-- Diagnóstico de atribución del agente de huéspedes (28/09/2026, reserva 154692216): mensajes que
-- Alberto escribió fuera de Smoobu entraron como del huésped. Guarda de dónde vino la pregunta y las
-- señales crudas de Smoobu (type, sent_by_owner, sender, campos) con las que se decidió el emisor.
-- NULL = fila anterior a esta columna (no se sabe), no «sin señales».
ALTER TABLE mensajes_log ADD COLUMN IF NOT EXISTS emisor_raw jsonb;
