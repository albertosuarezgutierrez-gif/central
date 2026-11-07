-- SEMILLA F1: alta en «Mi empresa» de Talleres de Automoción G2 (B88936158) y Global2 Instalaciones Técnicas (B05457247).
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` DESPUÉS de 0001 y 0002. Idempotente (las funciones op_* lo son).
--
-- 🚨 Ningún correo, nombre ni NIF de persona va escrito aquí: todo sale por SUBCONSULTA de lo que ya hay en BD
--    (contabilidad.empresas, rrhh.empresas, rrhh.empleados, rrhh.usuarios_rrhh). Si una subconsulta no encuentra
--    EXACTAMENTE una fila, ese paso se SALTA con un NOTICE (nunca se adivina): se completa en plataforma → /operador/empresas.
-- Roles (decisión de Alberto, 07/11/2026):
--   · Manuel Antonio Piña Franco → DUEÑO (firma) de las dos.
--   · Francisco Javier Velasco Carrera (socio) → CONSULTA de las dos (ve todo; no firma ni da accesos).
--   · Pilar (usuarios_rrhh 4affe1ad-899f-4949-a8bb-ec8ac8030269) → ADMINISTRACIÓN de las dos, en TODAS las herramientas
--     contratadas (opera, no firma). Ningún rol se deduce de apellidos: cada uno es decisión declarada de Alberto.
-- Lo que NO se rellena aquí, a propósito: domicilio social (no está en BD con CP/municipio validados) y título del firmante
-- (administrador/apoderado: es un hecho jurídico que confirma Alberto). Sin ellos la emisión dice «Falta: …» y no envía nada.
-- Tampoco se ENVÍA nada: el contrato sale solo con el clic del operador.

BEGIN;
DO $$
DECLARE
  v_actor constant text := 'semilla F1 (Alberto, 07/11/2026)';
  e record;
  v_cuenta uuid;
  v_conta uuid;
  v_rrhh uuid;
  v_n int;
  v_email text; v_nombre text; v_dni text;
BEGIN
  FOR e IN SELECT * FROM (VALUES ('B88936158'), ('B05457247')) AS t(cif) LOOP
    -- Empresa: razón social desde contabilidad (ya dada de alta el 07/11).
    SELECT count(*) INTO v_n FROM contabilidad.empresas WHERE nif = e.cif;
    IF v_n <> 1 THEN RAISE NOTICE '% no está (o está repetida) en contabilidad.empresas: se salta', e.cif; CONTINUE; END IF;
    SELECT id INTO v_conta FROM contabilidad.empresas WHERE nif = e.cif;
    SELECT o_id INTO v_cuenta FROM herramientas.op_alta_cuenta(
      e.cif, (SELECT razon_social FROM contabilidad.empresas WHERE id = v_conta),
      NULL, NULL, NULL, NULL, NULL, NULL,
      (SELECT lower(color_primario) FROM contabilidad.empresas WHERE id = v_conta AND color_primario ~* '^#[0-9a-f]{6}$'),
      (SELECT logo_url FROM contabilidad.empresas WHERE id = v_conta AND logo_url ~ '^https://'), v_actor);

    -- ref_externa: contabilidad por NIF; rrhh por NIF o, si no lo tiene, por su vínculo con la empresa contable.
    PERFORM herramientas.op_fijar_ref(v_cuenta, 'contabilidad', v_conta, v_actor);
    SELECT count(*) INTO v_n FROM rrhh.empresas WHERE upper(replace(nif, ' ', '')) = e.cif OR contabilidad_empresa_id = v_conta;
    IF v_n = 1 THEN
      SELECT id INTO v_rrhh FROM rrhh.empresas WHERE upper(replace(nif, ' ', '')) = e.cif OR contabilidad_empresa_id = v_conta;
      PERFORM herramientas.op_fijar_ref(v_cuenta, 'rrhh', v_rrhh, v_actor);
      PERFORM herramientas.op_fijar_ref(v_cuenta, 'nominas', v_rrhh, v_actor);
    ELSE
      RAISE NOTICE '%: % empresas de rrhh candidatas: ref de rrhh/nóminas sin fijar', e.cif, v_n; v_rrhh := NULL;
    END IF;

    -- Dueño: Manuel, desde la ficha de empleado (de cualquiera de las dos empresas). Un correo DISTINTO = no se adivina.
    SELECT count(DISTINCT lower(btrim(em.email))) INTO v_n FROM rrhh.empleados em
     WHERE em.email IS NOT NULL AND lower(em.nombre || ' ' || coalesce(em.apellidos, '')) LIKE '%manuel antonio%pi_a franco%';
    IF v_n = 1 THEN
      SELECT lower(btrim(em.email)), btrim(em.nombre || ' ' || coalesce(em.apellidos, '')),
             CASE WHEN upper(replace(em.dni, ' ', '')) ~ '^([XYZ]|[0-9])[0-9]{7}[A-Z]$' THEN upper(replace(em.dni, ' ', '')) END
        INTO v_email, v_nombre, v_dni
        FROM rrhh.empleados em
       WHERE em.email IS NOT NULL AND lower(em.nombre || ' ' || coalesce(em.apellidos, '')) LIKE '%manuel antonio%pi_a franco%'
       ORDER BY (em.dni IS NOT NULL) DESC LIMIT 1;
      PERFORM herramientas.op_fijar_origen(v_cuenta, herramientas.op_fijar_dueno(v_cuenta, v_email, v_nombre, v_dni, NULL, v_actor),
                                           '{"fuente":"semilla","decision":"Alberto 07/11/2026"}'::jsonb, v_actor);
    ELSE
      RAISE NOTICE '%: % correos candidatos para Manuel: dueño sin fijar', e.cif, v_n;
    END IF;

    -- Consulta: Francisco Javier (socio).
    SELECT count(DISTINCT lower(btrim(em.email))) INTO v_n FROM rrhh.empleados em
     WHERE em.email IS NOT NULL AND lower(em.nombre || ' ' || coalesce(em.apellidos, '')) LIKE '%francisco javier%velasco carrera%';
    IF v_n = 1 THEN
      SELECT lower(btrim(em.email)), btrim(em.nombre || ' ' || coalesce(em.apellidos, '')) INTO v_email, v_nombre
        FROM rrhh.empleados em
       WHERE em.email IS NOT NULL AND lower(em.nombre || ' ' || coalesce(em.apellidos, '')) LIKE '%francisco javier%velasco carrera%' LIMIT 1;
      PERFORM herramientas.op_fijar_origen(v_cuenta, herramientas.op_dar_acceso(v_cuenta, v_email, v_nombre, 'consulta', ARRAY[]::text[], v_actor),
                                           '{"fuente":"semilla","decision":"Alberto 07/11/2026"}'::jsonb, v_actor);
    ELSE
      RAISE NOTICE '%: % correos candidatos para Francisco Javier: consulta sin fijar', e.cif, v_n;
    END IF;

    -- Administración: Pilar (usuario de rrhh). Sus herramientas se le CONCEDEN tras la emisión (solo se concede lo contratado).
    SELECT lower(btrim(u.email)), btrim(u.nombre) INTO v_email, v_nombre FROM rrhh.usuarios_rrhh u WHERE u.id = '4affe1ad-899f-4949-a8bb-ec8ac8030269';
    IF v_email IS NOT NULL THEN
      -- TODA la administración de las dos (contabilidad, RRHH, nóminas, documentación): se le concede todo lo que tenga ref.
      -- La concesión exige herramienta contratada: si aún no hay contrato emitido, se le concede al re-ejecutar tras emitir.
      PERFORM herramientas.op_fijar_origen(v_cuenta, herramientas.op_dar_acceso(v_cuenta, v_email, v_nombre, 'admin',
                coalesce((SELECT array_agg(herramienta) FROM herramientas.cuenta_herramienta
                           WHERE cuenta_id = v_cuenta AND estado IN ('activa', 'pendiente_firma')), ARRAY[]::text[]), v_actor),
                '{"fuente":"semilla","decision":"Alberto 07/11/2026: Pilar lleva toda la administración"}'::jsonb, v_actor);
    ELSE
      RAISE NOTICE '%: Pilar no está en rrhh.usuarios_rrhh: administración sin fijar', e.cif;
    END IF;
  END LOOP;
END $$;
COMMIT;

-- Comprobación (sin imprimir correos):
-- SELECT c.cif, m.rol, count(*) FROM herramientas.cuenta c JOIN herramientas.cuenta_miembro m ON m.cuenta_id = c.id
--  WHERE m.estado = 'activo' GROUP BY 1, 2 ORDER BY 1, 2;      → por CIF: dueno 1 · consulta 1 · admin 1
-- SELECT c.cif, ch.herramienta, ch.ref_externa IS NOT NULL AS con_ref FROM herramientas.cuenta c
--   JOIN herramientas.cuenta_herramienta ch ON ch.cuenta_id = c.id ORDER BY 1, 2;
