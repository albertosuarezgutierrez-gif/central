// Relevo del código SMS (19/10/2026): reglas puras + cepos de forma. Vistos en ROJO: código de 3/9 dígitos, entrega sin ref
// con dos peticiones abiertas, y un console.* que nombra el código en las rutas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ParCodigoSms, sellarCodigoSms } from '@central/module-tarificacion/servidor'
import {
  COMPANIAS_CODIGO_SMS,
  TTL_CODIGO_MS,
  elegirDestino,
  leerCodigo,
  leerOrdenOperador,
  leerPeticion,
  refDePeticion,
  type FilaPeticion,
} from './tarificador-codigo-sms-reglas.ts'

const APP = join(import.meta.dirname, '..')
const AHORA = Date.parse('2026-10-19T10:00:00Z')
const ID1 = 'aaaaaaa1-0000-4000-8000-000000000001'
const ID2 = 'bbbbbbb2-0000-4000-8000-000000000002'
const T1 = '11111111-2222-4333-8444-555555555555'

const fila = (id: string, o: Partial<FilaPeticion> = {}): FilaPeticion => ({
  id, trabajoId: T1, compania: 'generali', ramo: 'auto', caducaEn: new Date(AHORA + 60_000), respondida: false, vivo: true, ...o,
})

test('código: SOLO 4-8 dígitos (bordes recortados, nada más)', () => {
  for (const ok of ['1234', '12345678', ' 482913 ']) assert.ok(leerCodigo(ok), ok)
  for (const malo of ['123', '123456789', '123 456', '12a456', '+34600', '', null, 482913]) assert.equal(leerCodigo(malo), null, String(malo))
})

test('petición del worker: trabajo uuid y clave pública de 43 caracteres', () => {
  const pub = new ParCodigoSms().publica
  assert.deepEqual(leerPeticion({ trabajoId: T1.toUpperCase(), clavePublica: pub }), { ok: true, valor: { trabajoId: T1, clavePublica: pub } })
  assert.equal(leerPeticion({ trabajoId: 'x', clavePublica: pub }).ok, false)
  assert.equal(leerPeticion({ trabajoId: T1, clavePublica: 'corta' }).ok, false)
  assert.equal(leerPeticion(null).ok, false)
  assert.deepEqual([...COMPANIAS_CODIGO_SMS], ['generali'])
  assert.equal(TTL_CODIGO_MS, 10 * 60_000)
})

test('orden del operador: el motivo del rechazo NUNCA lleva el código', () => {
  const r = leerOrdenOperador({ accion: 'entregar', codigo: '12 3456' })
  assert.equal(r.ok, false)
  assert.ok(!JSON.stringify(r).includes('123456') && !JSON.stringify(r).includes('12 3456'))
  assert.deepEqual(leerOrdenOperador({ accion: 'entregar', codigo: '482913', ref: 'AAAAAAA1' }), { ok: true, valor: { accion: 'entregar', ref: 'aaaaaaa1', codigo: '482913' } })
  assert.equal(leerOrdenOperador({ accion: 'entregar', codigo: '482913', ref: 'zz' }).ok, false)
  assert.deepEqual(leerOrdenOperador({ accion: 'avisados', ids: [ID1, ID1] }), { ok: true, valor: { accion: 'avisados', ids: [ID1] } })
  assert.equal(leerOrdenOperador({ accion: 'avisados', ids: ['no'] }).ok, false)
  assert.equal(leerOrdenOperador({ accion: 'otra' }).ok, false)
})

test('destino: con ref, ESA (si sigue abierta); sin ref, solo si hay UNA abierta — nunca se adivina', () => {
  assert.equal(refDePeticion(ID1), 'aaaaaaa1')
  assert.deepEqual(elegirDestino([fila(ID1)], null, AHORA), { tipo: 'una', fila: fila(ID1) })
  assert.deepEqual(elegirDestino([fila(ID1), fila(ID2)], null, AHORA), { tipo: 'varias', n: 2 })
  assert.equal(elegirDestino([fila(ID1), fila(ID2)], 'bbbbbbb2', AHORA).tipo, 'una')
  assert.deepEqual(elegirDestino([], null, AHORA), { tipo: 'ninguna' })
  assert.deepEqual(elegirDestino([fila(ID1)], 'ccccccc3', AHORA), { tipo: 'ninguna' })
  assert.deepEqual(elegirDestino([fila(ID1, { respondida: true })], 'aaaaaaa1', AHORA), { tipo: 'cerrada', motivo: 'ya_respondida' })
  assert.deepEqual(elegirDestino([fila(ID1, { caducaEn: new Date(AHORA) })], 'aaaaaaa1', AHORA), { tipo: 'cerrada', motivo: 'caducada' })
  assert.deepEqual(elegirDestino([fila(ID1, { vivo: false })], 'aaaaaaa1', AHORA), { tipo: 'cerrada', motivo: 'trabajo_cerrado' })
  // Sin ref, las cerradas no cuentan: una abierta + una contestada = una.
  assert.equal(elegirDestino([fila(ID1), fila(ID2, { respondida: true })], null, AHORA).tipo, 'una')
})

test('el sello que guarda asegura lo abre SOLO el worker de ese trabajo', () => {
  const par = new ParCodigoSms()
  const s = sellarCodigoSms('482913', par.publica, T1)
  assert.ok(!s.includes('482913'))
  assert.equal(par.abrir(s, T1), '482913')
  assert.equal(par.abrir(s, ID1), null)
})

test('cepo de forma: no hay columna para el código en claro y nada lo loguea ni lo devuelve', () => {
  const sql = readFileSync(join(APP, 'prisma/sql/2026-10-19_tarificador_codigos_sms.sql'), 'utf8')
  const columnas = [...sql.matchAll(/^\s{2}([a-z_]+)\s+(?:uuid|text|timestamptz)/gm)].map((m) => m[1])
  assert.deepEqual(columnas.filter((c) => /codigo/.test(c!)), ['codigo_sellado'], 'solo el SELLO; nunca una columna «codigo» en claro')
  const bd = readFileSync(join(APP, 'lib/tarificador-codigo-sms.ts'), 'utf8')
  assert.ok(!/console\./.test(bd), 'la parte con BD no loguea')
  assert.match(bd, /set codigo_sellado = \$\{sello\}/, 'se guarda el SELLO')
  assert.ok(!/codigo_sellado = \$\{codigo\}|values \([^)]*\$\{codigo\}/.test(bd), 'nunca el código en claro')
  assert.ok(!/estado: 'entregado'[^}]*codigo[,\s}]/.test(bd), 'la respuesta de la entrega no devuelve el código')
  for (const r of ['app/api/operador/tarificador/codigo-sms/route.ts', 'app/api/tarificador/codigo-sms/route.ts', 'app/api/tarificador/codigo-sms/[trabajo]/route.ts']) {
    const src = readFileSync(join(APP, r), 'utf8')
    for (const l of src.split('\n').filter((x) => /console\./.test(x))) assert.ok(!/codigo\b|sello|body|valor|clavePublica/.test(l.replace(/codigo-sms|codigoErrorParaLog/g, '')), `${r}: ${l.trim()}`)
  }
})
