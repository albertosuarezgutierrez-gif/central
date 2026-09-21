-- El PORTAL puede LEER un presupuesto (PR 2, 21/09/2026).
--
-- Diseño: docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md
-- Las cuatro tablas ya existen: las crea `apps/asegura/prisma/sql/2026-09-21_presupuesto.sql`
-- (PR 1), que a propósito NO le dio nada al rol del portal — «dar el permiso
-- antes que el cepo es cómo se cuela una lectura que nadie vigila». El cepo
-- entra con este PR (`test/regression-portal-aislamiento.test.ts` + el suyo
-- propio), así que ahora sí.
--
-- ⚠️ NO APLICADA todavía. Hay que ejecutarla contra la Supabase compartida
-- ANTES de que el portal despliegue esta pantalla: sin los GRANT, TODA consulta
-- a `prisma.presupuesto*` desde el portal muere con `42501 permission denied`.
-- Y al revés también importa: aplicar esto sin desplegar el código no rompe
-- nada, así que el orden seguro es SQL primero.
--
-- ─── Por qué por COLUMNAS y no por tabla ────────────────────────────────────
-- Es el mismo criterio que `2026-09-02_portal_rol_vinculo_grants.sql`: lo que
-- no está aquí, el portal no lo puede leer ni queriendo, y un `SELECT *` falla
-- en la BD, que es donde tiene que fallar. `prisma_asegura_portal` es
-- NOBYPASSRLS pero estas tablas no tienen políticas para él, así que el GRANT
-- por columnas es la ÚNICA barrera que no depende de que el código acierte.
--
-- Lo que deliberadamente NO se concede, y por qué:
--   · `presupuesto.creado_por`        → quién lo preparó. Gestión interna.
--   · `presupuesto.retirado_motivo`   → la nota con la que Alberto lo retira.
--     Puede decir cualquier cosa sobre el cliente y NO está escrita para él.
--     `retirado_at` sí: con eso la pantalla sabe que el enlace ya no vale.
--   · `presupuesto.canal_aviso`, `poliza_emitida_id`, `salida` → no hacen falta
--     para pintar. Lo que no se concede no se puede colar por descuido.
--   · `presupuesto_opcion.referencia_vendor` → el id del quote del vendor
--     («Q7601460»). Es la llave del ReRate, la llamada que cuesta dinero; no es
--     un dato del cliente y no tiene por qué salir de casa.
--   · `presupuesto_evento.detalle`    → lo escribe el corredor. El portal solo
--     necesita saber SI ya anotó una apertura ajena, no qué dice.
--   · `seguros.tarificaciones` entera, `tarificacion_precios`, `seguros.firma`.
SET search_path = seguros, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. El presupuesto: lectura, y UN solo UPDATE
-- ════════════════════════════════════════════════════════════════════════════
--
-- `token_hash` va en el SELECT porque la carátula pública busca POR él, y en
-- Postgres un `WHERE` también exige privilegio sobre la columna. Es un SHA-256
-- de 32 bytes aleatorios: una lectura de esta tabla no da ningún enlace usable.
--
-- `destino_hash` idem: es la rama (a) de la autorización («entró por el mismo
-- canal al que se avisó»). 🚨 Y una landmine escrita aquí para que se lea al
-- conceder el permiso: esa rama NO puede funcionar hasta que `apps/asegura`
-- escriba esa columna con `hashCanal()` del portal, que lleva dentro la
-- pimienta `ASEGURA_PORTAL_CANAL_PEPPER` — una env que hoy solo existe en el
-- proyecto Vercel del portal. Mientras siga a NULL (PR 1 no la escribe), la
-- rama (a) no concede nada, y eso es «no consta a quién se avisó», no «no
-- coincide».
GRANT SELECT (
  id, correduria_id, cliente_id, poliza_id, ramo,
  token_hash, destino_hash,
  vence_el, creado_at,
  enviado_at, visto_at, elegido_at, aceptado_at, emitido_at, retirado_at
) ON seguros.presupuesto TO prisma_asegura_portal;

-- La ÚNICA escritura del portal sobre el presupuesto: `enviado → visto`, tras
-- el canje del código (§2.5). Va filtrada por el `cliente_id` ya autorizado y
-- solo la primera vez. Ni `elegido_at` ni `aceptado_at`: elegir y firmar son el
-- PR 4, y un permiso concedido «para luego» es un permiso que nadie vigila.
GRANT UPDATE (visto_at) ON seguros.presupuesto TO prisma_asegura_portal;

-- 🚨 `tarificacion_id`: se concede para que el TRIGGER pueda leerlo, no para la
-- pantalla (el schema de Prisma del portal NO declara esta columna).
--
-- `presupuesto_no_enviar_simulado()` es un `BEFORE INSERT OR UPDATE` de
-- `apps/asegura` y está declarado SECURITY INVOKER, así que corre con el rol de
-- quien hace el UPDATE. Sobre una fila ya enviada (`enviado_at IS NOT NULL`) no
-- toma el atajo del principio y hace
--   `select t.simulado from seguros.tarificaciones t where t.id = NEW.tarificacion_id`
-- Sin privilegio sobre esas columnas, el UPDATE de `visto_at` desde el portal
-- fallaría con 42501 — un fallo que ni `tsc` ni los tests ven, porque vive
-- dentro de un trigger.
--
-- ⏭️ El arreglo bueno NO es este GRANT: es que ese trigger solo mire cuando los
-- sellos de salida CAMBIAN (`TG_OP = 'INSERT' OR NEW.enviado_at IS DISTINCT FROM
-- OLD.enviado_at OR NEW.enlace_generado_at IS DISTINCT FROM OLD.enlace_generado_at`).
-- Eso vive en el fichero de asegura y no se toca desde aquí: dos ficheros
-- definiendo la misma función es cómo se desincronizan. Cuando se haga allí,
-- estas dos líneas se pueden revocar.
GRANT SELECT (tarificacion_id) ON seguros.presupuesto TO prisma_asegura_portal;
GRANT SELECT (id, simulado) ON seguros.tarificaciones TO prisma_asegura_portal;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Las opciones congeladas: solo lectura
-- ════════════════════════════════════════════════════════════════════════════
GRANT SELECT (
  id, presupuesto_id, orden,
  compania, producto, modalidad, categoria, grupo_cobertura,
  prima_eur, entrada_eur, franquicia_eur,
  firmeza, requiere_rerate,
  coberturas, avisos, papeles, elegida_at
) ON seguros.presupuesto_opcion TO prisma_asegura_portal;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. La telemetría: el portal SOLO escribe «apertura_ajena»
-- ════════════════════════════════════════════════════════════════════════════
--
-- La tabla es append-only por trigger, así que aquí no hay UPDATE ni DELETE que
-- conceder aunque se quisiera.
--
-- El SELECT es MÍNIMO y tiene un motivo: la anotación se hace UNA vez por hora
-- y por presupuesto, no una por recarga. Sin poder preguntar «¿ya la anoté?»,
-- un F5 sostenido llenaría un libro que no se puede limpiar. `detalle` no
-- entra: para esa pregunta no hace falta y lo escribe el otro lado.
-- 🚨 `ocurrido_at` va en el INSERT aunque tenga `default now()`: Prisma RELLENA
-- los `@default(now())` en el cliente, así que la sentencia sí nombra la
-- columna y sin privilegio moriría con 42501. `id` no hace falta — ese default
-- es `dbgenerated`, lo pone Postgres.
--
-- `detalle` NO se concede ni en INSERT: el portal no escribe ninguno (el
-- `'{}'::jsonb` por defecto basta) y su modelo de Prisma tampoco lo declara.
GRANT INSERT (presupuesto_id, tipo, origen, ocurrido_at) ON seguros.presupuesto_evento TO prisma_asegura_portal;
GRANT SELECT (id, presupuesto_id, tipo, ocurrido_at) ON seguros.presupuesto_evento TO prisma_asegura_portal;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Lo que NO se concede, escrito para que se note si alguien lo añade
-- ════════════════════════════════════════════════════════════════════════════
-- `seguros.firma` NO se toca: la firma la compone `apps/asegura` por su puerto
-- (§2.4 — `cumpleArt26()` exige nombre + email/DNI, y el portal no tiene GRANT
-- sobre ninguno de los dos). Que el portal ni siquiera pueda leer la tabla es
-- lo que garantiza que el PR 4 no se «simplifique» escribiéndola desde aquí.
--
-- `seguros.tarificacion_precios` tampoco: el cliente ve el SNAPSHOT y nada más
-- (§5.1). Una lista larga leída en vivo de una tabla mutable cambiaría entre
-- dos visitas mientras la portada, congelada, no — y lo que se firma tiene que
-- ser reconstruible letra a letra.
