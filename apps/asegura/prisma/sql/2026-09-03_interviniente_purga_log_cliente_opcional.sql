-- `interviniente_purga_log.cliente_id` pasa a ser OPCIONAL.
--
-- El lote 6 la creó `not null` porque las 195 filas que purgó tenían todas su
-- `cliente_id`. Al abrir el borrado a mano desde plataforma
-- (`DELETE /api/operador/poliza/intervinientes`) aparece el caso que no cabía:
-- **un interviniente puede no estar enlazado a ninguna ficha**. Hoy son 6 filas,
-- todas de CIMA, que agrupan juntas y aparentan «una persona con 5 tomadores»
-- sin serlo.
--
-- La alternativa era rellenar el hueco con el `poliza_id` para que la columna
-- cupiera. Eso es exactamente lo que este repo llama «un no lo sé disfrazado de
-- valor»: una columna llamada `cliente_id` con el id de una póliza dentro pasa
-- todas las guardas de NULL y miente a quien la lea después. Mejor NULL, que se
-- ve. El `poliza_id` ya viaja dentro de `snapshot_before`, que es la fila entera.

alter table seguros.interviniente_purga_log
  alter column cliente_id drop not null;

comment on column seguros.interviniente_purga_log.cliente_id is
  'Ficha a la que afectaba la fila borrada. NULL = el interviniente no estaba enlazado a ninguna (no es «no se sabe»: es que no la tiene). El id de la póliza está en snapshot_before.';
