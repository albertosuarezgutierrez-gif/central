import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cotizacionSimulada,
  respuestaSimulada,
  primaSimulada,
  projectIdSimulado,
  riesgoDelCuerpo,
  MARCA_SIMULACION,
  PRODUCTOS_HOGAR,
  FALLOS_HOGAR,
  ANIO_REFERENCIA,
} from './simulacion.ts'

/** El caso verificado del 02/09/2026: 2º-14 de San Vicente 40 (76 m², 1994, 41002). */
const CUERPO = {
  insuranceLine: { id: 'Home' },
  effectiveDate: '2026-10-01',
  holder: { firstName: 'Jose', documentNumber: '00000000T' },
  risk: {
    address: { postalCode: '41002', town: { id: 41091 }, roadName: 'SAN VICENTE', roadNumber: '40' },
    yearBuilt: 1994,
    floorArea: 76,
    rooms: 3,
    buildingsLimit: 61000,
    contentsLimit: 12000,
    numberOfDangerousDogs: 0,
  },
}

test('la respuesta simulada pasa por el parser de verdad y sale con precios', () => {
  const c = cotizacionSimulada(CUERPO)
  assert.equal(c.precios.length, PRODUCTOS_HOGAR.length)
  assert.equal(c.fallos.length, FALLOS_HOGAR.length)
  assert.equal(c.fechaEfecto, '2026-10-01')
})

test('el id de un precio viaja como STRING: numérico, el parser lo tiraría', () => {
  const crudo = respuestaSimulada(CUERPO) as { mainQuotes: { id: unknown }[] }
  for (const q of crudo.mainQuotes) assert.equal(typeof q.id, 'string')
})

test('ningún precio simulado puede salir «firme»', () => {
  const c = cotizacionSimulada(CUERPO)
  for (const p of c.precios) assert.equal(p.firmeza, 'estimado')
})

test('la marca de simulación es el PRIMER aviso de cada precio y de cada fallo', () => {
  const c = cotizacionSimulada(CUERPO)
  for (const p of c.precios) assert.ok(p.avisos[0]?.includes(MARCA_SIMULACION))
  for (const f of c.fallos) assert.ok(f.motivo.includes(MARCA_SIMULACION))
})

test('el projectId simulado es NEGATIVO: ninguno de Codeoscopic lo es', () => {
  const c = cotizacionSimulada(CUERPO)
  assert.ok(Number(c.projectId) < 0, `projectId=${c.projectId}`)
  assert.ok(projectIdSimulado(CUERPO) < 0)
})

test('determinista: la misma entrada da siempre el mismo precio y el mismo id', () => {
  const a = cotizacionSimulada(CUERPO)
  const b = cotizacionSimulada(JSON.parse(JSON.stringify(CUERPO)))
  assert.deepEqual(
    a.precios.map((p) => [p.id, p.primaEur]),
    b.precios.map((p) => [p.id, p.primaEur]),
  )
  assert.equal(a.projectId, b.projectId)
})

test('el precio SALE de los datos del riesgo, no de un número fijo', () => {
  const grande = cotizacionSimulada({
    ...CUERPO,
    risk: { ...CUERPO.risk, floorArea: 200 },
  })
  const pequeno = cotizacionSimulada(CUERPO)
  assert.ok(grande.precios[0]!.primaEur > pequeno.precios[0]!.primaEur)

  // Más antigua ⇒ más cara (instalaciones viejas).
  const vieja = cotizacionSimulada({ ...CUERPO, risk: { ...CUERPO.risk, yearBuilt: 1900 } })
  assert.ok(vieja.precios[0]!.primaEur > pequeno.precios[0]!.primaEur)
})

test('el orden de magnitud es el de la cartera real (media 308,71€/año)', () => {
  const c = cotizacionSimulada(CUERPO)
  for (const p of c.precios) {
    assert.ok(p.primaEur > 100 && p.primaEur < 700, `${p.producto}: ${p.primaEur}`)
  }
  // La modalidad intermedia cae junto a la media real de hogar de la cartera.
  const media = c.precios[1]!.primaEur
  assert.ok(Math.abs(media - 308.71) < 60, `intermedia=${media}`)
})

test('la comparativa ejercita el caso feo: compañías que piden un dato', () => {
  const c = cotizacionSimulada(CUERPO)
  const lagun = c.fallos.find((f) => f.compania === 'Lagun Aro')
  assert.ok(lagun, 'falta el fallo de Lagun Aro')
  assert.ok(lagun!.motivo.includes('años de las ultimas reformas'))
  // Ninguna de las que fallan dio precio por otra configuración.
  for (const f of c.fallos) assert.equal(f.tambienDioPrecio, false)
})

test('una misma compañía puede dar dos precios (dos configuraciones)', () => {
  const c = cotizacionSimulada(CUERPO)
  assert.equal(c.precios.filter((p) => p.compania === 'Fiatc').length, 2)
  assert.ok(c.precios.some((p) => p.modalidad === 'FIATC Oferta BASIC' && p.categoria === 'Básico'))
})

test('un cuerpo vacío o basura no revienta: sale una cotización sin datos de riesgo', () => {
  for (const basura of [undefined, null, {}, 42, 'texto', []]) {
    const c = cotizacionSimulada(basura)
    assert.equal(c.precios.length, PRODUCTOS_HOGAR.length)
    for (const p of c.precios) assert.ok(p.primaEur > 0)
  }
})

test('la antigüedad se mide contra la FECHA DE EFECTO, no contra el reloj', () => {
  // Si mirase `new Date()`, el mismo cuerpo daría otro precio el 1 de enero.
  const r = riesgoDelCuerpo(CUERPO)
  assert.equal(r.anioEfecto, 2026)
  assert.equal(riesgoDelCuerpo({ risk: {} }).anioEfecto, ANIO_REFERENCIA)
  assert.equal(r.metrosCuadrados, 76)
  assert.equal(r.capitalContinente, 61000)
})

test('la fórmula es una función pura de sus entradas', () => {
  const r = {
    metrosCuadrados: 76,
    anioConstruccion: 1994,
    capitalContinente: 61000,
    capitalContenido: 12000,
    perrosPeligrosos: 0,
    anioEfecto: 2026,
  }
  const a = primaSimulada(r, 0.86)
  assert.equal(a, primaSimulada(r, 0.86))
  assert.ok(primaSimulada(r, 1.06) > a)
  // Redondeado a céntimos: nada de 310.28800000000004 en la pantalla.
  assert.equal(a, Math.round(a * 100) / 100)
  assert.equal(a, 310.29)
})
