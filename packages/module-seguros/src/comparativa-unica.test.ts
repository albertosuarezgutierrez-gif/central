// La comparativa ÚNICA (20/10/2026): varias fuentes y ramos por el MISMO motor. Fixtures anónimos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, cifrasDeMatriz, textoHuellaComparativa, CRITERIO_RANKING, type OfertaNormalizada, type ResultadoComparacion } from './comparar-ofertas.ts'
import { ofertaDeAvant2, ofertaDePolizaActual, ofertaDeBot, seleccionarAvant2, fraccionamientoDe, type PrecioAvant2 } from './ofertas-fuentes.ts'
import { companiaIntrusa, avisoCotizacionGuardada, etiquetaResumen, ETIQUETA_RESUMEN_IA } from './resumen-comparativa.ts'
import { normalizarGarantia } from './coberturas-taxonomia.ts'

const precio = (p: Partial<PrecioAvant2> & { id: string }): PrecioAvant2 => ({
  compania: 'Compañía A', producto: 'Auto Plus', modalidad: null, categoria: 'Terceros Ampliado', primaEur: 300, franquiciaEur: null,
  firmeza: 'estimado', frecuenciaPago: 'Anual', meses: 12, garantias: null, ...p,
})
const fila = (r: ResultadoComparacion, clave: string) => r.filas.find((f) => f.clave === clave)
const celda = (r: ResultadoComparacion, clave: string, id: string) => fila(r, clave)?.celdas.find((c) => c.ofertaId === id)

test('auto: Avant2, PDF y póliza actual caen en las MISMAS filas (taxonomía derivada del catálogo)', () => {
  assert.equal(normalizarGarantia('auto', 'Rotura de lunas'), 'lunas')
  assert.equal(normalizarGarantia('auto', 'Responsabilidad civil obligatoria'), 'rc_obligatoria')
  assert.equal(normalizarGarantia('auto', 'Cobertura de marcianos'), null)
  const avant = ofertaDeAvant2(precio({ id: 'av', garantias: { porClave: { rc_obligatoria: 'si', lunas: 'si', danos_propios: 'no', robo: 'no_consta' } } }), 'auto')
  const actual = ofertaDePolizaActual({ id: 'pol', compania: 'Compañía B', primaAnual: 410, fraccionamiento: 'ANUAL', coberturas: [
    { nombre: 'Responsabilidad Civil Obligatoria', incluida: true }, { nombre: 'Lunas', incluida: true }, { nombre: 'Robo', incluida: true },
  ] }, 'auto')
  const r = compararOfertas({ ramo: 'auto', ofertas: [actual, avant] })
  assert.equal(celda(r, 'lunas', 'av')?.estado3, 'incluida')
  assert.equal(celda(r, 'lunas', 'pol')?.estado3, 'incluida')
  // `no` del catálogo = no incluida; `no_consta` = no se sabe (y es un hueco frente a la actual, no «peor»).
  assert.equal(celda(r, 'danos_propios', 'av')?.estado3, 'no_incluida')
  assert.equal(celda(r, 'robo', 'av')?.estado3, 'no_se_sabe')
  assert.equal(celda(r, 'robo', 'av')?.hueco, true)
  assert.equal(celda(r, 'robo', 'av')?.peorQueActual, false)
  assert.equal(fila(r, 'lunas')?.etiqueta, 'Lunas')
  assert.equal(r.resumen.find((x) => x.ofertaId === 'pol')?.fraccionamiento, 'anual')
})

test('hogar: el catálogo de Avant2 se traduce a la taxonomía de los PDF (una fila por garantía)', () => {
  const avant = ofertaDeAvant2(precio({ id: 'av', categoria: 'Básico', garantias: { porClave: { continente: 'si', rc_familiar: 'si', cristales: 'no', animales: 'si' } } }), 'hogar')
  const pdf: OfertaNormalizada = {
    id: 'pdf', rol: 'oferta', compania: 'Compañía C', producto: null, primaTotal: 250, primaNeta: null, fuente: 'pdf_compania',
    garantias: { rc_general: { estado: null, capital: null, limite: 300000, franquicia: null } },
  }
  const r = compararOfertas({ ramo: 'hogar', ofertas: [avant, pdf] })
  assert.equal(celda(r, 'rc_general', 'av')?.estado3, 'incluida')
  assert.equal(celda(r, 'rc_general', 'pdf')?.estado3, 'incluida')
  assert.equal(celda(r, 'rotura_cristales', 'av')?.estado3, 'no_incluida')
  assert.equal(fila(r, 'rc_familiar'), undefined)
  // Una clave del catálogo sin hermana en la taxonomía: fila propia con la etiqueta del catálogo.
  assert.equal(fila(r, 'animales')?.etiqueta, 'Animales domésticos')
})

test('Avant2: garantías sin leer = no se sabe + aviso; periodo ≠ 12 meses no se compara como anual', () => {
  const sinLeer = ofertaDeAvant2(precio({ id: 'x', garantias: null }), 'auto')
  assert.deepEqual(sinLeer.garantias, {})
  assert.ok(sinLeer.avisos?.some((a) => /sin leer/.test(a)))
  const semestral = ofertaDeAvant2(precio({ id: 's', primaEur: 180, meses: 6 }), 'auto')
  assert.equal(semestral.primaTotal, null)
  assert.ok(semestral.avisos?.some((a) => /6 meses/.test(a)))
  const r = compararOfertas({ ramo: 'auto', ofertas: [semestral] })
  assert.equal(r.ranking?.puestos[0]?.posicion, null)
  // Franquicia que no viene = no declarada, nunca 0.
  assert.equal(ofertaDeAvant2(precio({ id: 'f' }), 'auto').franquiciaGeneral, null)
  assert.equal(ofertaDeAvant2(precio({ id: 'f0', franquiciaEur: 0 }), 'auto').franquiciaGeneral, 0)
})

test('seleccionarAvant2: el más barato por compañía y nivel, ordenado y con tope', () => {
  const ps = [
    precio({ id: '1', compania: 'A', categoria: 'Terceros', primaEur: 200 }),
    precio({ id: '2', compania: 'A', categoria: 'Terceros', primaEur: 180 }),
    precio({ id: '3', compania: 'B', categoria: 'Terceros', primaEur: 190 }),
    precio({ id: '4', compania: 'A', categoria: 'Todo Riesgo', primaEur: 600 }),
    precio({ id: '5', compania: 'C', categoria: 'Terceros', primaEur: null }),
  ]
  assert.deepEqual(seleccionarAvant2(ps).map((p) => p.id), ['2', '3', '4', '5'])
  assert.deepEqual(seleccionarAvant2(ps, 2).map((p) => p.id), ['2', '3'])
})

test('seleccionarAvant2: un semestral (o sin periodo) más barato NO tapa al anual del mismo grupo', () => {
  const ps = [
    precio({ id: 'anual', compania: 'A', categoria: 'Terceros', primaEur: 300, meses: 12 }),
    precio({ id: 'semes', compania: 'A', categoria: 'Terceros', primaEur: 160, meses: 6 }),
    precio({ id: 'nulo', compania: 'A', categoria: 'Terceros', primaEur: 150, meses: null }),
    precio({ id: 'soloNulo', compania: 'B', categoria: 'Terceros', primaEur: 140, meses: null }),
    precio({ id: 'nuloB', compania: 'C', categoria: 'Terceros', primaEur: 500, meses: null }),
    precio({ id: 'semesC', compania: 'C', categoria: 'Terceros', primaEur: 100, meses: 6 }),
  ]
  // A: el anual; B: solo hay periodo no declarado (último recurso); C: el no declarado antes que el semestral.
  assert.deepEqual(seleccionarAvant2(ps).map((p) => p.id), ['anual', 'soloNulo', 'nuloB'])
})

test('Avant2: periodo NO declarado (meses null) no es anual; caducada → reserva', () => {
  const o = ofertaDeAvant2(precio({ id: 'n', primaEur: 300, meses: null }), 'auto')
  assert.equal(o.primaTotal, null)
  assert.ok(o.avisos?.some((a) => /no declarado/.test(a)))
  const c = ofertaDeAvant2(precio({ id: 'c' }), 'auto', { caducada: true })
  const r = compararOfertas({ ramo: 'auto', ofertas: [c] })
  assert.ok(r.ranking?.puestos[0]?.reservas.some((x) => /fecha de efecto ya pasada/.test(x)))
})

test('remapeo de lectura: claves genéricas de una oferta de coche antigua se alinean con el catálogo', async () => {
  const { remapearGarantiasLectura } = await import('./coberturas-taxonomia.ts')
  const inc = { estado: 'incluida' as const, capital: null, limite: null, franquicia: null }
  const r = remapearGarantiasLectura('auto', { asistencia: inc, robo: inc, rc_general: inc, danos_materiales: inc, 'Rotura de lunas': inc, 'Cosa rara': inc })
  assert.deepEqual(Object.keys(r.garantias).sort(), ['Cosa rara', 'asistencia_viaje', 'lunas', 'robo'])
  assert.deepEqual(r.sinEquivalencia.sort(), ['danos_materiales', 'rc_general'])
  // Sin equivalencia = no se sabe: no crea fila ni hueco frente a la actual.
  const actual: OfertaNormalizada = { id: 'a', rol: 'actual', compania: 'A', producto: null, primaTotal: 400, primaNeta: null, garantias: r.garantias }
  const avant = ofertaDeAvant2(precio({ id: 'av', garantias: { porClave: { asistencia_viaje: 'si', robo: 'si', lunas: 'si' } } }), 'auto')
  const cmp = compararOfertas({ ramo: 'auto', ofertas: [actual, avant] })
  assert.equal(cmp.filas.find((f) => f.clave === 'rc_general'), undefined)
  assert.equal(cmp.resumen.find((x) => x.ofertaId === 'av')?.huecos, 1) // solo «Cosa rara», un extra literal
  assert.equal(remapearGarantiasLectura('hogar', { rc_general: inc }).garantias.rc_general, inc)
})

test('bot: la oferta del portal entra por forma, con franquicia general y fraccionamiento', () => {
  const o = ofertaDeBot({
    compania: 'Compañía D', producto: 'Comunidad', primaAnualEur: 700, primaNetaEur: null, fraccionamiento: 'semestral', importeReciboEur: 350,
    coberturas: [{ clave: 'x', literal: 'Responsabilidad civil general', estado: 'incluida', capital: null, limite: 600000, franquicia: null }],
    franquicias: [{ ambito: 'general', importeEur: 150, literal: null }],
  }, 'bot1', 'comunidades')
  assert.equal(o.fuente, 'bot')
  assert.equal(o.franquiciaGeneral, 150)
  assert.ok(o.garantias.rc_general)
  assert.equal(fraccionamientoDe('MENSUAL'), 'mensual')
  assert.equal(fraccionamientoDe('raro'), null)
})

const ofertasRanking = (): OfertaNormalizada[] => [
  { id: 'act', rol: 'actual', compania: 'Actual', producto: null, primaTotal: 500, primaNeta: null, garantias: { lunas: { estado: 'incluida', capital: null, limite: null, franquicia: null } } },
  { id: 'b', rol: 'oferta', compania: 'B', producto: null, primaTotal: 420, primaNeta: null, franquiciaGeneral: 300, garantias: {} },
  { id: 'c', rol: 'oferta', compania: 'C', producto: null, primaTotal: 380.5, primaNeta: null, firmeza: 'estimado', garantias: { lunas: { estado: 'incluida', capital: null, limite: null, franquicia: null } } },
  { id: 'd', rol: 'oferta', compania: 'D', producto: null, primaTotal: null, primaNeta: null, garantias: {} },
]

test('ranking: por prima anual, explicado, sin la actual, y las sin prima fuera del orden', () => {
  const r = compararOfertas({ ramo: 'auto', ofertas: ofertasRanking() })
  assert.equal(r.ranking?.criterio, CRITERIO_RANKING)
  const p = r.ranking!.puestos
  assert.deepEqual(p.map((x) => [x.ofertaId, x.posicion]), [['c', 1], ['b', 2], ['d', null]])
  assert.match(p[0]!.motivos[0]!, /380,50€, la más baja de las 2/)
  assert.match(p[1]!.motivos[0]!, /39,50€ más que la más baja/)
  assert.ok(p[0]!.reservas.includes('Precio estimado: la compañía lo confirma al emitir'))
  assert.ok(p[1]!.reservas.some((x) => /No figuran 1 garantía/.test(x)))
  // Cepo: TODA cifra de los motivos/reservas está en cifrasDeMatriz (la IA podrá usarlas, nada más).
  const permitidas = cifrasDeMatriz(r)
  for (const t of p.flatMap((x) => [...x.motivos, ...x.reservas])) {
    for (const m of t.matchAll(/\d+(?:[.,]\d+)*/g)) assert.ok(permitidas.has(m[0]) || permitidas.has(`${m[0]}€`), `cifra «${m[0]}» de «${t}» fuera de la matriz`)
  }
})

test('ranking: empate declarado; determinista (misma entrada → mismo resultado)', () => {
  const os = ofertasRanking().map((o) => (o.id === 'b' ? { ...o, primaTotal: 380.5, garantias: { lunas: { estado: 'incluida' as const, capital: null, limite: null, franquicia: null } } } : o))
  const r = compararOfertas({ ramo: 'auto', ofertas: os })
  const p = r.ranking!.puestos
  assert.deepEqual(p.filter((x) => x.posicion !== null).map((x) => [x.ofertaId, x.posicion, x.empate]), [['b', 1, true], ['c', 1, true]])
  assert.deepEqual(compararOfertas({ ramo: 'auto', ofertas: os }), r)
})

test('huella: no depende del orden ni de la cita; sí de una prima', () => {
  const os = ofertasRanking()
  const h = textoHuellaComparativa({ ramo: 'auto', ofertas: os })
  assert.equal(textoHuellaComparativa({ ramo: 'auto', ofertas: [...os].reverse() }), h)
  const conCita = os.map((o) => (o.id === 'c' ? { ...o, garantias: { lunas: { ...o.garantias.lunas!, evidencia: { pagina: 3, texto: 'Lunas incluidas' } } } } : o))
  assert.equal(textoHuellaComparativa({ ramo: 'auto', ofertas: conCita }), h)
  assert.notEqual(textoHuellaComparativa({ ramo: 'auto', ofertas: os.map((o) => (o.id === 'c' ? { ...o, primaTotal: 381 } : o)) }), h)
  assert.notEqual(textoHuellaComparativa({ ramo: 'auto', ofertas: os, extra: { recomendada: 'b' } }), h)
})

test('cepo de compañías: solo las comparadas; «Grupo ASegura» no es una compañía', () => {
  const comparadas = ['Allianz Seguros', 'Catalana Occidente']
  assert.equal(companiaIntrusa('Allianz baja la prima y Catalana Occidente mejora el robo. Grupo ASegura te acompaña.', comparadas), null)
  assert.equal(companiaIntrusa('Mapfre lo haría más barato.', comparadas), 'Mapfre')
  assert.equal(companiaIntrusa('Te recomendamos Occident.', ['Allianz']), 'Occident')
  assert.equal(companiaIntrusa('Sin compañías aquí.', comparadas), null)
})

test('cepo de compañías: tokens completos (Generali ≠ Mutua General), vacías ignoradas, forma de aseguradora', () => {
  assert.equal(companiaIntrusa('Generali mejora el robo.', ['Mutua General']), 'Generali')
  assert.equal(companiaIntrusa('Mutua General mejora el robo.', ['Generali']), 'Mutua General')
  assert.equal(companiaIntrusa('Allianz baja la prima.', ['', '  ', 'Seguros']), 'Allianz')
  assert.equal(companiaIntrusa('Mutua Madrileña baja la prima.', ['Mutua Madrileña Automovilista']), null)
  // Fuera del diccionario, pero con forma de aseguradora: también se caza.
  assert.equal(companiaIntrusa('Seguros Pepitez lo cubre.', ['Allianz']), 'Pepitez')
  assert.equal(companiaIntrusa('Zarzuela Seguros lo cubre.', ['Allianz']), 'Zarzuela')
  assert.equal(companiaIntrusa('Grupo ASegura y Allianz Seguros te lo explican.', ['Allianz']), null)
})

test('etiqueta y aviso de cotización guardada', () => {
  assert.equal(etiquetaResumen('ia'), ETIQUETA_RESUMEN_IA)
  assert.notEqual(etiquetaResumen('determinista'), ETIQUETA_RESUMEN_IA)
  assert.equal(avisoCotizacionGuardada({ creadaEn: '2026-10-12T10:00:00Z', caducada: false, costeCents: 50 }), 'Ya hay una cotización de Avant2 del 12/10: ábrela gratis. ¿Hacer una consulta nueva (0,50€)?')
  assert.match(avisoCotizacionGuardada({ creadaEn: '2026-10-12T10:00:00Z', caducada: true, costeCents: 50 }), /fecha de efecto ya pasó/)
  assert.match(avisoCotizacionGuardada({ creadaEn: '2026-10-12T10:00:00Z', caducada: false, costeCents: 0 }), /coste sin confirmar/)
})
