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

test('I-4: rol del operador aparte (NOBYPASSRLS) y op_* SOLO para él; el panel nunca las ejecuta', () => {
  assert.match(sql, /CREATE ROLE prisma_herramientas_op WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS/)
  assert.match(sql, /ALTER ROLE prisma_herramientas_op WITH NOBYPASSRLS/)
  assert.match(sql, /IF r\.proname LIKE 'op\\_%' THEN\s+EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO prisma_herramientas_op', r\.firma\);\s+ELSE\s+EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO prisma_herramientas', r\.firma\);/)
  for (const m of sql.matchAll(/GRANT[^;]*TO prisma_herramientas_op\b[^;]*;/g)) {
    assert.ok(!/\bON (herramientas\.[a-z_]+|ALL TABLES)/.test(m[0]) || /EXECUTE ON FUNCTION/.test(m[0]), `el rol del operador no lee tablas: ${m[0]}`)
  }
})

test('I-1: contrato, versión, firma, persona y miembros SOLO para gestores (el empleado no)', () => {
  assert.match(sql, /FUNCTION herramientas\.es_miembro_gestor\(p_cuenta uuid\)[\s\S]{0,400}m\.rol IN \('dueno', 'admin', 'consulta'\)/)
  const politica = (nombre: string) => sql.match(new RegExp(`CREATE POLICY ${nombre} ON[\\s\\S]*?;`))?.[0] ?? ''
  for (const p of ['contrato_de_miembro', 'version_de_miembro', 'firma_de_miembro', 'miembro_de_miembro', 'concesion_de_miembro']) {
    assert.match(politica(p), /es_miembro_gestor\(/, `${p} debe usar es_miembro_gestor`)
  }
  for (const p of ['contrato_de_miembro', 'version_de_miembro', 'firma_de_miembro']) {
    assert.doesNotMatch(politica(p), /es_miembro\(/, `${p} no puede abrirse a cualquier miembro`)
  }
  assert.match(sql, /FUNCTION herramientas\.comparte_cuenta[\s\S]{0,400}es_miembro_gestor\(m\.cuenta_id\)/)
})

test('OTP: un código gastado no revive ni bajan los intentos (trigger)', () => {
  assert.match(sql, /CREATE TRIGGER trg_acceso_otp_solo_avanza BEFORE UPDATE OR DELETE ON herramientas\.acceso_otp/)
  assert.match(sql, /IF OLD\.usado_en IS NOT NULL THEN\s+RAISE EXCEPTION/)
  assert.match(sql, /NEW\.intentos NOT IN \(OLD\.intentos, OLD\.intentos \+ 1\)/)
})

test('I-2: la semilla identifica a cada persona por ID de ficha, nunca por nombre ni LIKE', () => {
  const codigo = semilla.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(codigo, /\bI?LIKE\b|\bSIMILAR TO\b/i, 'búsqueda por texto en la semilla')
  assert.doesNotMatch(codigo, /WHERE[^;]*\b(nombre|apellidos)\b[^;]*(=|~)/i, 'filtro por nombre en la semilla')
  for (const id of ['561af4e5-fe47-4f20-823d-c0729d9fa400', '85667270-74c3-4345-b553-153872a07e7f', '4affe1ad-899f-4949-a8bb-ec8ac8030269']) {
    assert.ok(codigo.includes(`'${id}'`), `falta el id ${id}`)
  }
  assert.match(codigo, /WHERE em\.id = c_manuel/); assert.match(codigo, /WHERE em\.id = c_javier/); assert.match(codigo, /WHERE u\.id = c_pilar/)
})
