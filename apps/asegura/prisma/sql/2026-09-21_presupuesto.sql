-- El presupuesto que se le enseña a un CLIENTE (21/09/2026).
--
-- Diseño: docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md
-- (§2.2 son estas tablas). PR 1 de los seis de §6: el objeto, congelado. Nada
-- de lo que hay aquí manda un correo ni gasta un euro.
--
-- ✅ APLICADA el 21/09/2026 (migración `seguros_presupuesto_cliente`), ANTES de
--    que el puerto la nombre y no después. Es el orden que exige la casa: un
--    INSERT que cite algo que todavía no existe no falla en `tsc` ni en el
--    build, falla en producción y lo que se pierde es trabajo ya pagado (ver la
--    cabecera de 2026-09-21_tarificacion_identidad_y_fallos.sql).
--    Son CUATRO TABLAS NUEVAS Y VACÍAS: no altera ninguna columna existente, no
--    toca un solo dato de la cartera y se deshace con cuatro `drop table`.
--
-- ─── Por qué NO valen `tarificaciones` + `tarificacion_precios` ─────────────
-- Esas dos responden «qué precio me dio el vendor y cuánto me costó
-- preguntarlo». Un presupuesto responde otra cosa: «QUÉ LE ENSEÑÉ A ESTA
-- PERSONA, cuándo, cuál eligió y qué firmó». Tres razones medidas:
--   1. `tarificacion_precios` guarda TODOS los precios (187 filas para 15
--      tarificaciones, ≈12 por cotización). Al cliente se le enseña un
--      subconjunto, ordenado y agrupado — y eso es lo que hay que poder
--      reconstruir letra a letra dentro de seis meses, porque es lo que firmó.
--   2. Una misma tarificación puede servir a DOS presupuestos (dos envíos, dos
--      caducidades). Un puntero no distingue cuál se enseñó.
--   3. Lo firmado tiene que ser INMUTABLE. Una fila de `tarificacion_precios`
--      no lo es: la reescribe la siguiente pasada.
-- Por eso `presupuesto_opcion` es un SNAPSHOT y no una vista: copia el precio
-- con su firmeza y sus avisos. Si mañana el vendor cambia de opinión, lo que se
-- enseñó ese día sigue estando escrito.
--
-- ─── Ensayo en seco contra la BD REAL (21/09/2026) ─────────────────────────
-- Las 14 pruebas corrieron dentro de un bloque que termina en RAISE, así que se
-- revirtió entero (comprobado después: ninguna de las cuatro tablas existe en
-- `seguros`). No es ceremonia: la PRIMERA pasada murió en
-- `0A000: cannot use subquery in check constraint`, o sea que el fichero entero
-- no se aplicaba — y ni `tsc` ni `next build` miran dentro de un DDL.
--
--   A camino feliz (tarificación real + enviado_at): OK
--   B cepo OK: P0001   simulada + enviado_at
--   C cepo OK: P0001   simulada + enlace_generado_at
--   D borrador simulado SIN sellos: OK   (preparar sin enviar sí vale)
--   E cepo OK: 23514   retirado sin motivo
--   M cepo OK: 23505   token repetido
--   N opción con DOS papeles fundidos: OK
--   F cepo OK: 23505   dos opciones en el mismo orden
--   G cepo OK: 23514   papel desconocido
--   H cepo OK: 23514   papel repetido
--   I cepo OK: 23514   portada sin grupo de cobertura leído
--   J cepo OK: P0001   editar un evento
--   K cepo OK: 23505   dos firmas del mismo documento
--   L cepo OK: P0001   editar una firma
--
-- ─── Naming ────────────────────────────────────────────────────────────────
-- `seguros.cotizaciones` YA EXISTE (cotizador web, 25 filas vivas) y
-- `avisos-presupuesto.ts` de esta app significa *presupuesto de tiempo*. De ahí
-- `presupuesto*` en singular, como `portal_obligacion`.
SET search_path = seguros, public;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. El presupuesto
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.presupuesto (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL,

  -- El TOMADOR, por id. La identidad es el id y nunca el nombre: dos homónimos
  -- fundidos en uno mezclarían sus teléfonos, sus pólizas y sus precios.
  cliente_id         uuid NOT NULL REFERENCES seguros.clientes (id) ON DELETE CASCADE,

  -- 🚨 NULL = VENTA NUEVA (no hay póliza que comparar), jamás «no tiene seguro».
  -- La pantalla del cliente lo usa para NO inventarse el bloque «qué tienes
  -- hoy» y para no calcular ningún ahorro: sin póliza actual no hay diferencia
  -- que enseñar, y un «ahorras 120€» contra un precio que nadie ha leído es la
  -- mentira más cara que podría dar esta pantalla.
  poliza_id          uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,

  ramo               text NOT NULL,

  -- De dónde salieron los precios. `restrict` a propósito: borrar la
  -- tarificación dejaría un presupuesto cuyo origen no se puede reproducir.
  tarificacion_id    uuid NOT NULL REFERENCES seguros.tarificaciones (id),

  -- 🚨 El token del enlace, HASHEADO (mismo patrón que `portal_invitacion`). En
  -- claro existe solo dentro del mensaje que sale. Y NO abre sesión: dice QUÉ
  -- presupuesto es; quién eres lo dice el código de un solo uso que llega a tu
  -- correo. Un enlace reenviado no le sirve a nadie más.
  token_hash         text NOT NULL,

  -- Por dónde se avisó. NULL = todavía no se ha avisado por ninguno.
  canal_aviso        text CHECK (canal_aviso IN ('email', 'whatsapp_enlace')),
  -- A quién se avisó, HASHEADO. El correo o el teléfono en claro no hacen falta
  -- para nada de lo que esta tabla tiene que responder.
  destino_hash       text,

  -- Ver §2.3: el mínimo de tres fuentes (fecha de efecto − 1 día, envío + 15
  -- días, `expirationDate` de la oferta si algún día llega). Se guarda ya
  -- resuelto porque es lo que decide si un precio se puede seguir ofreciendo.
  vence_el           timestamptz NOT NULL,

  creado_at          timestamptz NOT NULL DEFAULT now(),

  -- ── Los sellos ────────────────────────────────────────────────────────────
  -- NULL = no ha pasado. En `visto_at`, NULL = «NO CONSTA» que lo haya abierto,
  -- que no es lo mismo que «no lo ha abierto»: un cliente puede leerlo en un
  -- cliente de correo que no ejecuta nada, o desde el móvil de su hijo.
  --
  -- 🚨 DOS sellos de salida, no uno. El correo lo manda nuestro servidor y el
  -- proveedor acusa recibo; el enlace de WhatsApp lo manda Alberto desde su
  -- móvil y NADIE sabe si llegó a pulsar «enviar». Colapsarlos afirmaría un
  -- envío que no consta — y eso es lo que decide si se le vuelve a escribir a
  -- alguien o se le deja en paz creyendo que ya se le avisó.
  enlace_generado_at timestamptz,   -- se abrió WhatsApp con el mensaje escrito
  enviado_at         timestamptz,   -- el proveedor lo aceptó, o Alberto confirma «ya lo he mandado»
  visto_at           timestamptz,
  elegido_at         timestamptz,   -- «me interesa»: sin firma y sin compromiso
  aceptado_at        timestamptz,   -- firmado (exige fila en `seguros.firma`)
  emitido_at         timestamptz,

  retirado_at        timestamptz,
  retirado_motivo    text,

  -- Cómo acabó, si acabó fuera: se cambia de compañía, o solo de mediador
  -- (carta de nombramiento, PR 6). NULL = ni una cosa ni la otra TODAVÍA.
  salida             text CHECK (salida IN ('cambio_compania', 'cambio_mediador')),

  -- Se rellena al acuñar la póliza (`registrarPolizaEmitida`). Es lo que cierra
  -- el embudo: sin él, un presupuesto emitido y una póliza nueva son dos hechos
  -- que nadie ata.
  poliza_emitida_id  uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,

  creado_por         text NOT NULL,

  -- Retirar un presupuesto sin decir por qué deja una fila que no explica nada
  -- el día que el cliente pregunte. Las dos columnas van juntas o ninguna.
  CONSTRAINT retirado_con_motivo
    CHECK ((retirado_at IS NULL) = (retirado_motivo IS NULL))
);

-- El token es la llave: dos presupuestos no pueden compartirlo jamás.
CREATE UNIQUE INDEX IF NOT EXISTS idx_presupuesto_token
  ON seguros.presupuesto (token_hash);

-- La cola de «Hoy»: lo que está en curso de esta correduría, por recencia.
CREATE INDEX IF NOT EXISTS idx_presupuesto_correduria
  ON seguros.presupuesto (correduria_id, creado_at DESC);

CREATE INDEX IF NOT EXISTS idx_presupuesto_cliente
  ON seguros.presupuesto (cliente_id, creado_at DESC);

CREATE INDEX IF NOT EXISTS idx_presupuesto_poliza
  ON seguros.presupuesto (poliza_id)
  WHERE poliza_id IS NOT NULL;

COMMENT ON TABLE seguros.presupuesto IS
  'Lo que se le enseñó a un cliente: qué opciones, cuándo, cuál eligió y qué firmó. '
  'Distinto de seguros.tarificaciones, que es lo que devolvió el vendor. El estado NO se '
  'guarda: se DERIVA de los sellos (estadoPresupuesto() de @central/module-seguros).';

COMMENT ON COLUMN seguros.presupuesto.poliza_id IS
  'La póliza que se compara. NULL = venta nueva, NUNCA «no tiene seguro»: sin ella la pantalla '
  'no pinta el bloque «qué tienes hoy» ni calcula ahorro ninguno.';
COMMENT ON COLUMN seguros.presupuesto.visto_at IS
  'NULL = NO CONSTA que lo haya abierto. No es «no lo ha abierto»: hay clientes de correo y '
  'navegadores que no dejan rastro, y perseguir a alguien que ya lo leyó es igual de caro que '
  'no perseguir a quien no.';
COMMENT ON COLUMN seguros.presupuesto.enlace_generado_at IS
  'Se abrió WhatsApp con el mensaje escrito. NO prueba que se enviara: eso pasa en el móvil de '
  'Alberto y aquí no llega. Por eso no es enviado_at.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Las opciones — SNAPSHOT, no un puntero a `tarificacion_precios`
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.presupuesto_opcion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id    uuid NOT NULL
                    REFERENCES seguros.presupuesto (id) ON DELETE CASCADE,

  -- El orden EXACTO en que se pintaron. Parte de «reconstruir letra a letra».
  orden             smallint NOT NULL,

  compania          text NOT NULL,
  producto          text NOT NULL,
  modalidad         text,
  categoria         text,

  -- El grupo de `nivelCobertura()`/`agruparPrecios()`. NULL = no se pudo
  -- clasificar, y entonces la opción NO puede hacer de portada: llamar «la
  -- mejor cubierta» a algo cuyo nivel no se ha sabido leer es inventarse el
  -- único dato que sostiene esa frase.
  grupo_cobertura   text,

  prima_eur         numeric(10, 2) NOT NULL,
  entrada_eur       numeric(10, 2),

  -- 🚨 NULL = el producto NO declara franquicia, jamás «sin franquicia».
  -- Enseñar un todo riesgo callando que lleva 1.500€ de franquicia es la
  -- versión cara de leer mal un dato que sí está.
  franquicia_eur    numeric(10, 2),

  -- Viaja con el precio para que un estimado no se reenseñe mañana como si la
  -- compañía lo hubiera cerrado. Medido: de los 187 precios guardados, NI UNO
  -- es `firme`.
  firmeza           text NOT NULL CHECK (firmeza IN ('firme', 'condicionado', 'estimado')),
  requiere_rerate   boolean NOT NULL,

  -- `mainQuote.id` del vendor ("Q7601460"). Sin él no hay ReRate posible, y el
  -- ReRate es lo que convierte esto en un precio que se puede contratar.
  referencia_vendor text,

  coberturas        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Los avisos de la compañía se enseñan SIEMPRE, así que se guardan siempre.
  avisos            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- 🚨 `papeles` es un ARRAY y no el `papel` suelto que apuntaba la spec, por lo
  -- que la propia spec exige tres líneas más abajo: «si dos papeles caen en la
  -- misma opción, SE FUNDEN y se dice». Con una sola columna de texto esa
  -- fusión no se puede escribir, y el snapshot dejaría de ser lo que se enseñó.
  -- Y no hay `portada boolean` aparte: sería un segundo sitio donde guardar lo
  -- mismo, o sea un sitio donde contradecirse. Portada = `papeles <> '{}'`.
  papeles           text[] NOT NULL DEFAULT '{}'::text[],

  elegida_at        timestamptz,

  -- Dos opciones no pueden ocupar el mismo hueco de la lista.
  CONSTRAINT presupuesto_opcion_orden_unico UNIQUE (presupuesto_id, orden),

  CONSTRAINT papeles_conocidos CHECK (
    papeles <@ ARRAY['equivalente', 'mas_barata', 'mejor_cubierta']::text[]
  ),
  -- La misma opción no puede ser «la más barata» dos veces.
  -- 🚨 Se cuenta papel a papel y NO con `(select count(distinct …) from unnest(…))`,
  -- que es como se escribió primero: Postgres rechaza toda subconsulta dentro de un
  -- CHECK (`0A000: cannot use subquery in check constraint`) y el DDL entero no se
  -- aplica. Lo cazó el ensayo en seco contra la BD real, no el typecheck ni el build:
  -- ahí dentro no mira ninguno de los dos.
  CONSTRAINT papeles_sin_repetir CHECK (
    cardinality(papeles) =
      (CASE WHEN 'equivalente'    = ANY (papeles) THEN 1 ELSE 0 END)
    + (CASE WHEN 'mas_barata'     = ANY (papeles) THEN 1 ELSE 0 END)
    + (CASE WHEN 'mejor_cubierta' = ANY (papeles) THEN 1 ELSE 0 END)
  ),
  -- Ver `grupo_cobertura`: sin nivel leído no se hace de portada.
  CONSTRAINT portada_con_grupo CHECK (
    papeles = '{}'::text[] OR grupo_cobertura IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_opcion_presupuesto
  ON seguros.presupuesto_opcion (presupuesto_id, orden);

COMMENT ON TABLE seguros.presupuesto_opcion IS
  'Copia CONGELADA de lo que se le enseñó al cliente, en su orden. No es una vista de '
  'tarificacion_precios: si el vendor cambia de opinión mañana, lo que se enseñó ese día sigue '
  'escrito aquí. Es lo que se firma.';
COMMENT ON COLUMN seguros.presupuesto_opcion.papeles IS
  'Qué papel hace en la portada: equivalente / mas_barata / mejor_cubierta. Es un ARRAY porque una '
  'misma opción puede ser dos a la vez y eso se dice, no se reparte. Vacío = no es portada. '
  'Que cada papel salga UNA vez por presupuesto lo vigila el puerto y su test, no la BD.';
COMMENT ON COLUMN seguros.presupuesto_opcion.franquicia_eur IS
  'NULL = el producto no declara franquicia. JAMÁS «sin franquicia».';


-- ════════════════════════════════════════════════════════════════════════════
-- 3. La telemetría — append-only
-- ════════════════════════════════════════════════════════════════════════════
-- Es el registro de lo que pasó con un documento que alguien puede acabar
-- firmando, así que se comporta como `cliente_merge_log`: se escribe y no se
-- reescribe. Un libro que se puede editar no prueba nada.
CREATE TABLE IF NOT EXISTS seguros.presupuesto_evento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid NOT NULL
                 REFERENCES seguros.presupuesto (id) ON DELETE CASCADE,
  tipo           text NOT NULL,
  ocurrido_at    timestamptz NOT NULL DEFAULT now(),
  -- Quién lo provocó: 'corredor' | 'cliente' | 'sistema'. Sin esto, «visto» y
  -- «marcado como visto por Alberto» son la misma fila.
  origen         text NOT NULL,
  detalle        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_evento_presupuesto
  ON seguros.presupuesto_evento (presupuesto_id, ocurrido_at);

CREATE OR REPLACE FUNCTION seguros.presupuesto_evento_reject_modification()
RETURNS trigger LANGUAGE plpgsql AS $reject$
BEGIN
  RAISE EXCEPTION 'seguros.presupuesto_evento es append-only (intento de % en %)',
    tg_op, tg_table_name;
END;
$reject$;

DROP TRIGGER IF EXISTS presupuesto_evento_reject_modification
  ON seguros.presupuesto_evento;
CREATE TRIGGER presupuesto_evento_reject_modification
  BEFORE UPDATE OR DELETE ON seguros.presupuesto_evento
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_evento_reject_modification();


-- ════════════════════════════════════════════════════════════════════════════
-- 4. La firma — genérica, sirve al presupuesto Y a la carta de mediador
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.firma (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL,

  -- Qué se firmó. Genérico desde el día uno porque la carta de nombramiento de
  -- mediador (PR 6) firma exactamente igual, y una segunda tabla de firmas
  -- sería un segundo criterio de qué cuenta como firma.
  documento_tipo  text NOT NULL CHECK (documento_tipo IN ('presupuesto', 'carta_mediador')),
  documento_id    uuid NOT NULL,

  cliente_id      uuid NOT NULL REFERENCES seguros.clientes (id) ON DELETE RESTRICT,
  -- Con qué identidad del portal entró. NULL = se firmó por otra vía.
  identidad_id    uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,

  -- 🚨 El hash del documento EXACTO que se le enseñó al firmar. Es la pieza que
  -- convierte esto en algo que aguanta una reclamación: sin él, «firmó el
  -- presupuesto» es una afirmación sobre un contenido que ya nadie puede
  -- reconstruir. Lo que se hashea es el documento, no la fila.
  doc_hash        text NOT NULL,
  algoritmo       text NOT NULL,
  -- Cómo se acreditó: hoy, código de un solo uso al canal del cliente.
  metodo          text NOT NULL,

  -- Lo que el firmante declaró ser, tal cual, en el momento de firmar. Se copia
  -- a propósito en vez de leerse de la ficha: la ficha cambia, la evidencia no.
  firmante_nombre text,
  firmante_email  text,
  firmante_dni    text,

  ip              text,
  user_agent      text,
  sello_tiempo    timestamptz NOT NULL DEFAULT now(),
  evidencia       jsonb NOT NULL DEFAULT '{}'::jsonb,
  creada_at       timestamptz NOT NULL DEFAULT now(),

  -- 🚨 LA IDEMPOTENCIA DE LA FIRMA, EN LA BD Y NO EN UN `if`. Pulsar dos veces
  -- devuelve la primera evidencia; no crea una segunda. Sin esto, un móvil con
  -- mala cobertura produce dos firmas con dos sellos de tiempo sobre el mismo
  -- documento — y entonces no hay «la firma»: hay dos, y ninguna es la buena.
  CONSTRAINT firma_documento_unico UNIQUE (documento_tipo, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_firma_cliente
  ON seguros.firma (cliente_id, creada_at DESC);

-- Una firma tampoco se reescribe.
CREATE OR REPLACE FUNCTION seguros.firma_reject_modification()
RETURNS trigger LANGUAGE plpgsql AS $reject$
BEGIN
  RAISE EXCEPTION 'seguros.firma es append-only (intento de % en %)', tg_op, tg_table_name;
END;
$reject$;

DROP TRIGGER IF EXISTS firma_reject_modification ON seguros.firma;
CREATE TRIGGER firma_reject_modification
  BEFORE UPDATE OR DELETE ON seguros.firma
  FOR EACH ROW EXECUTE FUNCTION seguros.firma_reject_modification();

COMMENT ON TABLE seguros.firma IS
  'La evidencia de una firma. Append-only y única por documento: pulsar dos veces no crea una '
  'segunda firma. doc_hash es del documento que se enseñó, no de esta fila.';


-- ════════════════════════════════════════════════════════════════════════════
-- 5. El invariante que no cabe en un CHECK: un precio SIMULADO no sale de casa
-- ════════════════════════════════════════════════════════════════════════════
-- `tarificaciones.simulado` marca los precios que NO dio ninguna compañía (los
-- que existen para poder recorrer la pantalla sin gastar 0,50€; su
-- `project_id_codeoscopic` es negativo justo para que canten). Enseñárselos a
-- un cliente es el peor fallo posible de todo esto: no es un número mal
-- formateado, es una oferta que no existe.
--
-- Va en un TRIGGER y no en un CHECK porque el dato vive en otra tabla. Y cubre
-- los DOS sellos de salida, no solo `enviado_at`: el enlace es lo que lleva el
-- precio, así que generarlo ya es dejar que salga — un enlace de WhatsApp se
-- pega en cualquier sitio.
--
-- Es el hermano del CHECK `simulada_sin_libro` de `tarificaciones`, un piso más
-- arriba: allí se garantiza que lo simulado no tiene cargo; aquí, que no tiene
-- destinatario.
CREATE OR REPLACE FUNCTION seguros.presupuesto_no_enviar_simulado()
RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
  es_simulado boolean;
BEGIN
  IF NEW.enviado_at IS NULL AND NEW.enlace_generado_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.simulado INTO es_simulado
    FROM seguros.tarificaciones t
   WHERE t.id = NEW.tarificacion_id;

  -- Si la tarificación no aparece, no se afirma que sea real: se corta. La FK
  -- hace que esto no pueda pasar hoy; el día que alguien la relaje, el fallo
  -- seguro es negarse, no enviar.
  IF es_simulado IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'presupuesto %: su tarificación es simulada (o no se ha podido comprobar); '
      'un precio que no ha dado ninguna compañía no se le enseña a un cliente',
      NEW.id;
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS presupuesto_no_enviar_simulado ON seguros.presupuesto;
CREATE TRIGGER presupuesto_no_enviar_simulado
  BEFORE INSERT OR UPDATE ON seguros.presupuesto
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_no_enviar_simulado();


-- ════════════════════════════════════════════════════════════════════════════
-- 6. Permisos
-- ════════════════════════════════════════════════════════════════════════════
-- Solo `prisma_seguros` (BYPASSRLS), que es el rol de esta app: aquí se PREPARA
-- el presupuesto, y de aquí saldrá el envío.
--
-- 🚫 El rol del portal (`prisma_asegura_portal`, NOBYPASSRLS) NO recibe nada en
-- este PR, a propósito. Su GRANT es por COLUMNAS y solo de lectura, más un
-- UPDATE(visto_at) — y eso entra en el PR 2 junto con la pantalla que lo usa y
-- con la extensión de `test/regression-portal-aislamiento.test.ts`. Dar el
-- permiso antes que el cepo es cómo se cuela una lectura que nadie vigila.
GRANT SELECT, INSERT, UPDATE ON seguros.presupuesto         TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.presupuesto_opcion TO prisma_seguros;
GRANT SELECT, INSERT ON seguros.presupuesto_evento          TO prisma_seguros;
GRANT SELECT, INSERT ON seguros.firma                       TO prisma_seguros;
