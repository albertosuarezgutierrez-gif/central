-- «Contactos» (08/09/2026): la invitación lleva NOMBRE y RELACIÓN, y puede NO
-- abrir nada.
--
-- Las reglas están en `packages/module-seguros-portal/src/invitacion.ts`
-- (apartado «Contactos»); léelo antes de tocar nada de aquí.
--
-- Alberto: «poner nombre, tipo relación y mail y se le manda un mail de
-- presentación a esa persona». Hasta hoy la fila solo tenía el correo (hasheado)
-- y José reconocía cada invitación por su fecha. Con el nombre y la relación su
-- lista pasa a ser lo que pidió: sus contactos.
--
-- ── 🚨 `alcance = 'ninguno'`: «recomiéndanos» sin compartir un solo seguro ────
--
-- Presentar el portal a alguien SIN abrirle nada es la forma legalmente
-- defendible de captar (acto entre personas, no comunicación comercial de la
-- correduría — art. 21 LSSI). Al aceptar NO se crea `portal_autorizacion`: no
-- hay nada que autorizar. Por eso el CHECK del sello se afloja SOLO para ese
-- alcance, y otro CHECK impide que una de esas lleve autorización jamás.

SET search_path = seguros, public;

ALTER TABLE seguros.portal_invitacion
  ADD COLUMN IF NOT EXISTS invitado_nombre text,
  ADD COLUMN IF NOT EXISTS relacion text;

-- El nombre lo escribe José y acaba en el saludo del correo: sin saltos de línea
-- y con tope. NULL = no consta (las filas anteriores a hoy); nunca ''.
ALTER TABLE seguros.portal_invitacion
  DROP CONSTRAINT IF EXISTS portal_invitacion_invitado_nombre_corto;
ALTER TABLE seguros.portal_invitacion
  ADD CONSTRAINT portal_invitacion_invitado_nombre_corto
  CHECK (invitado_nombre IS NULL OR (length(invitado_nombre) BETWEEN 1 AND 120 AND invitado_nombre !~ '[\r\n]'));

-- 🚨 MISMO vocabulario que `cliente_relaciones.tipo_relacion` (`TIPOS_RELACION`
-- de `@central/module-seguros`), para que la relación se copie tal cual el día
-- que el invitado tenga ficha. Lo vigila `test/regression-portal-contactos.test.ts`:
-- si esta lista y la de TypeScript divergen, el formulario ofrecería un valor que
-- la BD rechaza y el envío moriría con un 23514 después de escribir el correo.
ALTER TABLE seguros.portal_invitacion
  DROP CONSTRAINT IF EXISTS portal_invitacion_relacion_vocabulario;
ALTER TABLE seguros.portal_invitacion
  ADD CONSTRAINT portal_invitacion_relacion_vocabulario
  CHECK (relacion IS NULL OR relacion IN (
    'Cónyuge/Pareja de Hecho', 'Hijo/a', 'Padre/Madre', 'Hermano/a', 'Suegro/a', 'Nuero/a',
    'Cuñado/a', 'Tio/a', 'Sobrino/a', 'Novio/a', 'Amigo/a', 'Empresa', 'Empleado/a', 'Socio/a',
    'Accionista', 'Administración', 'Dueño', 'Otra', 'Sin vínculo'
  ));

-- El alcance admite «nada».
ALTER TABLE seguros.portal_invitacion
  DROP CONSTRAINT IF EXISTS portal_invitacion_alcance;
ALTER TABLE seguros.portal_invitacion
  ADD CONSTRAINT portal_invitacion_alcance
  CHECK (alcance IN ('ver', 'ver_economico', 'ninguno'));

-- Una invitación sin acceso no comparte una póliza concreta: no hay nada que acotar.
ALTER TABLE seguros.portal_invitacion
  DROP CONSTRAINT IF EXISTS portal_invitacion_sin_compartir_sin_poliza;
ALTER TABLE seguros.portal_invitacion
  ADD CONSTRAINT portal_invitacion_sin_compartir_sin_poliza
  CHECK (alcance <> 'ninguno' OR poliza_id IS NULL);

-- El sello de la aceptación: con acceso exige la autorización (como hasta hoy);
-- sin acceso exige que NO la haya. Las dos ramas siguen exigiendo QUIÉN aceptó.
ALTER TABLE seguros.portal_invitacion
  DROP CONSTRAINT IF EXISTS portal_invitacion_acepta_con_sello;
ALTER TABLE seguros.portal_invitacion
  ADD CONSTRAINT portal_invitacion_acepta_con_sello
  CHECK (
    (aceptada_en IS NULL AND aceptada_por_identidad_id IS NULL AND autorizacion_id IS NULL)
    OR (aceptada_en IS NOT NULL AND aceptada_por_identidad_id IS NOT NULL
        AND ((alcance <> 'ninguno' AND autorizacion_id IS NOT NULL)
          OR (alcance = 'ninguno' AND autorizacion_id IS NULL)))
  );

COMMENT ON COLUMN seguros.portal_invitacion.invitado_nombre IS
  'Nombre del invitado tal y como lo escribio quien invita. Es para SU lista (reconocer a quien invito) y para el saludo del correo; no es una identidad: quien es de verdad lo prueba el codigo al correo.';
COMMENT ON COLUMN seguros.portal_invitacion.relacion IS
  'Que es el invitado de quien invita, con el vocabulario de cliente_relaciones.tipo_relacion. NUNCA va en el correo (es un dato de la relacion entre dos personas y quien abre el buzon puede no ser ninguna de las dos).';
