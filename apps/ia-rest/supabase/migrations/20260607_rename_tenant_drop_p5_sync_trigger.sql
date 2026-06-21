-- Fase 3 DROP paso 5: eliminar función de sync (CASCADE elimina los triggers trg_sync_local_id).
drop function if exists public.sync_local_restaurante_id() cascade;
