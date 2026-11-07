-- 0004 — Correcciones de la revisión del PR #5616 (idempotente; NO edita 0001..0003, que ya están aplicadas).
--   1) _conceder: re-conceder a un miembro existente deja EXACTAMENTE las herramientas indicadas (antes solo añadía).
--   2) registrar_traspaso: el rol «consulta» no abre apps (coherente con estados.ts y roles.ts MAPEO_POR_DEFECTO → null):
--      mismo error que «sin acceso».
-- Mismo owner / SECURITY DEFINER / search_path / GRANTs que en 0001 (CREATE OR REPLACE conserva owner y ACL; se repiten
-- REVOKE/GRANT para que el fichero sea autosuficiente).
BEGIN;

CREATE OR REPLACE FUNCTION herramientas._conceder(p_cuenta uuid, p_email text, p_nombre text, p_rol text, p_herramientas text[], p_actor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_persona uuid; v_rol text; h text;
BEGIN
  IF p_rol NOT IN ('admin', 'consulta', 'empleado') THEN RAISE EXCEPTION 'rol_invalido' USING ERRCODE = 'check_violation'; END IF;
  v_persona := herramientas._persona(p_email, p_nombre);
  SELECT rol INTO v_rol FROM herramientas.cuenta_miembro WHERE cuenta_id = p_cuenta AND persona_id = v_persona;
  IF v_rol = 'dueno' THEN RAISE EXCEPTION 'es_el_dueno' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO herramientas.cuenta_miembro (cuenta_id, persona_id, rol, estado, alta_por)
    VALUES (p_cuenta, v_persona, p_rol, 'activo', p_actor)
    ON CONFLICT (cuenta_id, persona_id) DO UPDATE SET rol = EXCLUDED.rol, estado = 'activo', revocado_en = NULL;
  FOREACH h IN ARRAY coalesce(p_herramientas, ARRAY[]::text[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM herramientas.cuenta_herramienta WHERE cuenta_id = p_cuenta AND herramienta = h
                     AND estado IN ('activa', 'pendiente_firma')) THEN
      RAISE EXCEPTION 'herramienta_no_contratada: %', h USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO herramientas.miembro_herramienta (cuenta_id, persona_id, herramienta, concedido_por)
      VALUES (p_cuenta, v_persona, h, p_actor) ON CONFLICT DO NOTHING;
  END LOOP;
  -- Quedan EXACTAMENTE las seleccionadas: lo que tenía este miembro en esta empresa y no está en la lista nueva se borra.
  DELETE FROM herramientas.miembro_herramienta
   WHERE cuenta_id = p_cuenta AND persona_id = v_persona
     AND herramienta <> ALL (coalesce(p_herramientas, ARRAY[]::text[]));
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'acceso_concedido', jsonb_build_object('persona', v_persona, 'rol', p_rol, 'herramientas', p_herramientas));
  RETURN v_persona;
END $$;

CREATE OR REPLACE FUNCTION herramientas.registrar_traspaso(p_cuenta uuid, p_herramienta text, p_jti uuid, p_aud text, p_exp timestamptz)
RETURNS TABLE (o_ref uuid, o_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE
  v_persona uuid := herramientas.persona_actual();
  v_rol text := herramientas.rol_en(p_cuenta);
  v_ref uuid;
BEGIN
  -- El empleado no salta desde aquí (entra en cada app con su acceso de empleado) y consulta VE el panel pero no abre apps.
  IF v_rol IS NULL OR v_rol IN ('empleado', 'consulta') THEN RAISE EXCEPTION 'sin_acceso' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT ch.ref_externa INTO v_ref FROM herramientas.cuenta_herramienta ch
   WHERE ch.cuenta_id = p_cuenta AND ch.herramienta = p_herramienta AND ch.estado = 'activa' AND ch.ref_externa IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'herramienta_no_activa' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF v_rol = 'admin' AND NOT EXISTS (SELECT 1 FROM herramientas.miembro_herramienta mh
       WHERE mh.cuenta_id = p_cuenta AND mh.persona_id = v_persona AND mh.herramienta = p_herramienta) THEN
    RAISE EXCEPTION 'sin_acceso_a_la_herramienta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO herramientas.traspaso_emitido (jti, persona_id, cuenta_id, aud, herramienta, exp)
    VALUES (p_jti, v_persona, p_cuenta, p_aud, p_herramienta, p_exp);
  RETURN QUERY SELECT v_ref, p.email FROM herramientas.persona p WHERE p.id = v_persona;
END $$;

REVOKE ALL ON FUNCTION herramientas._conceder(uuid, text, text, text, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION herramientas.registrar_traspaso(uuid, text, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION herramientas.registrar_traspaso(uuid, text, uuid, text, timestamptz) TO prisma_herramientas;

COMMIT;
