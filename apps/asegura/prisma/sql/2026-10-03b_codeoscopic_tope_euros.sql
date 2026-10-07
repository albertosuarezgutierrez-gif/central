-- Tope de gasto de Avant2 en EUROS por mes natural — apps/asegura (03/10/2026)
-- ============================================================================
-- Decisión de Alberto (29/09/2026): aviso por Telegram al cruzar 60 €, BLOQUEO de toda llamada
-- que cueste al llegar a 70 €, hasta que autorice con un botón que amplía +30 € (repetible).
-- El gasto sale de `seguros.codeoscopic_consumo`; esta tabla guarda lo que el libro no tiene:
-- los avisos/bloqueos (para mandarlos una sola vez) y las ampliaciones autorizadas.
--
-- ⚠️ SIN esta tabla, `leerGastoMes()` falla y NO SE LLAMA a Avant2 (fail-closed): hay que
-- aplicarla ANTES de desplegar el código que la usa.
--
-- Una fila por (correduría, mes, tipo, nivel), y esa unicidad ES la idempotencia:
--   aviso      → nivel 6000: un aviso por mes.
--   bloqueo    → nivel = tope alcanzado (7000, 10000…): un aviso con botón por nivel.
--   ampliacion → nivel = tope DESDE el que se amplía: pulsar el mismo botón dos veces (o un
--                reenvío del webhook de Telegram) suma +30 € una sola vez.

create table if not exists seguros.codeoscopic_tope_evento (
  id                    bigserial   primary key,
  correduria_id         uuid        not null,
  -- Primer día del mes natural en Europe/Madrid.
  mes                   date        not null check (extract(day from mes) = 1),
  tipo                  text        not null check (tipo in ('aviso', 'bloqueo', 'ampliacion')),
  nivel_cents           integer     not null check (nivel_cents > 0),
  -- Solo la ampliación suma; los avisos y bloqueos no mueven el tope.
  importe_cents         integer     not null default 0,
  -- Gasto del mes en el momento del aviso/bloqueo (para el texto de Telegram).
  gastado_cents         integer,
  -- Ampliación: quién pulsó (id de Telegram) y el callback, para la auditoría.
  autorizado_por        text,
  telegram_callback_id  text,
  creado_at             timestamptz not null default now(),
  -- Aviso/bloqueo: cuándo lo mandó plataforma por Telegram. NULL = pendiente de mandar.
  notificado_at         timestamptz,

  constraint codeoscopic_tope_evento_unico unique (correduria_id, mes, tipo, nivel_cents),
  constraint codeoscopic_tope_evento_importe check (
    (tipo = 'ampliacion' and importe_cents > 0 and autorizado_por is not null)
    or (tipo <> 'ampliacion' and importe_cents = 0)
  )
);

create index if not exists codeoscopic_tope_evento_pendiente_idx
  on seguros.codeoscopic_tope_evento (correduria_id, mes)
  where notificado_at is null;

grant select, insert, update on seguros.codeoscopic_tope_evento to prisma_seguros;
grant usage, select on sequence seguros.codeoscopic_tope_evento_id_seq to prisma_seguros;

comment on table seguros.codeoscopic_tope_evento is
  'Tope de gasto de Avant2 en euros/mes: avisos (60 €), bloqueos (70 € + ampliaciones) y '
  'ampliaciones de +30 € autorizadas por Alberto con el botón de Telegram.';
