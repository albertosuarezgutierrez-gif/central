-- Descarte de los leads del volcado que NO tienen forma de contacto ni actividad.
--
-- ─── Por qué ────────────────────────────────────────────────────────────────
-- Alberto, 05/09/2026: «aquí lo importante es cliente reales (CIMA), el resto
-- son leads antiguos… harían falta mails y móviles para poder captarlos» ·
-- «es preferible tener unos leads reales que no llenar con datos de leads sin
-- datos de comunicación».
--
-- Medido antes de escribirlo: de 31.947 fichas no fusionadas, **26.809 no tienen
-- ni teléfono, ni WhatsApp, ni email** (ni principal ni secundario). Son
-- incaptables: no hay por dónde llamarlas. La mayoría YA está descartada (26.277
-- del barrido anterior); esto cierra el resto.
--
-- ─── Qué se salva a propósito ───────────────────────────────────────────────
-- El criterio es más estricto que el del botón «descartar» de la ficha, que solo
-- exige no tener pólizas vivas. Aquí, además de eso, se salva TODA ficha con
-- cualquier rastro de actividad: siniestro, documento, historial interno, vínculo
-- de portal, cotización, oportunidad, gestión o petición. Medido: **67 fichas sin
-- canal tienen actividad** y se quedan.
--   🚨 Las **18 fichas de cartera viva sin canal** también se quedan, claro: son
--   clientes reales de CIMA y son justo las que salen en el bloque «Sin canal»
--   para que Alberto les complete el contacto. Descartarlas sería esconder el
--   trabajo, que es el error que este repo persigue.
--
-- ⚠️ La dirección postal NO cuenta como canal (293 fichas la tienen sin
-- teléfono ni email). Es una decisión, no un olvido: captar por carta no está
-- en el circuito. Si algún día lo está, estas fichas se restauran con el
-- `restaurarCliente` de siempre — el descarte es un borrado SUAVE.
--
-- ─── Reversible ─────────────────────────────────────────────────────────────
-- `activo = false`, la fila sigue ahí y su ficha se abre por su URL. El rastro
-- queda en `historial_interno` con el mismo texto que deja el botón de la ficha,
-- y con el lote en el texto para poder revertir justo estas:
--   update seguros.clientes set activo = true where id in (
--     select cliente_id from seguros.historial_interno
--      where texto like '%descarte-leads-sin-canal-2026-09-05%');
do $$
declare
  v_lote constant text := 'descarte-leads-sin-canal-2026-09-05';
  v_max  constant int  := 800;   -- tope: el barrido grande ya se hizo, aquí queda el resto
  v_n    int;
begin
  create temporary table if not exists _podar (id uuid primary key) on commit drop;
  delete from _podar;

  insert into _podar (id)
  select c.id
    from seguros.clientes c
   where c.merged_into_cliente_id is null
     and c.activo
     -- sin ningún canal de comunicación, ni principal ni secundario
     and nullif(btrim(coalesce(c.telefono, '')), '') is null
     and nullif(btrim(coalesce(c.wa_phone_number, '')), '') is null
     and nullif(btrim(coalesce(c.email, '')), '') is null
     and not exists (select 1 from seguros.cliente_telefonos t where t.cliente_id = c.id)
     and not exists (select 1 from seguros.cliente_emails  e where e.cliente_id = c.id)
     -- guarda dura, la misma que `descartarCliente`: ninguna póliza VIVA
     and not exists (select 1 from seguros.polizas p
                      where p.cliente_id = c.id and p.merged_into_poliza_id is null
                        and (p.import_ref is null or p.eiac_xml_hash is not null))
     -- y ningún rastro de actividad
     and not exists (select 1 from seguros.siniestros        x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.documentos        x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.historial_interno x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.portal_vinculo    x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.cotizaciones      x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.oportunidades     x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.gestiones         x where x.cliente_id = c.id)
     and not exists (select 1 from seguros.peticiones        x where x.cliente_id = c.id);

  select count(*) into v_n from _podar;
  if v_n > v_max then
    raise exception 'saldrian % fichas (tope %): el criterio ha cambiado, revisalo antes de aplicar', v_n, v_max;
  end if;

  -- La columna es `texto`, no `detalle` (el primer intento murió aquí con un
  -- 42703 y abortó el lote entero sin tocar una fila — un `insert` mal escrito
  -- dentro de un DO no lo caza ni tsc ni el build: solo ejecutarlo).
  insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
  select c.correduria_id, c.id, 'gestion',
         'Ficha DESCARTADA en lote ' || v_lote || ' · motivo: lead del volcado historico sin ningun canal '
         || 'de contacto (ni telefono, ni WhatsApp, ni email) y sin polizas vivas ni actividad. Autorizado '
         || 'por Alberto el 05/09/2026 (borrado suave: deja de salir en buscador y listas; se puede restaurar)'
    from seguros.clientes c join _podar p on p.id = c.id;

  update seguros.clientes c
     set activo = false, updated_at = now()
    from _podar p
   where p.id = c.id;

  raise notice 'lote %: % fichas descartadas', v_lote, v_n;
end $$;
