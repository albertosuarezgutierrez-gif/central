// Cepos de la sesión MANUAL del tarificador, lado asegura (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMPANIAS_SESION,
  MAX_CADUCIDAD_MS,
  MAX_CUERPO_BYTES,
  MAX_TOKEN_CHARS,
  MENSAJE_SIN_ACTIVAR,
  SQL_SESIONES,
  clasificarErrorBd,
  codigoErrorParaLog,
  cuerpoExcedeTope,
  estaCaducada,
  leerCompania,
  leerGuardado,
} from './tarificador-sesion-reglas.ts'
// El CLIENTE real (worker): el token que sella es el que esta ruta tiene que aceptar.
import { sellarSesion } from '../../../services/tarificador-rpa/src/boveda-sesion.ts'

const APP = join(import.meta.dirname, '..')
const AHORA = Date.parse('2026-10-07T10:00:00Z')
const TOKEN = `v1.${'A'.repeat(16)}.${'b'.repeat(64)}`
const cuerpo = (o: unknown) => JSON.stringify(o)
const enHoras = (h: number) => new Date(AHORA + h * 3_600_000).toISOString()

test('compañía: lista blanca de slugs, minúsculas y sin rarezas', () => {
  assert.ok(COMPANIAS_SESION.has('generali') && COMPANIAS_SESION.has('allianz'))
  assert.deepEqual(leerCompania('generali'), { ok: true, valor: 'generali' })
  assert.deepEqual(leerCompania(' Generali '), { ok: true, valor: 'generali' })
  assert.equal(leerCompania('inventada').ok, false)
  for (const malo of ['', '../generali', 'gen%2Fali', 'generali;drop', '%E0%A4%A', 'a'.repeat(41), null]) {
    const r = leerCompania(malo)
    assert.equal(r.ok, false, `debería rechazar ${String(malo)}`)
    if (!r.ok) assert.equal(r.status, 400)
  }
})

test('PUT válido: el token que sella el worker y la caducaEn ISO que manda almacenHttp', () => {
  const { token, caduca } = sellarSesion({ cookies: [], origins: [] } as never, { compania: 'generali', clave: randomBytes(32), ahora: AHORA, maxMs: 8 * 3_600_000 })
  const r = leerGuardado(cuerpo({ token, caducaEn: new Date(caduca).toISOString() }), AHORA)
  assert.ok(r.ok, JSON.stringify(r))
  if (r.ok) assert.equal(r.valor.caducaEn.getTime(), caduca)
})

test('PUT: forma del token', () => {
  for (const [body, motivo] of [
    ['no es json', 'json_invalido'],
    [cuerpo([1]), 'json_invalido'],
    [cuerpo({ caducaEn: enHoras(1) }), 'token_ausente'],
    [cuerpo({ token: 'v2.xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy', caducaEn: enHoras(1) }), 'token_formato'],
    [cuerpo({ token: `v1.${'A'.repeat(16)}.con espacio y más`, caducaEn: enHoras(1) }), 'token_formato'],
  ] as const) {
    const r = leerGuardado(body, AHORA)
    assert.deepEqual(r.ok ? null : [r.status, r.motivo], [400, motivo])
  }
})

test('PUT: tamaño — token y cuerpo con tope (413)', () => {
  const grande = `v1.${'A'.repeat(16)}.${'b'.repeat(MAX_TOKEN_CHARS)}`
  const r = leerGuardado(cuerpo({ token: grande, caducaEn: enHoras(1) }), AHORA)
  assert.deepEqual(r.ok ? null : [r.status, r.motivo], [413, 'token_grande'])
  const justo = `v1.${'A'.repeat(16)}.${'b'.repeat(MAX_TOKEN_CHARS - 20)}`
  assert.equal(leerGuardado(cuerpo({ token: justo, caducaEn: enHoras(1) }), AHORA).ok, true)
  const r2 = leerGuardado('x'.repeat(MAX_CUERPO_BYTES + 1), AHORA)
  assert.deepEqual(r2.ok ? null : [r2.status, r2.motivo], [413, 'cuerpo_grande'])
  assert.equal(cuerpoExcedeTope(String(MAX_CUERPO_BYTES + 1)), true)
  assert.equal(cuerpoExcedeTope(String(MAX_CUERPO_BYTES)), false)
  assert.equal(cuerpoExcedeTope(null), false)
  // El CHECK del SQL usa el mismo tope.
  assert.match(readFileSync(join(APP, 'prisma/sql/2026-10-07e_tarificador_sesiones.sql'), 'utf8'), new RegExp(`BETWEEN 20 AND ${MAX_TOKEN_CHARS}\\b`))
})

test('PUT: caducidad — futura y como mucho 25 h', () => {
  for (const [caducaEn, motivo] of [
    [undefined, 'caduca_invalida'],
    ['mañana', 'caduca_invalida'],
    [enHoras(0), 'caduca_pasada'],
    [enHoras(-1), 'caduca_pasada'],
    [new Date(AHORA + MAX_CADUCIDAD_MS + 1).toISOString(), 'caduca_excesiva'],
  ] as const) {
    const r = leerGuardado(cuerpo({ token: TOKEN, caducaEn }), AHORA)
    assert.deepEqual(r.ok ? null : [r.status, r.motivo], [400, motivo], String(caducaEn))
  }
  assert.equal(leerGuardado(cuerpo({ token: TOKEN, caducaEn: enHoras(24) }), AHORA).ok, true)
})

test('ningún motivo de rechazo lleva el token', () => {
  const r = leerGuardado(cuerpo({ token: TOKEN, caducaEn: enHoras(-1) }), AHORA)
  assert.ok(!r.ok && !JSON.stringify(r).includes(TOKEN.slice(4, 20)))
})

test('caducada: en el instante exacto ya lo está; fecha ilegible = caducada (no se sirve)', () => {
  assert.equal(estaCaducada(new Date(AHORA + 1), AHORA), false)
  assert.equal(estaCaducada(new Date(AHORA), AHORA), true)
  assert.equal(estaCaducada(new Date(AHORA - 1), AHORA), true)
  assert.equal(estaCaducada(new Date('nada'), AHORA), true)
  assert.equal(estaCaducada(null, AHORA), true)
})

test('errores de BD: tabla o GRANT ausentes → sesion_sin_activar con el SQL; el resto, error genérico', () => {
  assert.deepEqual(clasificarErrorBd({ code: 'P2010', meta: { code: '42P01', message: 'relation "x" does not exist' } }), { status: 503, estado: 'sesion_sin_activar', mensaje: MENSAJE_SIN_ACTIVAR })
  assert.equal(clasificarErrorBd(new Error('permission denied for table tarificador_sesiones')).estado, 'sesion_sin_activar')
  assert.equal(clasificarErrorBd({ meta: { code: '42501' } }).estado, 'sesion_sin_activar')
  assert.deepEqual(clasificarErrorBd(new Error('connection reset')), { status: 503, estado: 'error' })
  assert.equal(clasificarErrorBd(new Error('column "blob" of relation "t" does not exist')).estado, 'error')
  assert.ok(MENSAJE_SIN_ACTIVAR.startsWith('sesion_sin_activar') && MENSAJE_SIN_ACTIVAR.includes(SQL_SESIONES))
})

test('el log de un error de BD es solo el código, nunca el mensaje (que puede traer la fila con el blob)', () => {
  const e = Object.assign(new Error(`new row violates check constraint. Failing row contains (${TOKEN})`), { code: 'P2010', meta: { code: '23514' } })
  assert.equal(codigoErrorParaLog(e), '23514')
  assert.equal(codigoErrorParaLog(new Error(TOKEN)), 'desconocido')
  assert.equal(codigoErrorParaLog({ code: TOKEN }), 'desconocido')
})

test('cepo estático: la ruta usa la auth del worker, no loguea el token y no lleva auditado()', () => {
  const ruta = readFileSync(join(APP, 'app/api/tarificador/sesion/[compania]/route.ts'), 'utf8')
  const codigo = ruta.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  for (const m of ['GET', 'PUT', 'DELETE']) {
    const cuerpoM = codigo.slice(codigo.indexOf(`export async function ${m}(`)).split('\nexport ')[0]
    assert.match(cuerpoM, /if \(!workerAutorizado\(req\)\) return/, `${m} sin la auth del worker`)
  }
  assert.ok(!/auditado\(/.test(codigo), 'puerto del worker, no de operador (como /resultado)')
  assert.ok(!/TARIFICADOR_WORKER_SECRET|process\.env/.test(codigo), 'la ruta no lee secretos: eso es workerAutorizado()/requireSecret')
  for (const l of codigo.split('\n').filter((x) => /console\./.test(x))) {
    assert.ok(!/token|texto|blob|\be\b\.message|, e\)/.test(l), `log sospechoso: ${l.trim()}`)
  }
  const bd = readFileSync(join(APP, 'lib/tarificador-sesion.ts'), 'utf8')
  assert.ok(!/console\./.test(bd), 'la capa de BD no loguea')
  assert.match(bd, /from '\.\/tenant'/)
  assert.equal((bd.match(/correduria_id = \$\{correduriaId\}::uuid/g) ?? []).length, 3, 'select y los dos delete filtran por correduría')
  assert.match(bd, /values \(\$\{correduriaId\}::uuid,/, 'el upsert escribe la correduría resuelta')
})

test('cepo SQL: GRANTs solo a prisma_seguros, RLS activada y sin políticas abiertas', () => {
  const sql = readFileSync(join(APP, 'prisma/sql/2026-10-07e_tarificador_sesiones.sql'), 'utf8')
  const sinCom = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
  assert.match(sinCom, /ENABLE ROW LEVEL SECURITY/)
  assert.ok(!/CREATE POLICY/i.test(sinCom), 'sin políticas: cerrada a quien no tenga BYPASSRLS')
  for (const g of sinCom.match(/GRANT [^;]+;/g) ?? []) assert.match(g, /TO prisma_seguros;$/, g)
  assert.match(sinCom, /REVOKE ALL ON seguros\.tarificador_sesiones FROM PUBLIC, anon, authenticated, crm_seguros;/)
  assert.match(sinCom, /UNIQUE \(correduria_id, compania\)/)
})
