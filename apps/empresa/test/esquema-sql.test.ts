// Cepos ESTÁTICOS sobre la migración (lo que tsc no ve). La prueba contra un Postgres real está en bd-real.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PLANTILLA_ENCARGO_V1 } from '../../../packages/core-herramientas/src/plantilla-encargo-v1.ts'

const sql = readFileSync(new URL('../prisma/sql/0001_herramientas.sql', import.meta.url), 'utf8')
const p2 = readFileSync(new URL('../prisma/sql/0002_plantilla_encargo_v1.sql', import.meta.url), 'utf8')
const semilla = readFileSync(new URL('../prisma/sql/0003_semilla_g2_global2.sql', import.meta.url), 'utf8')

test('rol propio NOBYPASSRLS y RLS FORZADO en TODAS las tablas del schema', () => {
  assert.match(sql, /CREATE ROLE prisma_herramientas WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS/)
  assert.match(sql, /ALTER ROLE prisma_herramientas WITH NOBYPASSRLS/)
  assert.match(sql, /FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'herramientas' LOOP\s+EXECUTE format\('ALTER TABLE herramientas\.%I ENABLE ROW LEVEL SECURITY', t\);\s+EXECUTE format\('ALTER TABLE herramientas\.%I FORCE ROW LEVEL SECURITY', t\);/)
})

test('el rol no recibe GRANT en ningún otro schema', () => {
  for (const m of sql.matchAll(/GRANT[^;]*TO prisma_herramientas/g)) {
    assert.ok(!/(contabilidad|rrhh|taller|seguros|public)\./.test(m[0]), `GRANT fuera de herramientas: ${m[0]}`)
  }
})

test('inmutables por trigger: plantilla, firma, evento, traspaso_emitido, contrato; versión solo cambia estado; envío una resolución', () => {
  assert.match(sql, /ARRAY\['plantilla', 'firma', 'evento', 'traspaso_emitido', 'contrato'\]/)
  assert.match(sql, /CREATE TRIGGER trg_contrato_version_solo_estado BEFORE UPDATE OR DELETE/)
  assert.match(sql, /CREATE TRIGGER trg_envio_una_resolucion BEFORE UPDATE OR DELETE/)
})

test('el rol solo LEE (salvo los hashes del OTP): ningún INSERT/UPDATE/DELETE sobre tablas de negocio', () => {
  const grants = [...sql.matchAll(/GRANT ([A-Z, ()a-z_]+) ON (herramientas\.[a-z_]+)/g)].map((m) => [m[1], m[2]])
  for (const [priv, tabla] of grants) {
    if (tabla === 'herramientas.acceso_otp') continue
    assert.ok(/^SELECT$/.test(priv.trim()) || priv.startsWith('EXECUTE'), `${priv} sobre ${tabla}`)
  }
})

test('hash en CHECK de plantilla, documento y certificado', () => {
  assert.equal((sql.match(/CHECK \([a-z_]*sha256 = encode\(sha256\(convert_to\(/g) ?? []).length, 3)
})

test('0002 lleva EXACTAMENTE el texto y el sha256 de PLANTILLA_ENCARGO_V1', () => {
  const sha = createHash('sha256').update(PLANTILLA_ENCARGO_V1.texto, 'utf8').digest('hex')
  assert.ok(p2.includes(`$plantilla_v1$${PLANTILLA_ENCARGO_V1.texto}$plantilla_v1$`), '0002 desfasada: node scripts/generar-plantilla-sql.mjs')
  assert.ok(p2.includes(`'${sha}'`))
})

test('la semilla no escribe ningún correo ni NIF de persona a mano', () => {
  const sinComentarios = semilla.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sinComentarios), 'correo literal en la semilla')
  assert.ok(!/'([XYZ]|\d)\d{7}[A-Z]'/.test(sinComentarios), 'NIF literal en la semilla')
})
