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
