import test from 'node:test'
import assert from 'node:assert/strict'
import { costePack, cuadroPack, decidirFamiliaAllianz, tienePolizaAllianzEnVigor, type PolizaParaFamilia } from './pack-vehiculos.ts'

test('cuadro: suma por compañía solo donde sale en los dos; usa el precio más barato de cada lado', () => {
  const coche = [
    { compania: 'Allianz', producto: 'Auto Terceros', primaEur: 300 },
    { compania: 'Allianz', producto: 'Auto Todo Riesgo', primaEur: 520 },
    { compania: 'Mapfre', primaEur: 280 },
    { compania: 'Zurich', primaEur: 250 },
  ]
  const moto = [
    { compania: 'Allianz Motos', primaEur: 150 },
    { compania: 'Mapfre', primaEur: 90.5 },
    { compania: 'Generali', primaEur: 80 },
  ]
  const c = cuadroPack(coche, moto)
  assert.deepEqual(c.filas.map((f) => [f.compania, f.total]), [['Mapfre', 370.5], ['Allianz', 450]])
  assert.equal(c.filas[1].a.producto, 'Auto Terceros')
  assert.deepEqual(c.soloEnUno.map((s) => s.compania).sort(), ['Generali', 'Zurich'])
})

test('cuadro: un precio sin prima (null/0) no suma: la compañía se queda fuera, no vale 0', () => {
  const c = cuadroPack([{ compania: 'Mapfre', primaEur: 280 }], [{ compania: 'Mapfre', primaEur: null }, { compania: 'Mapfre', primaEur: 0 }])
  assert.deepEqual(c.filas, [])
  assert.deepEqual(c.soloEnUno, [{ compania: 'Mapfre', enA: true, enB: false }])
})

test('cuadro vacío si una de las listas no trae nada', () => {
  assert.deepEqual(cuadroPack([], [{ compania: 'Mapfre', primaEur: 90 }]).filas, [])
})

test('coste del pack: una llamada por vehículo; sin precio de llamada, null', () => {
  assert.equal(costePack(0.5, 2), 1)
  assert.equal(costePack(0.5, 1), 0.5)
  assert.equal(costePack(null, 2), null)
  assert.equal(costePack(Number.NaN, 2), null)
})

const base: PolizaParaFamilia = { aseguradora: 'Allianz Seguros', estado: 'activa', viva: true, confirmadaCima: true, sustituida: false }

test('póliza Allianz en vigor: cartera viva, confirmada, vigente y no sustituida', () => {
  assert.equal(tienePolizaAllianzEnVigor([base]), true)
  assert.equal(tienePolizaAllianzEnVigor([{ ...base, aseguradora: 'Mapfre' }]), false)
  assert.equal(tienePolizaAllianzEnVigor([{ ...base, estado: 'cancelada' }]), false)
  assert.equal(tienePolizaAllianzEnVigor([{ ...base, viva: false }]), false, 'volcado histórico = lead')
  assert.equal(tienePolizaAllianzEnVigor([{ ...base, confirmadaCima: false }]), false, 'emitida y sin confirmar no cuenta')
  assert.equal(tienePolizaAllianzEnVigor([{ ...base, sustituida: true }]), false)
  assert.equal(tienePolizaAllianzEnVigor([]), false)
})

test('familia en Allianz: con el pack encendido, sí con cartera Allianz o con pack tarifado', () => {
  assert.equal(decidirFamiliaAllianz({ packActivo: true, packTarificado: false, carteraAllianz: true }).familia, true)
  assert.equal(decidirFamiliaAllianz({ packActivo: true, packTarificado: true, carteraAllianz: false }).familia, true)
  assert.equal(decidirFamiliaAllianz({ packActivo: true, packTarificado: false, carteraAllianz: false }).familia, null)
})

test('familia en Allianz: pack APAGADO no toca nada, ni con cartera Allianz ni con otro tarifado', () => {
  assert.equal(decidirFamiliaAllianz({ packActivo: false, packTarificado: false, carteraAllianz: true }).familia, null)
  assert.equal(decidirFamiliaAllianz({ packActivo: false, packTarificado: true, carteraAllianz: true }).familia, null)
})

test('familia en Allianz: cartera ilegible no autoriza el sí (solo el pack tarifado lo hace)', () => {
  const r = decidirFamiliaAllianz({ packActivo: true, packTarificado: false, carteraAllianz: null })
  assert.equal(r.familia, null)
  assert.match(r.motivo, /no se ha podido mirar/)
  assert.equal(decidirFamiliaAllianz({ packActivo: true, packTarificado: true, carteraAllianz: null }).familia, true)
})
