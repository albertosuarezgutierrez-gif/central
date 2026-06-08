-- Aviso por Telegram al confirmarse un pago en un portal de cobros de grupo.
-- Flag por portal: hoy solo activo para el Congreso Empresarial de Junio 2026;
-- en el futuro se enciende cualquier otro portal poniendo avisar_telegram = true.

alter table cobros_grupo
  add column if not exists avisar_telegram boolean not null default false;

update cobros_grupo
  set avisar_telegram = true
  where slug = 'congreso-empresarial-junio-2026-mpqtmo7a';
