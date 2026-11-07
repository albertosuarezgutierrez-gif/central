// Cepos contra un Postgres REAL (las migraciones 0001+0002 aplicadas en una BD de usar y tirar). Solo corre si se define
// HERRAMIENTAS_PG_TEST con los argumentos de psql (p. ej. "-h /ruta/socket -p 55432 -U postgres -d t1"); en CI se salta.
// Cada caso va en una transacción que se DESHACE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const ARGS = process.env.HERRAMIENTAS_PG_TEST?.split(/\s+/).filter(Boolean)
const opciones = { skip: !ARGS && 'sin HERRAMIENTAS_PG_TEST (BD de prueba)' }

function psql(sqlTexto: string): { ok: boolean; out: string } {
  const r = spawnSync('psql', [...ARGS!, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], { input: `BEGIN;\n${sqlTexto}\nROLLBACK;\n`, encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` }
}

// Dos cuentas, un dueño y una admin en A; otro dueño en B. Ids fijos para leerlos en los casos.
const PREP = `
SELECT o_id FROM herramientas.op_alta_cuenta('B88936158','Empresa A, S.L.','Calle A','1',NULL,'41003','Sevilla','Sevilla',NULL,NULL,'op@prueba.test') \\gset a_
SELECT o_id FROM herramientas.op_alta_cuenta('B05457247','Empresa B, S.L.','Calle B','2',NULL,'41003','Sevilla','Sevilla',NULL,NULL,'op@prueba.test') \\gset b_
SELECT herramientas.op_fijar_dueno(:'a_o_id','duena-a@prueba.test','Dueña A','28823484E','administrador','op@prueba.test') AS pa \\gset
SELECT herramientas.op_fijar_dueno(:'b_o_id','dueno-b@prueba.test','Dueño B','28823484E','apoderado','op@prueba.test') AS pb \\gset
SELECT herramientas.op_fijar_ref(:'a_o_id','contabilidad','22222222-2222-4222-8222-222222222222','op@prueba.test');
SELECT herramientas.op_emitir_version(:'a_o_id', ARRAY['contabilidad'], (SELECT id FROM herramientas.plantilla LIMIT 1),
  jsonb_build_object('version',1,'firmante',jsonb_build_object('email','duena-a@prueba.test')), 'DOC', encode(sha256(convert_to('DOC','UTF8')),'hex'),
  'duena-a@prueba.test', now() + interval '30 days', 'op@prueba.test');
SELECT id AS v FROM herramientas.contrato_version LIMIT 1 \\gset
SELECT herramientas.op_dar_acceso(:'a_o_id','admin-a@prueba.test','Admin A','admin',ARRAY['contabilidad'],'op@prueba.test') AS adm \\gset
`
const comoPersona = (var_: string) => `SET LOCAL ROLE prisma_herramientas; SELECT set_config('herramientas.persona_id', :'${var_}', true);`

test('RLS: la persona de A no ve la cuenta de B; sin persona fijada no ve nada', opciones, () => {
  const r = psql(`${PREP}${comoPersona('pa')}
    SELECT 'A:' || count(*) FROM herramientas.cuenta WHERE cif = 'B88936158';
    SELECT 'B:' || count(*) FROM herramientas.cuenta WHERE cif = 'B05457247';
    SELECT set_config('herramientas.persona_id', '', true);
    SELECT 'nadie:' || count(*) FROM herramientas.cuenta;`)
  assert.ok(r.ok, r.out)
  assert.match(r.out, /A:1/); assert.match(r.out, /B:0/); assert.match(r.out, /nadie:0/)
})

test('el rol no tiene GRANT en ningún otro schema ni salta RLS', opciones, () => {
  const r = psql(`SELECT 'fuera:' || count(*) FROM information_schema.role_table_grants WHERE grantee = 'prisma_herramientas' AND table_schema <> 'herramientas';
    SELECT 'bypass:' || rolbypassrls FROM pg_roles WHERE rolname = 'prisma_herramientas';
    SELECT 'sinforzar:' || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'herramientas' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);`)
  assert.ok(r.ok, r.out)
  assert.match(r.out, /fuera:0/); assert.match(r.out, /bypass:false/); assert.match(r.out, /sinforzar:0/)
})

test('CEPO el rol no puede escribir directamente (INSERT en cuenta / UPDATE en firma)', opciones, () => {
  const r = psql(`${PREP}${comoPersona('pa')} INSERT INTO herramientas.cuenta (cif, razon_social, creada_por) VALUES ('B88936158','x','y');`)
  assert.equal(r.ok, false); assert.match(r.out, /permission denied/)
})

test('CEPO UPDATE sobre plantilla y DELETE de versión rechazados por la BD (también como postgres)', opciones, () => {
  const a = psql(`UPDATE herramientas.plantilla SET estado = 'revisada';`)
  assert.equal(a.ok, false); assert.match(a.out, /inmutable/)
  const b = psql(`${PREP} UPDATE herramientas.contrato_version SET documento_html = 'otro' WHERE id = :'v';`)
  assert.equal(b.ok, false); assert.match(b.out, /inmutable/)
  const c = psql(`${PREP} UPDATE herramientas.contrato_version SET estado = 'sustituido' WHERE id = :'v';`)
  assert.equal(c.ok, false); assert.match(c.out, /no permitida/)
})

test('CEPO admin intentando firmar → solo_firma_el_dueno; dueño firma y activa; UPDATE de la firma rechazado', opciones, () => {
  const firmar = `SELECT herramientas.firmar_version(:'v','Dueña A','administrador','1.2.3.4','ua',encode(sha256(convert_to('DOC','UTF8')),'hex'), now(), '{}'::jsonb, 'CERT', encode(sha256(convert_to('CERT','UTF8')),'hex'));`
  const adm = psql(`${PREP}${comoPersona('adm')}${firmar}`)
  assert.equal(adm.ok, false); assert.match(adm.out, /solo_firma_el_dueno/)
  const hashMal = psql(`${PREP}${comoPersona('pa')}SELECT herramientas.firmar_version(:'v','Dueña A','administrador','1','ua','${'0'.repeat(64)}', now(), '{}'::jsonb, 'C', encode(sha256(convert_to('C','UTF8')),'hex'));`)
  assert.equal(hashMal.ok, false); assert.match(hashMal.out, /documento_cambiado/)
  const ok = psql(`${PREP}${comoPersona('pa')}${firmar}
    SELECT 'estado:' || estado FROM herramientas.cuenta_herramienta WHERE herramienta = 'contabilidad';
    RESET ROLE; UPDATE herramientas.firma SET ip = 'otra';`)
  assert.equal(ok.ok, false)
  assert.match(ok.out, /estado:activa/); assert.match(ok.out, /inmutable/)
})

test('CEPO confirmo_destinatario distinto → destinatario_cambiado', opciones, () => {
  const r = psql(`${PREP} SELECT herramientas.op_emitir_version(:'a_o_id', ARRAY['contabilidad'], (SELECT id FROM herramientas.plantilla LIMIT 1),
    jsonb_build_object('version',2,'firmante',jsonb_build_object('email','duena-a@prueba.test')), 'D2', encode(sha256(convert_to('D2','UTF8')),'hex'),
    'otro@prueba.test', now() + interval '30 days', 'op@prueba.test');`)
  assert.equal(r.ok, false); assert.match(r.out, /destinatario_cambiado/)
})

test('traspaso: admin con concesión sí; sin concesión no; el hash del documento no se puede falsear', opciones, () => {
  const r = psql(`${PREP}
    SELECT herramientas.firmar_version(:'v','x','administrador','1','u',encode(sha256(convert_to('DOC','UTF8')),'hex'), now(), '{}'::jsonb, 'C', encode(sha256(convert_to('C','UTF8')),'hex'))
      FROM (SELECT set_config('herramientas.persona_id', :'pa', true)) s;
    ${comoPersona('adm')}
    SELECT 'ref:' || o_ref FROM herramientas.registrar_traspaso(:'a_o_id','contabilidad','33333333-3333-4333-8333-333333333333','contabilidad', now() + interval '60 seconds');`)
  assert.ok(r.ok, r.out); assert.match(r.out, /ref:22222222/)
  const sin = psql(`${PREP}
    SELECT herramientas.firmar_version(:'v','x','administrador','1','u',encode(sha256(convert_to('DOC','UTF8')),'hex'), now(), '{}'::jsonb, 'C', encode(sha256(convert_to('C','UTF8')),'hex'))
      FROM (SELECT set_config('herramientas.persona_id', :'pa', true)) s;
    SELECT herramientas.op_dar_acceso(:'a_o_id','admin2@prueba.test','Admin Dos','admin',ARRAY[]::text[],'op@prueba.test') AS adm2 \\gset
    ${comoPersona('adm2')}
    SELECT o_ref FROM herramientas.registrar_traspaso(:'a_o_id','contabilidad','44444444-4444-4444-8444-444444444444','contabilidad', now() + interval '60 seconds');`)
  assert.equal(sin.ok, false); assert.match(sin.out, /sin_acceso_a_la_herramienta/)
  const falso = psql(`INSERT INTO herramientas.plantilla (codigo, version, estado, texto_md, sha256) VALUES ('encargo_tratamiento','vX','borrador','t','${'a'.repeat(64)}');`)
  assert.equal(falso.ok, false); assert.match(falso.out, /check constraint/)
})

// I-1: una empleada en A (con la versión ya FIRMADA, para que haya firma y certificado que esconder).
const FIRMADA = `${PREP}
SELECT herramientas.firmar_version(:'v','Dueña A','administrador','1.2.3.4','ua',encode(sha256(convert_to('DOC','UTF8')),'hex'), now(), '{}'::jsonb, 'CERT', encode(sha256(convert_to('CERT','UTF8')),'hex'))
  FROM (SELECT set_config('herramientas.persona_id', :'pa', true)) s;
SELECT set_config('herramientas.persona_id', '', true);
SELECT herramientas.op_dar_acceso(:'a_o_id','empleada-a@prueba.test','Empleada A','empleado',ARRAY['contabilidad'],'op@prueba.test') AS emp \\gset
`

test('CEPO I-1 la empleada ve 0 firmas, 0 versiones, 0 contratos, ni personas ni miembros ajenos (sí su cuenta y su fila)', opciones, () => {
  const r = psql(`${FIRMADA}${comoPersona('emp')}
    SELECT 'firma:' || count(*) FROM herramientas.firma;
    SELECT 'version:' || count(*) FROM herramientas.contrato_version;
    SELECT 'contrato:' || count(*) FROM herramientas.contrato;
    SELECT 'personas:' || count(*) FROM herramientas.persona;
    SELECT 'miembros:' || count(*) FROM herramientas.cuenta_miembro;
    SELECT 'concesiones_ajenas:' || count(*) FROM herramientas.miembro_herramienta WHERE persona_id <> :'emp';
    SELECT 'cuenta:' || count(*) FROM herramientas.cuenta;
    SELECT 'rol:' || herramientas.rol_en(:'a_o_id');`)
  assert.ok(r.ok, r.out)
  assert.match(r.out, /firma:0/); assert.match(r.out, /version:0/); assert.match(r.out, /contrato:0/)
  assert.match(r.out, /personas:1/); assert.match(r.out, /miembros:1/); assert.match(r.out, /concesiones_ajenas:0/)
  assert.match(r.out, /cuenta:1/); assert.match(r.out, /rol:empleado/)
})

test('I-1 control: la admin (gestora) de A sí ve la firma, la versión y a los miembros', opciones, () => {
  const r = psql(`${FIRMADA}${comoPersona('adm')}
    SELECT 'firma:' || count(*) FROM herramientas.firma;
    SELECT 'version:' || count(*) FROM herramientas.contrato_version;
    SELECT 'miembros:' || count(*) FROM herramientas.cuenta_miembro;`)
  assert.ok(r.ok, r.out)
  assert.match(r.out, /firma:1/); assert.match(r.out, /version:1/); assert.match(r.out, /miembros:3/)
})

test('CEPO I-4 el rol del panel NO ejecuta op_*; el del operador sí, y no lee tablas', opciones, () => {
  const panel = psql(`SET LOCAL ROLE prisma_herramientas; SELECT herramientas.op_listar();`)
  assert.equal(panel.ok, false); assert.match(panel.out, /permission denied/)
  const op = psql(`${PREP} SET LOCAL ROLE prisma_herramientas_op; SELECT 'n:' || jsonb_array_length(herramientas.op_listar());`)
  assert.ok(op.ok, op.out); assert.match(op.out, /n:2/)
  const tabla = psql(`SET LOCAL ROLE prisma_herramientas_op; SELECT count(*) FROM herramientas.cuenta;`)
  assert.equal(tabla.ok, false); assert.match(tabla.out, /permission denied/)
  const persona = psql(`SET LOCAL ROLE prisma_herramientas_op; SELECT herramientas.rol_en(gen_random_uuid());`)
  assert.equal(persona.ok, false); assert.match(persona.out, /permission denied/)
  const g = psql(`SELECT 'bypass:' || string_agg(rolbypassrls::text, ',') FROM pg_roles WHERE rolname IN ('prisma_herramientas', 'prisma_herramientas_op');
    SELECT 'fuera:' || count(*) FROM information_schema.role_table_grants WHERE grantee = 'prisma_herramientas_op';`)
  assert.ok(g.ok, g.out); assert.match(g.out, /bypass:false,false/); assert.match(g.out, /fuera:0/)
})

test('I-5 cambio de rol por herramienta (op_fijar_rol_app por el rol del operador): fija, vuelve a NULL, miembro inexistente → error', opciones, () => {
  const r = psql(`${PREP} SET LOCAL ROLE prisma_herramientas_op;
    SELECT herramientas.op_fijar_rol_app(:'a_o_id', :'adm', 'contabilidad', 'dueno', 'op@prueba.test');
    RESET ROLE;
    SELECT 'rol_app:' || rol_app || ':' || propagacion FROM herramientas.miembro_herramienta WHERE persona_id = :'adm';
    SET LOCAL ROLE prisma_herramientas_op;
    SELECT herramientas.op_fijar_rol_app(:'a_o_id', :'adm', 'contabilidad', NULL, 'op@prueba.test');
    RESET ROLE;
    SELECT 'nulo:' || (rol_app IS NULL) FROM herramientas.miembro_herramienta WHERE persona_id = :'adm';`)
  assert.ok(r.ok, r.out)
  assert.match(r.out, /rol_app:dueno:pendiente/); assert.match(r.out, /nulo:true/)
  const mal = psql(`${PREP} SET LOCAL ROLE prisma_herramientas_op; SELECT herramientas.op_fijar_rol_app(:'a_o_id', gen_random_uuid(), 'contabilidad', 'gestor', 'op@prueba.test');`)
  assert.equal(mal.ok, false); assert.match(mal.out, /miembro_no_existe/)
})

test('CEPO OTP: gastado no revive (usado_en → NULL), los intentos no bajan, y reservar/gastar normal funciona', opciones, () => {
  const ins = `SET LOCAL ROLE prisma_herramientas;
    INSERT INTO herramientas.acceso_otp (proposito, email_hash, codigo_hash, ip, envio) VALUES ('acceso','e','c','1.1.1.1','enviado');
    SELECT id AS otp FROM herramientas.acceso_otp WHERE email_hash = 'e' \\gset
    UPDATE herramientas.acceso_otp SET intentos = intentos + 1 WHERE id = :'otp' AND usado_en IS NULL AND intentos < 5;
    UPDATE herramientas.acceso_otp SET usado_en = now() WHERE id = :'otp' AND usado_en IS NULL;
    SELECT 'gastado:' || (usado_en IS NOT NULL) || ':' || intentos FROM herramientas.acceso_otp WHERE id = :'otp';`
  const ok = psql(ins)
  assert.ok(ok.ok, ok.out); assert.match(ok.out, /gastado:true:1/)
  const revive = psql(`${ins} UPDATE herramientas.acceso_otp SET usado_en = NULL WHERE id = :'otp';`)
  assert.equal(revive.ok, false); assert.match(revive.out, /ya consumido/)
  const baja = psql(`SET LOCAL ROLE prisma_herramientas;
    INSERT INTO herramientas.acceso_otp (proposito, email_hash, codigo_hash, ip, envio, intentos) VALUES ('acceso','e2','c','1.1.1.1','enviado', 3);
    UPDATE herramientas.acceso_otp SET intentos = 0 WHERE email_hash = 'e2';`)
  assert.equal(baja.ok, false); assert.match(baja.out, /solo avanza/)
})
