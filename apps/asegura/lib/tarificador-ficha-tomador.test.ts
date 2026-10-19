// Carné de moto de la `fichaTomador` (19/10/2026): la MISMA regla que plataforma — el más antiguo de A/A1/A2. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichaTomadorAutoDeFicha } from './tarificador-ficha-tomador.ts'

const fila = (carnets: { tipo: string; fechaCarnet: string }[]) => ({
  dni: null, direccion: null, codigoPostal: null, ciudad: null, provincia: null, fechaNacimiento: '1980-01-02', tipoPersona: 'fisica' as const, carnets,
})
const HOY = new Date('2026-10-19T00:00:00Z')

test('fichaTomador moto: elige el carné MÁS ANTIGUO de A/A1/A2, no el primero por rango', () => {
  const r = fichaTomadorAutoDeFicha(fila([{ tipo: 'A', fechaCarnet: '2010-06-30' }, { tipo: 'A2', fechaCarnet: '2005-05-05' }, { tipo: 'B', fechaCarnet: '1999-03-04' }]), (v) => v, 'moto', HOY)
  assert.equal(r?.tipoCarnet, 'A2')
  assert.equal(r?.fechaCarnet, '2005-05-05')
})
