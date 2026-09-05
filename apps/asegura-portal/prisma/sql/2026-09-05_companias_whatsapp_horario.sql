-- ✅ APLICADA el 05/09/2026 contra la Supabase compartida (schema `seguros`).
--
-- 🦷 Los dos cepos nuevos se vieron MORDER, dentro de un ROLLBACK:
--   · `+34 917 83 83 83` (formato de lectura) → 23514 `companias_dgs_whatsapp_e164`
--   · un WhatsApp sin fuente ni fecha        → 23514 `companias_dgs_telefono_con_fuente`
--   (la primera mordida de este segundo cepo NO disparó, y no era un fallo del
--    cepo: se probó sobre C0468, que YA tenía `telefono_fuente`. Se repitió
--    sobre C0517, que estaba entero a NULL, y ahí saltó. Un cepo probado sobre
--    la fila equivocada se declara bueno sin haberlo sido.)
--
-- El canal de WhatsApp de la compañía para dar parte, y su HORARIO.
--
-- Lo trae Alberto el 05/09/2026 con una captura del perfil verificado:
-- «catalana tiene whassap para apertura siniestros!!».
--
-- ── 🚨 POR QUÉ NO ENTRA EN `telefono_siniestros` ───────────────────────────
--
-- Porque no es lo mismo y el modo de fallo es caro. `telefono_siniestros` es
-- un número que alguien MARCA; esto es un canal de mensajería. Meterlo ahí
-- haría que la hoja del frigorífico dijera «llama a este número» de una línea
-- que puede no atender voz, y el que lo descubre es quien acaba de tener un
-- golpe. Que un fijo de Madrid publicado como WhatsApp Business atienda además
-- llamadas es MUY PROBABLE — y «muy probable» es justo lo que este repo no
-- escribe en un campo que se imprime en una nevera. `telefono_siniestros` se
-- queda a NULL hasta que una persona confirme la línea de voz.
--
-- ── 🚨 Y POR QUÉ HACE FALTA `horario_siniestros` ───────────────────────────
--
-- El perfil dice **«de 9h a 21h de lunes a viernes»**. Un canal de siniestros
-- que no contesta de noche ni en fin de semana pintado sin horario se lee como
-- «siempre», que es exactamente la promesa que rompe un sábado por la noche.
-- Y explica por qué este canal NO puede ir a `telefono_asistencia`: esa columna
-- es la grúa 24h, y son cosas distintas aunque el perfil las nombre juntas.
-- Eso la BD no lo puede vigilar (es una columna con un texto libre en otra):
-- lo dice aquí en voz alta para que no se suponga cubierto.

SET search_path = seguros, public;

ALTER TABLE seguros.companias_dgs
  -- En E.164 (`+34917838383`), no en formato de lectura. El enlace `wa.me/`
  -- se construye quitando lo que no sea dígito, y una cadena con espacios,
  -- paréntesis o un «(de 9 a 21)» pegado detrás produce un enlace roto que no
  -- falla: abre WhatsApp con un número que no existe. Lo obliga el CHECK.
  ADD COLUMN IF NOT EXISTS whatsapp_siniestros text,
  -- Texto tal y como lo publica la compañía. NULL = no lo sabemos, y entonces
  -- la hoja NO dice «24h»: dice que no consta.
  ADD COLUMN IF NOT EXISTS horario_siniestros  text;

DO $$
BEGIN
  -- Se rehace el cepo de la fuente para que cubra también el WhatsApp: sin
  -- esto, un canal nuevo entraba sin decir de dónde salió — que es el agujero
  -- que el CHECK original venía a tapar para los teléfonos.
  ALTER TABLE seguros.companias_dgs
    DROP CONSTRAINT IF EXISTS companias_dgs_telefono_con_fuente;
  ALTER TABLE seguros.companias_dgs
    ADD CONSTRAINT companias_dgs_telefono_con_fuente
    CHECK (
      (telefono_siniestros IS NULL AND telefono_asistencia IS NULL AND whatsapp_siniestros IS NULL)
      OR (telefono_fuente IS NOT NULL AND telefono_verificado_en IS NOT NULL)
    );

  ALTER TABLE seguros.companias_dgs
    DROP CONSTRAINT IF EXISTS companias_dgs_telefono_no_vacio;
  ALTER TABLE seguros.companias_dgs
    ADD CONSTRAINT companias_dgs_telefono_no_vacio
    CHECK (
      (telefono_siniestros IS NULL OR btrim(telefono_siniestros) <> '')
      AND (telefono_asistencia IS NULL OR btrim(telefono_asistencia) <> '')
      AND (telefono_fuente     IS NULL OR btrim(telefono_fuente)     <> '')
      AND (horario_siniestros  IS NULL OR btrim(horario_siniestros)  <> '')
    );

  -- 🦷 La forma del WhatsApp, que es el cepo que de verdad importa aquí: `+`
  -- y de 8 a 15 dígitos, nada más. Sin él, el primero que pegue el número «tal
  -- y como se ve» deja un `wa.me` roto que nadie prueba hasta que hace falta.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companias_dgs_whatsapp_e164') THEN
    ALTER TABLE seguros.companias_dgs
      ADD CONSTRAINT companias_dgs_whatsapp_e164
      CHECK (whatsapp_siniestros IS NULL OR whatsapp_siniestros ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
END $$;

GRANT SELECT (whatsapp_siniestros, horario_siniestros)
  ON seguros.companias_dgs TO prisma_asegura_portal;

COMMENT ON COLUMN seguros.companias_dgs.whatsapp_siniestros IS
  'Canal de WhatsApp de la compania para dar parte, en E.164 (+34917838383). NO es telefono_siniestros: aquel es un numero que se MARCA y este un canal de mensajeria; que un fijo publicado como WhatsApp Business atienda ademas voz es probable, y "probable" no se imprime en la hoja del frigorifico. El enlace wa.me se construye quitando lo que no sea digito, por eso el CHECK companias_dgs_whatsapp_e164 exige la forma canonica: una cadena con espacios produce un enlace que no falla, simplemente abre un numero que no existe.';

COMMENT ON COLUMN seguros.companias_dgs.horario_siniestros IS
  'Horario que publica la compania para ese canal, tal cual. NULL = no lo sabemos, y entonces la hoja NO dice "24h": dice que no consta. Existe porque el canal de Occident atiende de 9h a 21h de lunes a viernes, y un canal de siniestros pintado sin horario se lee como "siempre" — que es la promesa que se rompe un sabado por la noche. Es tambien lo que separa este canal de telefono_asistencia, que es la grua 24h.';

-- ── Y una columna que SE QUITA del alcance del portal ──────────────────────
--
-- `telefono_fuente` dejó de ser una nota neutra el 05/09/2026: hoy guarda la
-- duda de atribución de Occident («el perfil de WhatsApp se llama Plus Ultra,
-- que es C0517…»), lo que falta por preguntarle a la compañía, y por qué NO se
-- pone ahí el 900 de Defensa del Cliente. Eso es gestión del corredor, y la
-- regla de visibilidad del portal (03/09/2026) dice que la gestión no llega al
-- cliente: se oculta lo que no le cambia ninguna decisión.
--
-- Se revoca en vez de confiar en que nadie la declare: una columna concedida y
-- sin usar es exactamente la que alguien acaba pintando dentro de tres meses.
-- El modelo Prisma del portal NO la declara (declarar una columna no concedida
-- revienta la lectura ENTERA de la tabla, no solo esa columna).
REVOKE SELECT (telefono_fuente) ON seguros.companias_dgs FROM prisma_asegura_portal;

-- Estado tras aplicar, medido: el rol ve 10 columnas —
--   activa, codigo_dgs, en_cima, horario_siniestros, nombre_cima, nombre_comun,
--   telefono_asistencia, telefono_siniestros, telefono_verificado_en, whatsapp_siniestros
-- y NO ve `notas` ni `telefono_fuente`.
--
-- ── LA FILA QUE ENTRA (Occident, C0468) ────────────────────────────────────
--
-- La trae Alberto con una captura del perfil: «catalana tiene whassap para
-- apertura siniestros!!». Tapa el hueco que este mismo repo tenía anotado el
-- 05/09/2026 en el `telefono_fuente` de C0468: buscado en occident.com, no
-- había número de siniestros. Ahora hay canal — de mensajería, y con horario.
--
--   whatsapp_siniestros = '+34917838383'
--   horario_siniestros  = '9h a 21h, de lunes a viernes'
--   telefono_siniestros = NULL   ← a propósito: la línea de VOZ no está comprobada
