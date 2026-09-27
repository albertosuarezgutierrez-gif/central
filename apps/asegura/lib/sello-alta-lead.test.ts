import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.PII_ENCRYPTION_KEY ??= 'a'.repeat(64)
const { abrirSelloAltaLead, leerContenidoSello, sellarAltaLead, HORAS_SELLO } = await import('./sello-alta-lead.ts')

const alta = { nombre: 'Juan', apellidos: 'Pérez López', dni: '12345678Z', tipoPersona: 'fisica' as const, fechaNacimiento: null, fuente: 'venta_directa' as const }

test('el sello va cifrado (el DNI no se ve) y se abre dentro de asegura', () => {
  const s = sellarAltaLead(alta, 1_000)
  assert.ok(!s.includes('12345678Z'))
  assert.deepEqual(abrirSelloAltaLead(s, 2_000), alta)
})

test('caducado, del futuro, de otro propósito o manipulado → null', () => {
  const json = (o: object) => JSON.stringify({ p: 'alta-lead', v: 1, t: 0, a: alta, ...o })
  assert.equal(leerContenidoSello(json({}), HORAS_SELLO * 3_600_000 + 1), null)
  assert.equal(leerContenidoSello(json({ t: 10 * 60_000 }), 0), null)
  assert.equal(leerContenidoSello(json({ p: 'otra-cosa' }), 1), null)
  assert.equal(leerContenidoSello(json({ a: { ...alta, nombre: ' ' } }), 1), null)
  assert.equal(leerContenidoSello('no es json', 1), null)
  assert.equal(abrirSelloAltaLead('basura', 1), null)
  // un «sello» en claro (sin cifrar) no vale aunque su contenido sea perfecto
  assert.equal(abrirSelloAltaLead(json({ t: 1 }), 2), null)
  assert.deepEqual(leerContenidoSello(json({}), 1), alta)
})

test('el DNI no sale del puerto en claro y el alta con sello no se deja pisar (lee el FUENTE)', () => {
  const leer = readFileSync(fileURLToPath(new URL('./tomador-documento.ts', import.meta.url)), 'utf8')
  const dev = leer.slice(leer.indexOf('return { nombre, conDni'))
  assert.doesNotMatch(dev.split('\n')[0], /dni:/)
  // «sin hash» no es «no está»: sin hash no se busca por DNI (queda null)
  assert.match(leer, /if \(c && alta\.dni && computeDniLookupHash\(alta\.dni\)\)/)
  const cli = readFileSync(fileURLToPath(new URL('../app/api/operador/cliente/route.ts', import.meta.url)), 'utf8')
  assert.match(cli, /nombre: a\.nombre, apellidos: a\.apellidos, dni: a\.dni \?\? undefined/)
  assert.match(cli, /forzar: false/)
})

test('sin clave PII no se sella (el DNI no sale en claro)', async () => {
  const guardada = process.env.PII_ENCRYPTION_KEY
  delete process.env.PII_ENCRYPTION_KEY
  const prev = process.env.NODE_ENV
  try {
    assert.throws(() => sellarAltaLead(alta, 1))
  } finally {
    process.env.PII_ENCRYPTION_KEY = guardada
    ;(process.env as Record<string, string | undefined>).NODE_ENV = prev
  }
})

test('palabras del nombre: sin acentos, sin comas ni partículas', async () => {
  const { palabrasNombre } = await import('./palabras-nombre.ts')
  assert.deepEqual(palabrasNombre('RUIZ GIL, José de la Peña'), ['ruiz', 'gil', 'jose', 'pena'])
})

test('la pista de la matrícula nunca convierte «no se pudo mirar por nombre» (null) en «no hay» ([]) (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('./tomador-documento.ts', import.meta.url)), 'utf8')
  assert.match(src, /if \(nuevas\.length > 0\) posibles = \[\.\.\.\(posibles \?\? \[\]\), \.\.\.nuevas\]/)
})
