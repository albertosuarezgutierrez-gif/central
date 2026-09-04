-- Adjuntos de un PARTE DE SINIESTRO del portal (03/09/2026).
--
-- No hay tabla nueva: se reutiliza `seguros.documentos` (la de siempre, con
-- `contenido bytea`, `sha256`, `estado` y `visible_por_cliente`) y se le añade
-- de qué parte cuelga. Una tabla `portal_parte_adjunto` aparte habría dejado a
-- Alberto con dos bandejas de documentos y ningún sitio donde verlos juntos.
--
-- 🚫 Sin DELETE para el rol del portal, y es deliberado: un adjunto de un parte
-- es prueba de lo que se declaró. Quien lo mandó no lo retira solo — igual que
-- el propio parte, que el portal solo INSERTA y LEE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1 — YA APLICADO por Alberto el 03/09/2026 (aquí queda por escrito).
-- Idempotente: se puede volver a lanzar sin efecto.
-- ─────────────────────────────────────────────────────────────────────────────

alter table seguros.documentos
  add column if not exists portal_parte_id uuid
    references seguros.portal_parte_siniestro(id) on delete set null;

create index if not exists documentos_portal_parte_idx
  on seguros.documentos (portal_parte_id)
  where portal_parte_id is not null;

-- El rol del portal: leer y escribir, nada más. `prisma_seguros` (el corredor)
-- ya tenía los cuatro verbos sobre esta tabla desde el 02/09/2026.
grant select, insert on seguros.documentos to prisma_asegura_portal;

comment on column seguros.documentos.portal_parte_id is
  'Parte de siniestro del portal del que cuelga este documento (lo sube el cliente). ON DELETE SET NULL: el fichero sobrevive al parte, porque es la prueba.';

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2 — ✅ APLICADO el 03/09/2026 a la Supabase compartida (verificado leyendo
-- `pg_get_constraintdef`). Sin esto NO se puede insertar un adjunto.
--
-- El CHECK original exige que el documento cuelgue de un cliente, una póliza o
-- un siniestro. Un adjunto de un parte puede no tener NINGUNO de los tres: el
-- portal está abierto a quien no es cliente (los ~32.520 leads), y esa persona
-- puede dar parte de una póliza que aportó ella misma. Su foto del golpe no
-- tiene ficha, ni póliza de la cartera, ni siniestro — y hoy el INSERT muere
-- con `new row ... violates check constraint "documentos_colgado_de_algo"`.
--
-- Verificado el 03/09/2026 contra la BD real dentro de un BEGIN … ROLLBACK: con
-- el CHECK actual el INSERT falla, y con este relajado entra. Un CHECK que nadie
-- ha visto morder es una suposición.
--
-- Se AMPLÍA, no se quita: un documento sigue teniendo que colgar de algo. Lo
-- que se añade es un cuarto sitio del que colgar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table seguros.documentos drop constraint if exists documentos_colgado_de_algo;
alter table seguros.documentos add constraint documentos_colgado_de_algo check (
  cliente_id is not null
  or poliza_id is not null
  or siniestro_id is not null
  or portal_parte_id is not null
);
