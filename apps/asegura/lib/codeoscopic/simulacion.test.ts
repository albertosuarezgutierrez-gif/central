import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  cotizacionSimulada,
  respuestaSimulada,
  primaSimulada,
  primaAutoSimulada,
  projectIdSimulado,
  riesgoDelCuerpo,
  riesgoAutoDelCuerpo,
  moldeDeRamo,
  MARCA_SIMULACION,
  PRODUCTOS_HOGAR,
  FALLOS_HOGAR,
  PRODUCTOS_AUTO,
  FALLOS_AUTO,
  ANIO_REFERENCIA,
  FORMULA_AUTO,
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

// ─────────────────────────────────────────────────────────────────────────────
// AUTO — el fallo del 03/09/2026
//
// Alberto pulsó «Simular precio» en una póliza de AUTO (un SMART FORFOUR) y la
// pantalla le devolvió tres precios de HOGAR: Fiatc Hogar 49,60€ / 68,80€ y
// Mapfre Hogar 84,80€. Dos mentiras a la vez: compañías que no cotizan coches,
// y unas primas que no existen en auto (el fixture real va de 251,77€ a
// 647,78€) porque la fórmula de hogar, sin m² ni capitales, cae a sus gastos
// fijos. Lo que sigue impide las dos.
// ─────────────────────────────────────────────────────────────────────────────

/** El perfil de REFERENCIA de `FORMULA_AUTO`: todos los factores valen 1. */
const AUTO_REFERENCIA = {
  insuranceLine: { id: 'Car' },
  effectiveDate: '2026-10-01',
  holder: { birthDate: '1981-01-01' },
  risk: {
    vehicle: { code: 'ABC123' },
    registrationPlate: '1234ABC',
    registrationDate: '2018-01-01', // 8 años
    kilometersPerYear: 12000,
    previouslyInsured: true,
    primaryDriver: { birthDate: '1981-01-01' }, // 45 años en 2026
    previousInsurance: { totalYearsInsured: 20, yearsWithoutAccidents: 5 },
  },
}

/** El caso REAL que falló: un SMART FORFOUR de 2015, conductor veterano. */
const AUTO_SMART = {
  insuranceLine: { id: 'Car' },
  effectiveDate: '2026-10-01',
  holder: { birthDate: '1978-04-12' },
  risk: {
    vehicle: { code: 'SMART7' },
    registrationPlate: '4321XYZ',
    registrationDate: '2015-06-01',
    kilometersPerYear: 10000,
    previouslyInsured: true,
    primaryDriver: { birthDate: '1978-04-12' },
    previousInsurance: { totalYearsInsured: 22, yearsWithoutAccidents: 8 },
  },
}

const NOMBRES_HOGAR = PRODUCTOS_HOGAR.map((p) => p.producto)
const NOMBRES_AUTO = PRODUCTOS_AUTO.map((p) => p.producto)

test('con ramo AUTO no se cuela ni un producto de hogar', () => {
  const c = cotizacionSimulada(AUTO_REFERENCIA, 'auto')
  assert.equal(c.precios.length, PRODUCTOS_AUTO.length)
  for (const p of c.precios) {
    assert.ok(!NOMBRES_HOGAR.includes(p.producto ?? ''), `producto de hogar en auto: ${p.producto}`)
    assert.ok(!/hogar/i.test(p.producto ?? ''), `producto de hogar en auto: ${p.producto}`)
    assert.ok(!/hogar/i.test(p.compania), `compañía de hogar en auto: ${p.compania}`)
  }
  // Las categorías son las de auto, no las de hogar (Básico/Ampliado/Todo Riesgo).
  const categorias = new Set(c.precios.map((p) => p.categoria))
  assert.ok(categorias.has('Terceros'))
  assert.ok([...categorias].some((x) => (x ?? '').startsWith('Todo Riesgo Con Franquicia')))
  assert.ok(!categorias.has('Básico'))
})

test('y al revés: con ramo HOGAR no aparece ningún producto de auto', () => {
  const c = cotizacionSimulada(CUERPO, 'hogar')
  assert.equal(c.precios.length, PRODUCTOS_HOGAR.length)
  for (const p of c.precios) {
    assert.ok(!NOMBRES_AUTO.includes(p.producto ?? ''), `producto de auto en hogar: ${p.producto}`)
    assert.ok(!/terceros/i.test(p.categoria ?? ''), `categoría de auto en hogar: ${p.categoria}`)
  }
  // Sin ramo se sigue usando el molde de hogar: es el comportamiento histórico.
  assert.deepEqual(
    cotizacionSimulada(CUERPO).precios.map((p) => [p.producto, p.primaEur]),
    c.precios.map((p) => [p.producto, p.primaEur]),
  )
})

test('🚨 las primas de auto caen en la horquilla del fixture real, no en 50€', () => {
  // Fixture real de auto (2026-06-10, insuranceLine `Car`): 251,77€ – 647,78€ en
  // sus categorías comparables. El perfil de referencia las reproduce ±0,25€.
  const c = cotizacionSimulada(AUTO_REFERENCIA, 'auto')
  for (const p of c.precios) {
    assert.ok(
      p.primaEur >= 250 && p.primaEur <= 650,
      `${p.producto} ${p.modalidad}: ${p.primaEur}€ fuera de 250-650€`,
    )
  }
  // El SMART real: mejor perfil que la referencia (coche viejo, 8 años sin
  // siniestros, 10.000 km) ⇒ más barato, pero sigue siendo un precio de coche.
  for (const p of cotizacionSimulada(AUTO_SMART, 'auto').precios) {
    assert.ok(p.primaEur >= 200 && p.primaEur <= 650, `${p.producto}: ${p.primaEur}€`)
  }
})

test('🚨 un cuerpo de auto SIN datos ya no se desploma: es el fallo que se repara', () => {
  // Aquí estaba la mentira cara: con la fórmula de hogar, un cuerpo sin m² ni
  // capitales daba 49,60€. Con la de auto todos los factores valen 1 y sale la
  // horquilla del fixture, que es lo honrado: no sabemos afinar, pero el orden
  // de magnitud es el de una póliza de coche.
  for (const basura of [{}, undefined, null, 42, 'texto', [], AUTO_SMART]) {
    const c = cotizacionSimulada(basura, 'auto')
    assert.equal(c.precios.length, PRODUCTOS_AUTO.length)
    for (const p of c.precios) {
      assert.ok(p.primaEur > 150, `${p.producto}: ${p.primaEur}€ es una prima de hogar, no de auto`)
    }
  }
})

test('el mercado de auto sale ORDENADO: terceros más barato que todo riesgo', () => {
  const primas = cotizacionSimulada(AUTO_REFERENCIA, 'auto').precios.map((p) => p.primaEur)
  for (let i = 1; i < primas.length; i++) {
    assert.ok(primas[i]! > primas[i - 1]!, `${primas[i - 1]} → ${primas[i]} no crece`)
  }
  const terceros = cotizacionSimulada(AUTO_REFERENCIA, 'auto').precios.filter(
    (p) => p.categoria === 'Terceros',
  )
  const todoRiesgo = cotizacionSimulada(AUTO_REFERENCIA, 'auto').precios.filter((p) =>
    (p.categoria ?? '').startsWith('Todo Riesgo'),
  )
  assert.ok(Math.max(...terceros.map((p) => p.primaEur)) < Math.min(...todoRiesgo.map((p) => p.primaEur)))
})

test('el precio de auto SALE del riesgo: joven, kilómetros y bonus lo mueven', () => {
  const ref = cotizacionSimulada(AUTO_REFERENCIA, 'auto').precios[0]!.primaEur

  const joven = cotizacionSimulada(
    { ...AUTO_REFERENCIA, risk: { ...AUTO_REFERENCIA.risk, primaryDriver: { birthDate: '2006-01-01' } } },
    'auto',
  ).precios[0]!.primaEur
  assert.ok(joven > ref, `un conductor de 20 años no puede pagar menos: ${joven} vs ${ref}`)

  const rodador = cotizacionSimulada(
    { ...AUTO_REFERENCIA, risk: { ...AUTO_REFERENCIA.risk, kilometersPerYear: 30000 } },
    'auto',
  ).precios[0]!.primaEur
  assert.ok(rodador > ref, `30.000 km/año no puede ser más barato: ${rodador} vs ${ref}`)

  const veterano = cotizacionSimulada(
    {
      ...AUTO_REFERENCIA,
      risk: { ...AUTO_REFERENCIA.risk, previousInsurance: { yearsWithoutAccidents: 15 } },
    },
    'auto',
  ).precios[0]!.primaEur
  assert.ok(veterano < ref, `15 años sin siniestros tienen que abaratar: ${veterano} vs ${ref}`)

  const sinHistorial = cotizacionSimulada(
    { ...AUTO_REFERENCIA, risk: { ...AUTO_REFERENCIA.risk, previouslyInsured: false } },
    'auto',
  ).precios[0]!.primaEur
  assert.ok(sinHistorial > ref, `sin seguro previo no hay bonus: ${sinHistorial} vs ${ref}`)
})

test('las salvaguardas del dinero valen en LOS DOS moldes', () => {
  for (const [ramo, cuerpo] of [
    ['auto', AUTO_SMART],
    ['hogar', CUERPO],
  ] as const) {
    const c = cotizacionSimulada(cuerpo, ramo)
    // projectId NEGATIVO: ninguno de Codeoscopic lo es.
    assert.ok(Number(c.projectId) < 0, `${ramo}: projectId=${c.projectId}`)
    for (const p of c.precios) {
      // Nunca «firme».
      assert.equal(p.firmeza, 'estimado', `${ramo}: ${p.producto} salió ${p.firmeza}`)
      // La marca de simulación, la PRIMERA.
      assert.ok(p.avisos[0]?.includes(MARCA_SIMULACION), `${ramo}: ${p.producto} sin la marca`)
    }
    for (const f of c.fallos) assert.ok(f.motivo.includes(MARCA_SIMULACION))
    // El id de cada precio, STRING: numérico, `leerPrecio` los tiraría todos.
    const crudo = respuestaSimulada(cuerpo, ramo) as { mainQuotes: { id: unknown }[] }
    assert.ok(crudo.mainQuotes.length > 0)
    for (const q of crudo.mainQuotes) assert.equal(typeof q.id, 'string')
  }
})

test('auto ejercita LAS DOS ramas de tambienDioPrecio (hogar solo tenía una)', () => {
  const c = cotizacionSimulada(AUTO_REFERENCIA, 'auto')
  assert.equal(c.fallos.length, FALLOS_AUTO.length)
  // Reale falla en la config 7469 y cotiza en la 7470: es el caso `true`.
  const reale = c.fallos.find((f) => f.compania === 'Reale')
  assert.ok(reale, 'falta el fallo de Reale')
  assert.equal(reale!.tambienDioPrecio, true)
  assert.ok(reale!.motivo.includes('Código 2115'))
  // Pelayo y Zurich no dan precio en ninguna configuración: caso `false`.
  for (const nombre of ['Pelayo', 'Zurich']) {
    const f = c.fallos.find((x) => x.compania === nombre)
    assert.ok(f, `falta el fallo de ${nombre}`)
    assert.equal(f!.tambienDioPrecio, false)
  }
  // Y una misma compañía da varios precios (varias modalidades).
  assert.equal(c.precios.filter((p) => p.compania === 'Reale').length, 3)
})

test('determinista también en auto: mismos datos ⇒ mismo importe y mismo id', () => {
  const a = cotizacionSimulada(AUTO_SMART, 'auto')
  const b = cotizacionSimulada(JSON.parse(JSON.stringify(AUTO_SMART)), 'auto')
  assert.deepEqual(
    a.precios.map((p) => [p.id, p.primaEur]),
    b.precios.map((p) => [p.id, p.primaEur]),
  )
  assert.equal(a.projectId, b.projectId)
  // Redondeado a céntimos: nada de 251.61999999999998 en la pantalla.
  for (const p of a.precios) assert.equal(p.primaEur, Math.round(p.primaEur * 100) / 100)
})

test('la edad se mide contra la FECHA DE EFECTO, no contra el reloj', () => {
  const r = riesgoAutoDelCuerpo(AUTO_SMART)
  assert.equal(r.anioEfecto, 2026)
  assert.equal(r.anioMatriculacion, 2015)
  assert.equal(r.anioNacimientoConductor, 1978)
  assert.equal(r.kmAnuales, 10000)
  assert.equal(r.aniosSinSiniestros, 8)
  assert.equal(r.aseguradoAntes, true)
  assert.equal(riesgoAutoDelCuerpo({}).anioEfecto, ANIO_REFERENCIA)
})

test('en auto un dato que falta es null, NUNCA 0 (que es otra respuesta)', () => {
  const vacio = riesgoAutoDelCuerpo({ risk: {} })
  assert.equal(vacio.kmAnuales, null)
  assert.equal(vacio.aniosSinSiniestros, null)
  assert.equal(vacio.aseguradoAntes, null)
  assert.equal(vacio.anioMatriculacion, null)
  assert.equal(vacio.anioNacimientoConductor, null)

  // Y no valen lo mismo: 0 km y 0 años sin siniestros SÍ mueven el precio.
  const base = { anioEfecto: 2026, anioMatriculacion: null, anioNacimientoConductor: null }
  const sinDatos = primaAutoSimulada(
    { ...base, kmAnuales: null, aniosSinSiniestros: null, aseguradoAntes: null },
    1,
  )
  const ceroKm = primaAutoSimulada(
    { ...base, kmAnuales: 0, aniosSinSiniestros: null, aseguradoAntes: null },
    1,
  )
  const ceroBonus = primaAutoSimulada(
    { ...base, kmAnuales: null, aniosSinSiniestros: 0, aseguradoAntes: null },
    1,
  )
  assert.equal(sinDatos, FORMULA_AUTO.base)
  assert.ok(ceroKm < sinDatos, 'un coche que no rueda es más barato que uno del que no se sabe')
  assert.ok(ceroBonus > sinDatos, 'cero años sin siniestros encarece; «no lo sé» no')
})

test('la fórmula de auto es una función pura de sus entradas', () => {
  const r = {
    anioMatriculacion: 2015,
    anioNacimientoConductor: 1978,
    kmAnuales: 10000,
    aniosSinSiniestros: 8,
    aseguradoAntes: true,
    anioEfecto: 2026,
  }
  const a = primaAutoSimulada(r, 0.547)
  assert.equal(a, primaAutoSimulada(r, 0.547))
  assert.ok(primaAutoSimulada(r, 1.408) > a)
  // Cálculo pegado a mano, para que un cambio de constante se vea aquí:
  // 460 × 0,97 (coche de 11) × 0,988 (48 años) × 0,984 (10.000 km) × 0,955 (8
  // años sin siniestros) = 414,27€ de mercado × 0,547 = 226,61€.
  assert.equal(a, 226.61)
})

test('un ramo DECLARADO sin molde no toma prestados los productos de otro', () => {
  for (const ramo of ['moto', 'rc', 'vida', 'salud']) {
    const c = cotizacionSimulada(AUTO_SMART, ramo)
    assert.equal(c.precios.length, 0, `${ramo} inventó precios`)
    assert.equal(c.fallos.length, 1)
    assert.ok(c.fallos[0]!.motivo.includes(ramo), `${ramo}: el fallo no dice de qué ramo habla`)
    assert.ok(c.fallos[0]!.motivo.includes(MARCA_SIMULACION))
    assert.ok(Number(c.projectId) < 0)
  }
})

test('moldeDeRamo: tres salidas, y los centinelas cuentan como «no declarado»', () => {
  assert.equal(moldeDeRamo('auto'), 'auto')
  assert.equal(moldeDeRamo('  AUTO '), 'auto')
  assert.equal(moldeDeRamo('hogar'), 'hogar')
  // No declarado ⇒ molde histórico (el contexto de `cotizar` es OPCIONAL).
  assert.equal(moldeDeRamo(undefined), 'hogar')
  assert.equal(moldeDeRamo(null), 'hogar')
  assert.equal(moldeDeRamo(''), 'hogar')
  // Un valor de cajón es un «no lo he sabido leer», no un ramo.
  for (const c of ['otro', 'desconocido', 'N/A', 'Sin clasificar']) {
    assert.equal(moldeDeRamo(c), 'hogar', c)
  }
  // Declarado y sin molde: se dice, no se rellena.
  for (const c of ['moto', 'rc', 'decesos']) assert.equal(moldeDeRamo(c), 'sin-molde', c)
})

test('los productos de auto son los REALES del fixture, no inventados', () => {
  // Si alguien mete una compañía a mano, esto lo caza: se comprueba contra el
  // propio fixture que vendor/producto/config existen tal cual allí.
  const fixture = JSON.parse(
    readFileSync(
      new URL('../../fixtures/codeoscopic/2026-06-10-sandbox-quote-response.json', import.meta.url),
      'utf8',
    ),
  ) as { insuranceLine: { id: string }; mainQuotes: any[]; errors: any[] }
  // El fixture es de AUTO: si algún día se cambia por otro, esto salta.
  assert.equal(fixture.insuranceLine.id, 'Car')

  const clave = (v: number, p: number, c: number) => `${v}/${p}/${c}`
  const enFixture = new Set(
    [...fixture.mainQuotes, ...fixture.errors].map((q) =>
      clave(q.product.vendor.id, q.product.id, q.product.config.id),
    ),
  )
  for (const p of PRODUCTOS_AUTO) {
    assert.ok(
      enFixture.has(clave(p.vendorId, p.productoId, p.configId)),
      `${p.compania}/${p.producto}/${p.configuracion} no está en el fixture real`,
    )
  }
  for (const f of FALLOS_AUTO) {
    assert.ok(
      enFixture.has(clave(f.vendorId, f.productoId, f.configId)),
      `${f.compania} no está en el fixture real`,
    )
    const real = fixture.errors.find((e: any) => e.product.vendor.id === f.vendorId)
    assert.equal(f.motivo, real.messages.find((m: any) => m.type === 'error').description)
  }
})
