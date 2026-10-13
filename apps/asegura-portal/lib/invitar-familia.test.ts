// Cepos de «Invita a tu familia»: texto neutro, token hasheado, tope en BD, aviso sin datos personales.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

import {
  MAX_ENLACES_DIA,
  decidirUso,
  enlaceFamilia,
  esIdentidadNueva,
  estadoEnlace,
  mensajeAvisoFamilia,
  resumenFamilia,
  textoCompartirFamilia,
  textoEsNeutro,
  textoSinCamposProhibidos,
} from './invitar-familia.ts'

const ahora = new Date('2026-10-13T12:00:00Z')
const fuente = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')

test('el texto que se comparte es neutro y no nombra campos prohibidos', () => {
  const t = textoCompartirFamilia()
  for (const s of [t.title, t.text, mensajeAvisoFamilia()]) assert.ok(textoSinCamposProhibidos(s), s)
  for (const s of [t.title, t.text]) assert.ok(textoEsNeutro(s), s)
})

test('el detector de incentivos muerde', () => {
  for (const malo of ['Gana un premio', 'Un 10% de descuento', 'Te sale gratis', 'te regalo 20 €', 'participa en el sorteo']) {
    assert.equal(textoEsNeutro(malo), false, malo)
  }
  assert.equal(textoSinCamposProhibidos('tu matricula y compania'), false)
  assert.ok(CAMPOS_PROHIBIDOS_EN_INVITACION.length > 0)
})

test('el enlace exige https y no inventa dominio', () => {
  assert.equal(enlaceFamilia('abc', undefined), null)
  assert.equal(enlaceFamilia('abc', 'http://x.es'), null)
  assert.equal(enlaceFamilia('abc', 'https://portal.es/'), 'https://portal.es/invitacion/familia/abc')
})

test('estado del enlace: viva, caducada, revocada, agotada', () => {
  const base = { caducaEn: new Date('2026-11-01T00:00:00Z'), revocadaEn: null, max: 2, usos: 0 }
  assert.equal(estadoEnlace(base, ahora), 'viva')
  assert.equal(estadoEnlace({ ...base, caducaEn: ahora }, ahora), 'caducada')
  assert.equal(estadoEnlace({ ...base, revocadaEn: ahora }, ahora), 'revocada')
  assert.equal(estadoEnlace({ ...base, usos: 2 }, ahora), 'agotada')
})

test('solo cuenta como invitado quien es identidad NUEVA y no el creador', () => {
  const nueva = new Date(ahora.getTime() - 10 * 60_000)
  const vieja = new Date(ahora.getTime() - 3 * 24 * 3600_000)
  const d = { estado: 'viva' as const, creadorId: 'a', identidadId: 'b', identidadCreadaEn: nueva, ahora }
  assert.equal(decidirUso(d), 'registrar')
  assert.equal(decidirUso({ ...d, identidadCreadaEn: vieja }), 'ya_existia')
  assert.equal(decidirUso({ ...d, identidadId: 'a' }), 'es_propio')
  assert.equal(decidirUso({ ...d, estado: 'caducada' }), 'enlace_no_vale')
  assert.equal(esIdentidadNueva(new Date(ahora.getTime() + 3600_000), ahora), false)
})

test('contador: solo cifras, sin negativos ni NaN', () => {
  assert.deepEqual(resumenFamilia({ enlaces: 2, usosEnlaces: 3, correosPresento: 1, correosPresentoAceptados: 1 }), { enviadas: 3, aceptadas: 4 })
  assert.deepEqual(resumenFamilia({ enlaces: -1, usosEnlaces: NaN, correosPresento: 0, correosPresentoAceptados: 0 }), { enviadas: 0, aceptadas: 0 })
  assert.deepEqual(Object.keys(resumenFamilia({ enlaces: 1, usosEnlaces: 0, correosPresento: 0, correosPresentoAceptados: 0 })).sort(), ['aceptadas', 'enviadas'])
})

test('aviso al corredor: sin datos personales', () => {
  const m = mensajeAvisoFamilia()
  assert.match(m, /Nuevo usuario invitado por un cliente/)
  assert.doesNotMatch(m, /@|\+\d|nombre|correo:/i)
})

test('capa BD: token hasheado, tope en BD, nunca el token en claro en la fila ni en la respuesta de uso', () => {
  const bd = fuente('lib/invitar-familia-bd.ts')
  assert.match(bd, /tokenHash:\s*hashCanal\(token\)/)
  assert.doesNotMatch(bd, /tokenHash:\s*token\b/)
  assert.match(bd, /MAX_ENLACES_DIA/)
  assert.match(bd, /portalInvitacionEnlace\.count/)
  assert.ok(MAX_ENLACES_DIA > 0 && MAX_ENLACES_DIA <= 20)
  assert.doesNotMatch(bd, /destinatario|email|nombre/i, 'el aviso y la tabla no llevan datos del invitado')
})

test('🪤 tope de 10 usos ATÓMICO: bloqueo de la fila del enlace, recuento y alta en la MISMA transacción', () => {
  const bd = fuente('lib/invitar-familia-bd.ts')
  const i = bd.indexOf('prisma.$transaction(async (tx)')
  assert.ok(i !== -1, 'el alta del uso no va en una transacción')
  const tx = bd.slice(i, bd.indexOf('})', bd.indexOf('return true', i)))
  const bloqueo = tx.search(/FROM seguros\.portal_invitacion_enlace WHERE id = \$\{fila\.id\}::uuid FOR UPDATE/)
  const cuenta = tx.indexOf('tx.portalInvitacionEnlaceUso.count(')
  const alta = tx.indexOf('tx.portalInvitacionEnlaceUso.create(')
  assert.ok(bloqueo !== -1 && bloqueo < cuenta && cuenta < alta, 'orden: FOR UPDATE → count → create, todo dentro')
  assert.match(tx, /if \(usos >= fila\.maxUsos\) return false/)
  // Fuera de la transacción no queda ningún alta suelta del uso.
  assert.equal((bd.match(/portalInvitacionEnlaceUso\.create\(/g) ?? []).length, 1)
})

test('rutas: la de uso responde igual pase lo que pase y la identidad sale de la cookie', () => {
  const usar = fuente('app/api/invitaciones/familia/usar/route.ts')
  assert.match(usar, /requireIdentidad\(\)/)
  assert.doesNotMatch(usar, /identidadId\s*:\s*parsed/)
  const raiz = fuente('app/api/invitaciones/familia/route.ts')
  assert.match(raiz, /requireIdentidad\(\)/)
  assert.doesNotMatch(raiz, /otorganteClienteId|polizaId/)
})
