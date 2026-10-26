import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clasificarAutorizacion, clasificarPeticion, componerPermisos, fichasImplicadas,
  type FilaAutorizacionPermiso, type FilaPeticionPermiso,
} from './portal-permisos-operador.ts'

const AHORA = new Date('2026-10-26T10:00:00Z')
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000)
const aut = (o: Partial<FilaAutorizacionPermiso>): FilaAutorizacionPermiso => ({
  id: 'a1', otorganteClienteId: 'c-otorga', autorizadoClienteId: 'c-recibe', autorizadoIdentidadId: null, alcance: 'polizas',
  otorgadoEn: dias(3), aceptadoEn: null, caducaEn: null, revocadoEn: null, revocadoPor: null, ...o,
})
const pet = (o: Partial<FilaPeticionPermiso>): FilaPeticionPermiso => ({
  id: 'p1', solicitanteClienteId: 'c-pide', destinatarioClienteId: 'c-otorga', alcance: 'polizas', creadaEn: dias(1),
  caducaEn: new Date(AHORA.getTime() + 86_400_000), concedidaEn: null, rechazadaEn: null, retiradaEn: null, ...o,
})

test('sin aceptar y sin caducar = pendiente; caducada sin aceptar NO es trabajo', () => {
  assert.equal(clasificarAutorizacion(aut({}), AHORA)?.evento, 'pendiente_aceptar')
  assert.equal(clasificarAutorizacion(aut({ caducaEn: dias(1) }), AHORA), null)
})

test('aceptada o revocada en los últimos 7 días sale; más vieja o por caducidad, no', () => {
  assert.equal(clasificarAutorizacion(aut({ aceptadoEn: dias(2) }), AHORA)?.evento, 'aceptada')
  assert.equal(clasificarAutorizacion(aut({ aceptadoEn: dias(9) }), AHORA), null)
  assert.equal(clasificarAutorizacion(aut({ aceptadoEn: dias(9), revocadoEn: dias(1), revocadoPor: 'otorgante' }), AHORA)?.evento, 'revocada')
  assert.equal(clasificarAutorizacion(aut({ revocadoEn: dias(1), revocadoPor: 'caducidad' }), AHORA), null)
  assert.equal(clasificarAutorizacion(aut({ revocadoEn: dias(8), revocadoPor: 'corredor' }), AHORA), null)
})

test('petición: solo la pendiente y viva', () => {
  assert.equal(clasificarPeticion(pet({}), AHORA)?.evento, 'peticion_pendiente')
  assert.equal(clasificarPeticion(pet({ concedidaEn: dias(0) }), AHORA), null)
  assert.equal(clasificarPeticion(pet({ caducaEn: dias(1) }), AHORA), null)
})

test('aislamiento: una ficha que no está en el mapa (otra correduría) sale sin id ni nombre', () => {
  const r = componerPermisos([aut({ autorizadoClienteId: 'c-ajena' })], [], new Map([['c-otorga', 'Ana Ruiz']]), AHORA)
  assert.equal(r.movimientos[0].deClienteId, 'c-otorga')
  assert.equal(r.movimientos[0].de, 'Ana Ruiz')
  assert.equal(r.movimientos[0].aClienteId, null)
  assert.equal(r.movimientos[0].a, null)
})

test('pendientes primero (la más antigua arriba); las recientes no cuentan como pendientes', () => {
  const r = componerPermisos(
    [aut({ id: 'acep', aceptadoEn: dias(1) }), aut({ id: 'vieja', otorgadoEn: dias(5) }), aut({ id: 'nueva', otorgadoEn: dias(1) })],
    [pet({ id: 'peti', creadaEn: dias(3) })],
    new Map(), AHORA,
  )
  assert.deepEqual(r.movimientos.map((m) => m.id), ['vieja', 'peti', 'nueva', 'acep'])
  assert.equal(r.pendientes, 3)
  assert.equal(r.recientes, 1)
})

test('las fichas implicadas salen sin repetir y sin nulos', () => {
  assert.deepEqual(fichasImplicadas([aut({ autorizadoClienteId: null, autorizadoIdentidadId: 'i1' })], [pet({ solicitanteClienteId: null })]).sort(), ['c-otorga'])
})

test('la ruta filtra por correduría en las tres lecturas, no lee NIF/IBAN/dirección y no escribe', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../app/api/operador/portal-permisos/route.ts'), 'utf8')
  // Sin comentarios: la cabecera NOMBRA lo que no se lee, y eso no es leerlo.
  const src = fuente.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.match(src, /operadorAutorizado\(req\)/)
  assert.equal((src.match(/correduriaId: correduria\.id/g) ?? []).length, 3, 'portal_autorizacion, portal_peticion_acceso y clientes')
  assert.doesNotMatch(src, /\b(dni|nif|iban|direccion|domicilio)\b/i)
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/)
})
