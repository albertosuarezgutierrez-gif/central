-- Contactos repetidos EN LA MISMA ficha (29/09/2026). Alberto, con el mismo móvil dos veces en la
-- ficha de Antonio Cruz: «no se puede duplicar datos de contactos».
--
-- Medido antes de aplicar: 11 teléfonos y 278 emails repetidos (mismo índice ciego, misma ficha).
-- Tres orígenes: la fusión de fichas (277 emails, «otro»/«de ficha fusionada»: copiaba el contacto de
-- la absorbida cuando la superviviente lo tenía sin hash), el volcado de junio (10 teléfonos, 6 con
-- los dos marcados como principal) y un alta repetida desde la ficha (el de Antonio Cruz).
--
-- 1) Se queda UNA fila por (ficha, hash): la principal si la hay, si no la más antigua. Lo que se
--    borra tiene el MISMO valor que lo que queda, así que no se pierde ningún dato de contacto.
--    Cada ficha tocada deja una línea en su historial (sin el valor).
--    ⚠️ El trigger `portal_vinculo_retira_correo` retira los vínculos del portal de la ficha al borrar
--    un email. Medido: ninguna de las fichas afectadas tiene vínculo, así que aquí no expulsa a nadie.
-- 2) Índice ÚNICO parcial por (ficha, hash): la BD ya no admite el repetido, venga de donde venga
--    (alta desde la ficha, CIMA, fusión). El backfill de hashes lo absorbe: reintenta fila a fila y
--    cuenta la que choque en `fallidos`.

begin;

with rank as (
  select id, row_number() over (partition by cliente_id, telefono_lookup_hash order by es_principal desc, created_at, id) rn
  from seguros.cliente_telefonos where telefono_lookup_hash is not null
), borrados as (
  delete from seguros.cliente_telefonos t using rank r where t.id = r.id and r.rn > 1
  returning t.cliente_id, t.correduria_id
)
insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
select correduria_id, cliente_id, 'contacto'::seguros.tipo_historial_interno,
       'Retirado ' || count(*) || ' teléfono repetido en la ficha (el mismo número estaba dos veces). Limpieza de duplicados del 29/09/2026.'
from borrados group by correduria_id, cliente_id;

with rank as (
  select id, row_number() over (partition by cliente_id, email_lookup_hash order by es_principal desc, created_at, id) rn
  from seguros.cliente_emails where email_lookup_hash is not null
), borrados as (
  delete from seguros.cliente_emails e using rank r where e.id = r.id and r.rn > 1
  returning e.cliente_id, e.correduria_id
)
insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
select correduria_id, cliente_id, 'contacto'::seguros.tipo_historial_interno,
       'Retirado ' || count(*) || ' email repetido en la ficha (el mismo correo estaba dos veces). Limpieza de duplicados del 29/09/2026.'
from borrados group by correduria_id, cliente_id;

create unique index if not exists uq_cliente_telefonos_ficha_hash
  on seguros.cliente_telefonos (cliente_id, telefono_lookup_hash) where telefono_lookup_hash is not null;
create unique index if not exists uq_cliente_emails_ficha_hash
  on seguros.cliente_emails (cliente_id, email_lookup_hash) where email_lookup_hash is not null;

commit;
