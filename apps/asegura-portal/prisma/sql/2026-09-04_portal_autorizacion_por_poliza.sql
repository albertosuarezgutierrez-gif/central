-- 🚨 NO SE HA EJECUTADO. Va en el mismo paso que su cambio de `schema.prisma`.
--
-- ── QUÉ ABRE ────────────────────────────────────────────────────────────────
--
-- Hasta aquí una autorización se concedía sobre la FICHA: «deja que María vea
-- MIS SEGUROS». Todos. El caso que eso no cubre es el normal en empresa, dicho
-- por Alberto: el dueño quiere que su empleado vea la póliza de la nave y NO la
-- de su coche. Medido hoy sobre la cartera viva: 110 pólizas y 80 titulares,
-- de los cuales **15 tienen más de una**. Esos 15 son justo los que lo piden.
--
-- `poliza_id` NULL = todas las del otorgante (lo de siempre). Con valor = solo
-- esa. Es un ensanche del vocabulario, no un cambio de significado: las filas
-- que ya existen siguen queriendo decir exactamente lo mismo.

SET search_path = seguros, public;

-- Necesario para la clave compuesta de abajo. `id` ya es PK, así que este
-- índice es trivialmente único: no cambia ningún dato, solo permite referenciar
-- el par (dueño, póliza) desde otra tabla.
CREATE UNIQUE INDEX IF NOT EXISTS idx_polizas_cliente_id_id
  ON seguros.polizas (cliente_id, id);

ALTER TABLE seguros.portal_autorizacion
  ADD COLUMN IF NOT EXISTS poliza_id uuid;

DO $$
BEGIN
  -- 🚨 LA CLAVE COMPUESTA, QUE ES EL CEPO QUE DE VERDAD IMPORTA.
  --
  -- Una FK normal a `polizas(id)` dejaría conceder CUALQUIER póliza de la
  -- cartera, incluida la de otra persona: bastaría un id equivocado —o
  -- manipulado— en la petición para que José «autorizara» la póliza de un
  -- desconocido, y la fila quedaría perfectamente válida. Con la clave
  -- compuesta, la BD exige que la póliza sea DEL OTORGANTE. No es una
  -- comprobación que el código pueda olvidarse de hacer.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_autorizacion_poliza_del_otorgante') THEN
    ALTER TABLE seguros.portal_autorizacion
      ADD CONSTRAINT portal_autorizacion_poliza_del_otorgante
      FOREIGN KEY (otorgante_cliente_id, poliza_id)
      REFERENCES seguros.polizas (cliente_id, id);
  END IF;
END $$;

-- ── 🚨 EL ÍNDICE ÚNICO, OTRA VEZ, Y POR LA MISMA RAZÓN ─────────────────────
--
-- Ya van DOS columnas nullable dentro de la clave de «autorización viva»
-- (`autorizado_identidad_id` de la migración anterior y ahora `poliza_id`), y
-- en Postgres **dos NULL nunca son iguales**: sin tratarlos, José podría acumular
-- autorizaciones vivas idénticas de «todas mis pólizas» para la misma persona,
-- y su pantalla las pintaría todas. `COALESCE` a un UUID centinela las vuelve
-- comparables. Se reemplazan los dos índices anteriores porque la clave cambió.
DROP INDEX IF EXISTS seguros.idx_portal_autorizacion_viva;
DROP INDEX IF EXISTS seguros.idx_portal_autorizacion_viva_identidad;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_autorizacion_viva_ficha
  ON seguros.portal_autorizacion (
    otorgante_cliente_id,
    autorizado_cliente_id,
    COALESCE(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid),
    alcance
  )
  WHERE revocado_en IS NULL AND autorizado_cliente_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_autorizacion_viva_identidad
  ON seguros.portal_autorizacion (
    otorgante_cliente_id,
    autorizado_identidad_id,
    COALESCE(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid),
    alcance
  )
  WHERE revocado_en IS NULL AND autorizado_identidad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_autorizacion_poliza
  ON seguros.portal_autorizacion (poliza_id) WHERE poliza_id IS NOT NULL;

COMMENT ON COLUMN seguros.portal_autorizacion.poliza_id IS
  'La UNICA poliza que abre esta autorizacion. NULL = todas las del otorgante, que es lo que significaban todas las filas anteriores a esta columna. Existe porque el dueno de una empresa quiere que su empleado vea la poliza de la nave y no la de su coche: medido el 04/09/2026, 15 de los 80 titulares de la cartera viva tienen mas de una poliza. La FK es COMPUESTA con otorgante_cliente_id contra polizas(cliente_id, id): la BD exige que la poliza sea DEL OTORGANTE, asi que un id equivocado o manipulado no puede colar la poliza de un tercero.
🚨 DOS TRAMPAS QUE NO PUEDE VIGILAR LA BD, dichas aqui para que no se supongan cubiertas:
1) NULL cubre las pólizas FUTURAS. Quien concede hoy todas sus polizas esta concediendo tambien la que contrate manana. Para un empleado suele ser lo que se quiere; para un familiar puede que no. La pantalla tiene que decirlo con esas palabras al conceder.
2) Una poliza FUSIONADA deja la autorizacion apuntando a una fila muerta (hay 5 fusionadas hoy, no es teorico) y el autorizado pierde el acceso SIN QUE NADIE SE ENTERE: no falla, deja de funcionar. La lectura tiene que seguir merged_into_poliza_id o decir en voz alta que esa poliza ya no es la misma.';
