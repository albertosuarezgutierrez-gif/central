-- Pasarela de IA central: añadir coste/tokens al registro de uso (ver dinero real, no solo conteo).
-- Aditivo e idempotente: no rompe ialimp/sivra que comparten la misma BD.
alter table public.ai_usos add column if not exists tokens integer not null default 0;
alter table public.ai_usos add column if not exists coste_eur numeric(12,6) not null default 0;
