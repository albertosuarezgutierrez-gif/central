-- apps/asegura/prisma/sql/2026-09-21_renovacion_contactos.sql
--
-- Historial de contactos de RENOVACIÓN (cliente vivo cuya póliza vence
-- pronto), distinto de `recaptacion_envios` (leads muertos del volcado).
-- Mismo patrón: no hay "cola" que guardar, se deriva en cada GET de
-- `vencimientosProximos()`; esta tabla es solo el HISTORIAL que alimenta el
-- cooldown de 14 días y el "contactado hace N días" de la pantalla.
--
-- Solo WhatsApp por ahora (sin WABA: se registra que Alberto abrió el enlace
-- con el mensaje ya escrito, no que el cliente lo leyó) — `canal` queda como
-- columna abierta para cuando haya email, en vez de migrar otra vez.
create table if not exists seguros.renovacion_contactos (
  id             uuid primary key default gen_random_uuid(),
  correduria_id  uuid not null,
  cliente_id     uuid not null,
  poliza_id      uuid not null,
  canal          text not null default 'whatsapp',
  mensaje        text not null,
  creado_por     text not null,
  created_at     timestamp not null default now()
);

create index if not exists ix_renovacion_contactos_poliza
  on seguros.renovacion_contactos (poliza_id, created_at desc);
