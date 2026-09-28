// Cepos de «Revisa tus datos» (28/09/2026). Puro: corre sin prisma generate.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  avisoAceptacion, avisoDatosIncorrectos, enlaceFichaCliente, enmascararDocumento, leerDatosCotizados, TEXTO_CONFIRMACION_DATOS,
} from './datos-cotizados.ts'

// La forma EXACTA que construye `construirPeticionAuto` (persona.ts): el mismo objeto en holder,
// owner y primaryDriver cuando conduce el tomador.
const persona = {
  identificationDocument: { type: { id: 'Dni' }, id: '12345678Z' },
  name: 'Pilar', surname: 'Franco', surname2: 'Ruz', birthDate: '1970-05-04',
  gender: { id: 'Female' }, maritalStatus: { id: 'Married' }, phones: [{ number: '600000000', primary: true }],
  drivingLicenses: [{ type: { id: 'B' }, date: '1990-02-01', issuingZone: { id: 'Spain' } }],
  addresses: [{ postalCode: '41003', town: { id: 41091 }, primary: true }],
}
const auto = {
  insuranceLine: { id: 'Car' }, effectiveDate: '2026-10-01', holder: persona,
  risk: {
    vehicle: { code: '0123456' }, registrationPlate: '1234ABC', registrationDate: '2015-06-30', purchaseDate: '2015-06-30',
    kilometersPerYear: 12000, circulationAddress: { postalCode: '41003', town: { id: 41091 } }, garageType: { id: 'CommunalParking' },
    lightTrailer: false, owner: persona, primaryDriver: persona, previouslyInsured: true,
    previousInsurance: { totalYearsInsured: 10, yearsWithoutAccidents: 10 },
  },
}

const todo = (d: ReturnType<typeof leerDatosCotizados>) => (d.estado === 'ok' ? d.texto + JSON.stringify(d.grupos) : '')

test('🪤 el DNI NUNCA sale completo: ni en los grupos, ni en el texto firmado, ni en el Telegram', () => {
  const d = leerDatosCotizados(auto, 'auto')
  assert.equal(d.estado, 'ok')
  assert.doesNotMatch(todo(d), /12345678/)
  assert.match(todo(d), /\*\*\*78Z/)
  if (d.estado !== 'ok') return
  const tg = avisoAceptacion({
    tomador: 'Pilar Franco Ruz', ramo: 'auto', compania: 'Allianz', producto: 'Auto', primaEur: 321.5, franquiciaEur: null,
    datos: d, anulacionCompania: null, sinAnulacion: null, enlaceFicha: enlaceFichaCliente('c1'),
  })
  assert.doesNotMatch(tg, /12345678/)
  assert.equal(enmascararDocumento('12345678Z'), '***78Z')
  assert.equal(enmascararDocumento(' 12.345.678-z '), '***78Z')
  assert.equal(enmascararDocumento('X12'), '***')
})

test('🪤 un dato ausente NO se inventa: no hay fila, ni «no», ni cero', () => {
  const sinVehiculo = structuredClone(auto) as Record<string, any>
  delete sinVehiculo.risk.garageType
  delete sinVehiculo.risk.registrationDate
  delete sinVehiculo.risk.kilometersPerYear
  delete sinVehiculo.holder.birthDate
  const d = leerDatosCotizados(sinVehiculo, 'auto')
  assert.equal(d.estado, 'ok')
  const t = todo(d)
  assert.doesNotMatch(t, /Garaje|duerme|matriculación|Kilómetros|nacimiento/)
  // Marca y modelo no viajan en la petición (solo el código Base7): no se pintan.
  assert.doesNotMatch(t, /Marca y modelo/)
  // Una fecha con forma rara tampoco se pinta.
  const rara = structuredClone(auto) as Record<string, any>
  rara.risk.registrationDate = '30/06/2015'
  assert.doesNotMatch(todo(leerDatosCotizados(rara, 'auto')), /matriculación/)
})

test('🪤 sin tomador legible → ilegible (y con eso no se autoriza nada)', () => {
  assert.equal(leerDatosCotizados(null).estado, 'ilegible')
  assert.equal(leerDatosCotizados({}).estado, 'ilegible')
  assert.equal(leerDatosCotizados({ holder: { name: 'Pilar' } }).estado, 'ilegible')
  assert.equal(leerDatosCotizados('texto').estado, 'ilegible')
})

test('auto: tomador con carnet, vehículo, garaje traducido y CP; la huella es estable', () => {
  const d = leerDatosCotizados(auto, 'auto')
  assert.equal(d.estado, 'ok')
  if (d.estado !== 'ok') return
  const t = d.texto
  assert.match(t, /Nombre: Pilar Franco Ruz/)
  assert.match(t, /Fecha de nacimiento: 04\/05\/1970/)
  assert.match(t, /Fecha del carnet: 01\/02\/1990 \(carnet B\)/)
  assert.match(t, /Matrícula: 1234ABC/)
  assert.match(t, /Fecha de matriculación: 30\/06\/2015/)
  assert.match(t, /Garaje comunitario/)
  assert.match(t, /Código postal de circulación: 41003/)
  assert.match(t, /Kilómetros al año: 12\.000/)
  assert.doesNotMatch(t, /Conductor habitual/) // conduce el tomador
  assert.equal(d.huella, (leerDatosCotizados(auto, 'auto') as { huella: string }).huella)
})

test('auto: conductor habitual DISTINTO del tomador sale en su grupo, con su DNI enmascarado', () => {
  const otro = { ...persona, name: 'Juan', surname: 'Pérez', surname2: undefined, identificationDocument: { id: '87654321X' } }
  const tomador = { ...persona, drivingLicenses: undefined }
  const p = { ...auto, holder: tomador, risk: { ...auto.risk, owner: tomador, primaryDriver: otro } }
  const d = leerDatosCotizados(p, 'auto')
  assert.equal(d.estado, 'ok')
  if (d.estado !== 'ok') return
  const c = d.grupos.find((g) => g.titulo === 'Conductor habitual')
  assert.ok(c, 'hay grupo de conductor habitual')
  assert.deepEqual(c.filas.find((f) => f.etiqueta === 'DNI/NIE'), { etiqueta: 'DNI/NIE', valor: '***21X' })
  assert.ok(c.filas.some((f) => f.etiqueta === 'Fecha del carnet'))
  // Un garaje que no conocemos se enseña con su código, sin traducirlo a ojo.
  const g = leerDatosCotizados({ ...p, risk: { ...p.risk, garageType: { id: 'Xyz' } } }, 'auto')
  assert.match(todo(g), /«Xyz» \(código de la compañía\)/)
})

test('hogar: dirección, CP, m², año y capitales en formato español', () => {
  const hogar = {
    effectiveDate: '2026-10-01', holder: { ...persona, drivingLicenses: undefined },
    risk: {
      address: { postalCode: '41002', town: { id: 1 }, roadType: { id: 'CL' }, roadName: 'San Vicente', roadNumber: '40', floor: '2', door: '14' },
      yearBuilt: 1994, floorArea: 76, buildingsLimit: 120000, contentsLimit: 25000,
    },
  }
  const d = leerDatosCotizados(hogar, 'hogar')
  assert.equal(d.estado, 'ok')
  const t = todo(d)
  assert.match(t, /Dirección: San Vicente, 40, planta 2, puerta 14/)
  assert.match(t, /Código postal: 41002/)
  assert.match(t, /Superficie: 76 m²/)
  assert.match(t, /Año de construcción: 1994/)
  assert.match(t, /Capital de continente: 120\.000,00€/)
  assert.doesNotMatch(t, /carnet|Matrícula/)
})

test('los avisos de Telegram escapan el HTML y enlazan a la ficha con la pestaña de oportunidades', () => {
  const d = leerDatosCotizados(auto, 'auto')
  if (d.estado !== 'ok') throw new Error('no ok')
  const tg = avisoAceptacion({
    tomador: 'A<b>&', ramo: 'auto', compania: 'Allianz', producto: 'Auto Plus', primaEur: 1234.5, franquiciaEur: 300,
    datos: d, anulacionCompania: 'Mapfre', sinAnulacion: null, enlaceFicha: enlaceFichaCliente('abc'),
  })
  assert.match(tg, /A&lt;b&gt;&amp;/)
  assert.match(tg, /Allianz · Auto Plus — 1\.234,50€\/año/)
  assert.match(tg, /Franquicia: 300,00€/)
  assert.match(tg, /https:\/\/plataforma-ten-flame\.vercel\.app\/correduria\/cliente\/abc\?tab=oportunidades/)
  assert.ok(tg.includes(TEXTO_CONFIRMACION_DATOS))
  const sinFranquicia = avisoAceptacion({
    tomador: 'x', ramo: 'auto', compania: 'Allianz', producto: null, primaEur: 1, franquiciaEur: null,
    datos: d, anulacionCompania: null, sinAnulacion: null, enlaceFicha: 'u',
  })
  assert.match(sinFranquicia, /Franquicia: no la declara el producto/)
  assert.match(avisoDatosIncorrectos({ tomador: 'x', ramo: 'auto', texto: '<script>', enlaceFicha: 'u' }), /&lt;script&gt;/)
})
