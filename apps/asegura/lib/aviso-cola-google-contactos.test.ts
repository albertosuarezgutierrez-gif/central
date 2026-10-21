import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoColaGoogle, textoAvisoColaGoogle, UMBRAL_DIAS_AVISO_COLA } from './aviso-cola-google-contactos.ts'

const AHORA = new Date('2026-10-21T09:00:00Z')
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000)

test('sin pendientes: nada que avisar', () => {
  assert.equal(avisoColaGoogle([], AHORA), null)
})
test('pendientes solo de fichas sabidamente no en vigor: nada, por antiguas que sean', () => {
  assert.equal(avisoColaGoogle([{ creadoEn: haceDias(30), enVigor: false }], AHORA), null)
})
test('en vigor con menos de 3 días: nada', () => {
  assert.equal(avisoColaGoogle([{ creadoEn: haceDias(2.9), enVigor: true }], AHORA), null)
})
test('en vigor con 3 días justos: avisa', () => {
  assert.equal(UMBRAL_DIAS_AVISO_COLA, 3)
  assert.deepEqual(avisoColaGoogle([{ creadoEn: haceDias(3), enVigor: true }], AHORA), { total: 1, enVigor: 1, sinConfirmar: 0, masAntigua_dias: 3 })
})
test('cuenta total, en vigor y la más antigua entre las que avisan', () => {
  const r = avisoColaGoogle([
    { creadoEn: haceDias(16), enVigor: true },
    { creadoEn: haceDias(40), enVigor: false },
    { creadoEn: haceDias(1), enVigor: true },
  ], AHORA)
  assert.deepEqual(r, { total: 3, enVigor: 2, sinConfirmar: 0, masAntigua_dias: 16 })
})
test('enVigor desconocido (null) NO se trata como no-en-vigor: avisa y lo dice aparte', () => {
  const r = avisoColaGoogle([{ creadoEn: haceDias(5), enVigor: null }], AHORA)
  assert.deepEqual(r, { total: 1, enVigor: 0, sinConfirmar: 1, masAntigua_dias: 5 })
  assert.match(textoAvisoColaGoogle(r!, 'https://x.test'), /sin poder confirmar/)
})
test('null reciente y en vigor viejo: la antigüedad sale solo de las que disparan', () => {
  const r = avisoColaGoogle([{ creadoEn: haceDias(1), enVigor: null }, { creadoEn: haceDias(4), enVigor: true }], AHORA)
  assert.equal(r?.masAntigua_dias, 4)
})
test('el texto lleva cifras y enlace, y ningún dato personal', () => {
  const t = textoAvisoColaGoogle({ total: 7, enVigor: 5, sinConfirmar: 0, masAntigua_dias: 16 }, 'https://plataforma.test/')
  assert.match(t, /7 pendientes \(5 de clientes en vigor\).*16 días/)
  assert.ok(t.endsWith('https://plataforma.test/correduria/google-contactos'))
  assert.doesNotMatch(t, /sin poder confirmar/)
})
