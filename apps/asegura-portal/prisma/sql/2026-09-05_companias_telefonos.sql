-- ✅ APLICADA el 05/09/2026 contra la Supabase compartida (schema `seguros`).
--
-- ── QUÉ ABRE, Y QUÉ DEJA A PROPÓSITO VACÍO ─────────────────────────────────
--
-- Alberto quiere una hoja imprimible («la del frigorífico») con los datos que
-- hacen falta después de un percance: compañía, nº de póliza, tomador, y **el
-- teléfono al que llamar**. Ese teléfono no existía en ninguna parte del
-- sistema: medido el 04/09/2026, el ÚNICO `telefono` de todo el schema que no
-- es de una persona es el de `corredurias`.
--
-- Esta migración crea el sitio donde vive. **No trae los números**, y eso es
-- deliberado: desde el contenedor de la sesión la política de red bloquea
-- `mapfre.es`, `allianz.es`, `occident.com` y `reale.es` (comprobado con las
-- cuatro), y lo único alcanzable son comparadores que **se contradicen entre
-- sí** — para Mapfre salen 918 366 240, 918 365 365 y 900 822 822 según quién
-- lo cuente. Un teléfono de siniestros equivocado impreso en un imán de nevera
-- es peor que no tener ninguno: alguien lo marca a las 3 de la mañana después
-- de un golpe. Los rellena una persona, contra la fuente, y el CHECK de abajo
-- la obliga a decir cuál.
--
-- La cartera viva tiene SOLO CUATRO compañías (medido 05/09/2026): Mapfre (64
-- pólizas), Allianz (26), Occident (19) y Reale (1). Las cuatro ya están en
-- esta tabla con su código DGS —C0058, C0109, C0468, C0613— y su
-- `nombre_comun` casa exacto con `polizas.aseguradora`, así que no hace falta
-- inventar ningún enlace nuevo.

SET search_path = seguros, public;

ALTER TABLE seguros.companias_dgs
  -- Para DAR PARTE. `NULL` = no lo hemos verificado, que NO es «esta compañía
  -- no tiene»: la hoja dice «pídenoslo» en vez de dejar un hueco.
  ADD COLUMN IF NOT EXISTS telefono_siniestros    text,
  -- Asistencia 24h / grúa. Es OTRO número y otra urgencia: a las 3 de la
  -- mañana en el arcén hace falta este, no el de tramitación. Se pintan por
  -- separado y no se colapsan nunca en uno.
  ADD COLUMN IF NOT EXISTS telefono_asistencia    text,
  -- De dónde salió: la URL de la propia compañía, o «documento de póliza».
  ADD COLUMN IF NOT EXISTS telefono_fuente        text,
  -- Cuándo se comprobó por última vez.
  ADD COLUMN IF NOT EXISTS telefono_verificado_en date;

DO $$
BEGIN
  -- 🦷 EL CEPO QUE IMPORTA: un número no entra sin decir de dónde salió y
  -- cuándo se comprobó. Sin esto, cualquiera pega mañana un número de un
  -- comparador y dentro de un año nadie puede volver a comprobarlo — y para
  -- entonces está impreso en la nevera de cuarenta familias.
  --
  -- Comprobado mordiendo, dentro de un ROLLBACK: el UPDATE con solo el número
  -- devuelve 23514, y el mismo UPDATE con fuente y fecha entra.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companias_dgs_telefono_con_fuente') THEN
    ALTER TABLE seguros.companias_dgs
      ADD CONSTRAINT companias_dgs_telefono_con_fuente
      CHECK (
        (telefono_siniestros IS NULL AND telefono_asistencia IS NULL)
        OR (telefono_fuente IS NOT NULL AND telefono_verificado_en IS NOT NULL)
      );
  END IF;

  -- La cadena vacía es el valor de cajón que se cuela por `IS NULL`, `??` y
  -- `COALESCE`: un `''` aquí se pintaría como un teléfono que no existe.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companias_dgs_telefono_no_vacio') THEN
    ALTER TABLE seguros.companias_dgs
      ADD CONSTRAINT companias_dgs_telefono_no_vacio
      CHECK (
        (telefono_siniestros IS NULL OR btrim(telefono_siniestros) <> '')
        AND (telefono_asistencia IS NULL OR btrim(telefono_asistencia) <> '')
        AND (telefono_fuente IS NULL OR btrim(telefono_fuente) <> '')
      );
  END IF;
END $$;

-- El portal del cliente lee estas columnas para pintar la hoja. `SELECT` POR
-- COLUMNAS, como el resto de la cartera: `notas` es de gestión interna y no
-- entra. (Recordatorio: en esta app el modelo Prisma es un ESPEJO de estos
-- grants — declarar una columna no concedida revienta la lectura ENTERA de la
-- tabla con `permission denied for column`, no solo esa columna.)
GRANT SELECT (codigo_dgs, nombre_comun, nombre_cima, en_cima, activa,
              telefono_siniestros, telefono_asistencia, telefono_fuente, telefono_verificado_en)
  ON seguros.companias_dgs TO prisma_asegura_portal;

COMMENT ON COLUMN seguros.companias_dgs.telefono_siniestros IS
  'Telefono de la COMPANIA para dar parte. NULL = no lo hemos verificado, y eso NO es lo mismo que "esta compania no tiene": la hoja imprimible tiene que decir "pidenoslo" en vez de dejar un hueco. Lo publica cada aseguradora en su web, pero los comparadores dan numeros distintos entre si, asi que solo entra lo comprobado contra la fuente que se anota en telefono_fuente.';

COMMENT ON COLUMN seguros.companias_dgs.telefono_asistencia IS
  'Asistencia 24h / grua. Es OTRO numero y otra urgencia que el de dar parte: a las 3 de la manana en el arcen hace falta este, no el de tramitacion. Se pintan los dos por separado y nunca se colapsan en uno.';

COMMENT ON COLUMN seguros.companias_dgs.telefono_fuente IS
  'De donde salio el numero: la URL de la propia compania, o "documento de poliza" si se leyo de una. Un numero sin fuente no se puede volver a comprobar dentro de un ano, y estos numeros van impresos en la nevera de un cliente. Lo obliga el CHECK companias_dgs_telefono_con_fuente (comprobado mordiendo: 23514).';

COMMENT ON COLUMN seguros.companias_dgs.telefono_verificado_en IS
  'Cuando se comprobo por ultima vez. Un telefono leido hace tres anos e impreso en un iman de nevera falla igual que uno equivocado, y en el mismo momento: cuando alguien lo marca despues de un golpe. La hoja imprimible lleva esta fecha para que se pueda decidir si reimprimirla.';

-- ── CÓMO SE RELLENA (lo hace una persona, no un scraper) ───────────────────
--
-- UPDATE seguros.companias_dgs
--    SET telefono_siniestros    = '...',
--        telefono_asistencia    = '...',
--        telefono_fuente        = 'https://www.<compania>.es/<pagina donde lo pone>',
--        telefono_verificado_en = current_date
--  WHERE codigo_dgs = 'C0058';   -- Mapfre. Allianz C0109 · Occident C0468 · Reale C0613
