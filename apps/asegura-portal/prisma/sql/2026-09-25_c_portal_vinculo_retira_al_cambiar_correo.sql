-- Un vínculo por correo NO sobrevive a que ese correo salga de la ficha (25/09/2026).
--
-- Caso fundacional: el correo de Pablo Guzmán Lozano estuvo escrito en la ficha de Pablo Guzmán
-- Pueyo, que es OTRA persona. Al entrar al portal se le vinculó a ella (`portal_vinculo`, origen
-- `email_hash`, nivel `gestionar`: prima, IBAN, DNI). Se corrigió el correo en el CRM y el vínculo
-- se quedó: los vínculos por correo solo se AÑADÍAN. Con una sesión de 30 días que lee
-- `portal_vinculo` en cada petición, arreglarlo solo en el login (`lib/vinculo.ts`) deja la ventana
-- abierta hasta que la persona vuelva a entrar. Esto la cierra en el momento del cambio, lo haga
-- quien lo haga: plataforma, el puerto de asegura o la ingesta de CIMA (que escribe desde otro repo).
--
-- Qué hace: cuando el hash de un correo EXISTENTE de una ficha cambia o se borra, se retiran los
-- vínculos `email_hash` de esa ficha. No se sabe cuál de las identidades entró con ESE correo (el
-- vínculo no guarda el hash), así que se retiran todos los de correo: quien sigue siendo el dueño
-- vuelve a quedar vinculado en su siguiente entrada (`vincularIdentidad`). Falla hacia CERRAR.
--   - NULL → valor (correo nuevo, backfill de hashes) no retira nada: no quita acceso a nadie.
--   - Los vínculos `manual` / `corredor` los puso una persona y no se tocan.
--   - Rotar `PII_LOOKUP_KEY` recalcula todos los hashes → todos los vínculos por correo caen y
--     cada cliente se revincula al entrar. Es el precio aceptado de fallar cerrado.
--
-- SECURITY DEFINER porque escriben `clientes`/`cliente_emails` roles (`prisma_seguros`,
-- `crm_seguros`) que no tienen DELETE sobre `portal_vinculo`, y no deben tenerlo.
--
-- APLICADA el 25/09/2026 (migración seguros_portal_vinculo_retira_al_cambiar_correo). Vista morder
-- antes en un bloque revertido sobre la ficha real: mismo hash → 1 vínculo; hash cambiado → 0; los
-- demás 12 vínculos intactos. Ampliado el mismo día al MOVER una fila de `cliente_emails` a otra
-- ficha (`cliente_id` cambia, el hash no), hallazgo de la revisión del PR #3600.
--
-- CORREGIDA el 26/09/2026: la rama de `cliente_emails` leía `OLD.cliente_id` también sobre
-- `clientes` y todo cambio de correo principal fallaba (Prisma: «The column `old` does not exist»).
-- La prueba del 25/09 se hizo sobre `cliente_emails`; la ruta de `clientes` nunca se ejecutó.

CREATE OR REPLACE FUNCTION seguros.portal_retirar_vinculos_email_de_ficha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seguros, pg_temp
AS $$
DECLARE
  ficha uuid;
BEGIN
  -- Cada tabla en su rama: PL/pgSQL resuelve TODOS los campos de una expresión aunque el `AND`
  -- ya sea falso, y `clientes` no tiene `cliente_id` → «record "old" has no field "cliente_id"»
  -- rompía CUALQUIER cambio de correo principal de una ficha (26/09/2026).
  IF TG_TABLE_NAME = 'clientes' THEN
    IF OLD.email_lookup_hash IS NULL OR OLD.email_lookup_hash IS NOT DISTINCT FROM NEW.email_lookup_hash THEN
      RETURN NEW;
    END IF;
    ficha := OLD.id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.email_lookup_hash IS NULL THEN RETURN OLD; END IF;
    ficha := OLD.cliente_id;
  ELSE
    -- cliente_emails UPDATE: el correo cambia de hash, o se MUDA de ficha sin cambiarlo
    -- (la ficha vieja lo pierde igual).
    IF OLD.email_lookup_hash IS NULL THEN RETURN NEW; END IF;
    IF OLD.cliente_id IS NOT DISTINCT FROM NEW.cliente_id
       AND OLD.email_lookup_hash IS NOT DISTINCT FROM NEW.email_lookup_hash THEN
      RETURN NEW;
    END IF;
    ficha := OLD.cliente_id;
  END IF;

  DELETE FROM seguros.portal_vinculo WHERE cliente_id = ficha AND origen = 'email_hash';

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION seguros.portal_retirar_vinculos_email_de_ficha() FROM PUBLIC;

DROP TRIGGER IF EXISTS portal_vinculo_retira_correo ON seguros.clientes;
CREATE TRIGGER portal_vinculo_retira_correo
  AFTER UPDATE OF email_lookup_hash ON seguros.clientes
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_retirar_vinculos_email_de_ficha();

DROP TRIGGER IF EXISTS portal_vinculo_retira_correo ON seguros.cliente_emails;
CREATE TRIGGER portal_vinculo_retira_correo
  AFTER UPDATE OF email_lookup_hash, cliente_id OR DELETE ON seguros.cliente_emails
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_retirar_vinculos_email_de_ficha();
