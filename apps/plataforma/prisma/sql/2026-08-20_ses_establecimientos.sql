-- ────────────────────────────────────────────────────────────────────────────
-- SES.HOSPEDAJES: credenciales del servicio web, UNA FILA POR PISO (20/08/2026)
--
-- Cada establecimiento tiene su propio `codigoEstablecimiento` Y sus propias
-- credenciales de servicio web. Por eso esto NO puede vivir en variables de
-- entorno de Vercel: serían 12 variables para cuatro pisos, y dar de alta uno
-- nuevo o rotar una contraseña exigiría tocar la configuración del proyecto y
-- redesplegar. Las env vars son para lo que hay uno solo.
--
-- 🔐 La contraseña se guarda CIFRADA (AES-256-GCM, `lib/ses/cifrado.ts`) con la
-- clave `SES_CRYPTO_KEY`. Ninguna API la devuelve jamás: el listado expone
-- `tiene_password` (booleano) y nada más. Se descifra solo en el servidor y solo
-- en el momento de hablar con el Ministerio.
--
-- 🚨 `validado_en` NULL significa «nunca se ha probado», NO «está roto». Son tres
-- estados y la UI los distingue: sin probar · probado OK · probado y falla. Es la
-- regla «dato que no hay ≠ dato que no se ha mirado» del CLAUDE.md raíz: pintar de
-- rojo un establecimiento recién dado de alta manda a buscar una avería inexistente.
-- ────────────────────────────────────────────────────────────────────────────

-- ⚠️ SIN `cuenta_id`, A PROPÓSITO Y CON FECHA DE CADUCIDAD. La regla multi-tenant de
-- `apps/plataforma` es filtrar SIEMPRE por `cuenta_id`, y esta tabla NO la cumple: hoy
-- son los cuatro pisos de Alberto y la pantalla es interna (sesión obligatoria), así que
-- `listar()` devuelve todas las filas. El día que un segundo titular dé de alta un piso
-- aquí, esto deja de ser una simplificación y pasa a ser una fuga: la columna y el filtro
-- van ANTES de ese alta, no después.
CREATE TABLE IF NOT EXISTS ses_establecimientos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nombre del piso tal y como lo reconoce Alberto ("Busto Reform"). Es lo que
  -- se ve en la pantalla y en los avisos: un código de 10 dígitos no dice nada
  -- a las 7 de la mañana en un Telegram.
  nombre                 text NOT NULL,

  -- Enlace opcional con el resto del sistema. Nullable a propósito: un piso
  -- puede darse de alta en SES antes de estar enlazado, y bloquear el alta por
  -- eso solo conseguiría que las credenciales acaben en un post-it.
  property_id            text,
  negocio_id             uuid,

  -- Códigos del Ministerio. El de arrendador es del titular de la actividad (se
  -- repite entre pisos del mismo titular); el de establecimiento es por piso.
  codigo_arrendador      text NOT NULL,
  codigo_establecimiento text NOT NULL,

  -- Credenciales del SERVICIO WEB (distintas de las del acceso web con
  -- certificado digital, que no se guardan aquí ni en ningún sitio).
  usuario                text NOT NULL,
  password_cifrada       text,

  entorno                text NOT NULL DEFAULT 'produccion'
                         CHECK (entorno IN ('pruebas', 'produccion')),

  -- Interruptor por piso: durante la migración desde Chekin, cada piso se
  -- activa por separado y solo cuando el anterior emisor está apagado.
  activo                 boolean NOT NULL DEFAULT true,

  -- Resultado de la última prueba de conexión. Ver la nota de los tres estados.
  validado_en            timestamptz,
  ultimo_error           text,

  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now()
);

-- Un mismo establecimiento no puede estar dos veces: dos filas para el mismo
-- piso son dos emisores potenciales, que es justo el problema que este proyecto
-- existe para no crear (hoy ya conviven Chekin y el envío automático de Smoobu).
CREATE UNIQUE INDEX IF NOT EXISTS ses_establecimientos_codigo_uniq
  ON ses_establecimientos (codigo_arrendador, codigo_establecimiento);

CREATE INDEX IF NOT EXISTS ses_establecimientos_activo_idx
  ON ses_establecimientos (activo) WHERE activo;

-- 🚨 LANDMINE — una tabla NUEVA en `public` nace abierta a `anon` y `authenticated`.
-- Los privilegios POR DEFECTO del schema se los conceden solos. Comprobado el 20/08/2026:
-- recién creada, esta tabla tenía DELETE/INSERT/SELECT/UPDATE para `anon` — la clave
-- anónima que apps/ialimp usa EN EL NAVEGADOR— mientras que su hermana `agente_latidos`
-- no los tenía (a alguien se los habían quitado a mano en su día). Aquí viven las
-- credenciales del servicio web del Ministerio, así que se retiran explícitamente.
--
-- RLS está activo y sin políticas, lo que hoy ya bloquea el acceso, pero la seguridad no
-- se deja colgando solo de eso: el día que alguien añada una política permisiva para otra
-- cosa, la tabla entera quedaría abierta sin que nadie lo note. Al crear una tabla con
-- datos sensibles en esta BD compartida, este REVOKE va en la misma migración.
REVOKE ALL ON ses_establecimientos FROM anon, authenticated;

-- Y por la MISMA razón, los roles de las otras verticales: los privilegios por defecto del
-- schema se los dieron también a ellos, y ninguna toca esta tabla (la única app que la lee
-- es plataforma). No es un riesgo de navegador como `anon` — son roles de servidor — pero
-- aquí viven credenciales del Ministerio y no hay motivo para que las alcance una app de
-- limpiezas, de almacén, de alquiler o de transporte.
REVOKE ALL ON ses_establecimientos FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;
