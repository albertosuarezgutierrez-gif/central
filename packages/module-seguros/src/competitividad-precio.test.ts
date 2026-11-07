import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCompetitividad, frasesCompetitividad, mediana, pctEs, type ObservacionPrecio } from './competitividad-precio.ts'

// Datos FICTICIOS. Las fechas van inyectadas en cada observación: nada depende del reloj.
const obs = (p: Partial<ObservacionPrecio> & { c: string; eur: number }): ObservacionPrecio => ({
  fuente: 'avant2', companiaCodigo: p.c, companiaNombre: `Cía ${p.c}`, ramo: 'auto', nivel: 'Todo riesgo con franquicia',
  primaAnualCents: Math.round(p.eur * 100), fecha: '2031-03-10', grupoComparacion: 'g1', ...p,
})
const fila = (r: ReturnType<typeof calcularCompetitividad>, c: string, nivel = 'Todo riesgo con franquicia') =>
  r.pareja.find((x) => x.companiaCodigo === c && x.nivel === nivel)

test('una tarificación: % sobre la más barata, sobre la mediana de las otras y posición', () => {
  const r = calcularCompetitividad([obs({ c: 'A', eur: 120 }), obs({ c: 'B', eur: 100 }), obs({ c: 'C', eur: 110 })])
  const a = fila(r, 'A')!
  assert.equal(a.tarificaciones, 1)
  assert.equal(a.masBarata, 0)
  assert.equal(a.pctMedianoSobreBarata, 20) // (120-100)/100
  assert.equal(a.pctMedianoSobreMediana, r1((120 - 105) / 105 * 100)) // mediana de B y C = 105
  assert.equal(a.posicionMediana, 3)
  assert.deepEqual(a.pierdeContra.map((p) => [p.companiaCodigo, p.pctMediano]), [['B', 20], ['C', r1(10 / 110 * 100)]])
  const b = fila(r, 'B')!
  assert.equal(b.masBarata, 1)
  assert.equal(b.pctMedianoSobreBarata, 0)
  assert.equal(b.posicionMediana, 1)
  assert.deepEqual(b.pierdeContra, [])
})
const r1 = (n: number) => Math.round(n * 10) / 10

test('empatar con la más barata cuenta como serlo y no hay "pierde contra"', () => {
  const r = calcularCompetitividad([obs({ c: 'A', eur: 100 }), obs({ c: 'B', eur: 100 })])
  assert.equal(fila(r, 'A')!.masBarata, 1)
  assert.deepEqual(fila(r, 'A')!.pierdeContra, [])
})

test('solo se compara en el MISMO nivel y en la MISMA petición', () => {
  const r = calcularCompetitividad([
    obs({ c: 'A', eur: 300, nivel: 'Todo riesgo con franquicia' }),
    obs({ c: 'B', eur: 100, nivel: 'Terceros básico' }), // otro nivel: no compite con A
    obs({ c: 'C', eur: 100, grupoComparacion: 'g2' }), // otra petición: no compite con A
  ])
  assert.equal(r.pareja.length, 0)
})

test('una compañía que cotiza sola en el nivel no genera comparación ni 0 %', () => {
  const r = calcularCompetitividad([obs({ c: 'A', eur: 100 }), obs({ c: 'B', eur: 90, nivel: 'Terceros básico' })])
  assert.deepEqual(r.pareja, [])
  assert.deepEqual(frasesCompetitividad(r, 'A', 2031), []) // «sin datos», nunca 0 %
})

test('con dos precios de la misma compañía en el nivel cuenta el más bajo y el canal de ese precio', () => {
  const r = calcularCompetitividad([
    obs({ c: 'A', eur: 130, fuente: 'avant2' }), obs({ c: 'A', eur: 105, fuente: 'bot' }), obs({ c: 'B', eur: 100 }),
  ])
  const a = fila(r, 'A')!
  assert.equal(a.pctMedianoSobreBarata, 5)
  assert.deepEqual(a.canales, { bot: 1 })
})

test('ventana corta: un precio de otra semana es otra tarificación', () => {
  const dentro = calcularCompetitividad([obs({ c: 'A', eur: 120 }), obs({ c: 'B', eur: 100, fecha: '2031-03-16' })])
  assert.equal(fila(dentro, 'A')!.tarificaciones, 1) // 6 días
  const fuera = calcularCompetitividad([obs({ c: 'A', eur: 120 }), obs({ c: 'B', eur: 100, fecha: '2031-03-25' })])
  assert.equal(fuera.pareja.length, 0) // 15 días
  const ancha = calcularCompetitividad([obs({ c: 'A', eur: 120 }), obs({ c: 'B', eur: 100, fecha: '2031-03-25' })], { ventanaDias: 30 })
  assert.equal(fila(ancha, 'A')!.tarificaciones, 1)
})

test('la mediana de varias tarificaciones y el top de rivales con su % mediano', () => {
  const o: ObservacionPrecio[] = []
  // 3 tarificaciones: A paga 110, 120, 150 frente a B (100) y 130 vs C (a 1.ª y 2.ª)
  ;[['g1', 110], ['g2', 120], ['g3', 150]].forEach(([g, eur], i) => {
    o.push(obs({ c: 'A', eur: eur as number, grupoComparacion: g as string }), obs({ c: 'B', eur: 100, grupoComparacion: g as string }))
    if (i < 2) o.push(obs({ c: 'C', eur: 105, grupoComparacion: g as string }))
  })
  const a = fila(calcularCompetitividad(o), 'A')!
  assert.equal(a.tarificaciones, 3)
  assert.equal(a.pctMedianoSobreBarata, 20) // 10, 20, 50 → 20
  assert.equal(a.pierdeContra[0]!.companiaCodigo, 'B')
  assert.equal(a.pierdeContra[0]!.veces, 3)
  assert.equal(a.pierdeContra[0]!.pctMediano, 20)
  assert.equal(a.pierdeContra[1]!.companiaCodigo, 'C')
  assert.equal(a.muestraPequena, true) // 3 < 5
})

test('la muestra pequeña se levanta con 5 tarificaciones', () => {
  const o: ObservacionPrecio[] = []
  for (let i = 0; i < 5; i++) o.push(obs({ c: 'A', eur: 110, grupoComparacion: `g${i}` }), obs({ c: 'B', eur: 100, grupoComparacion: `g${i}` }))
  assert.equal(fila(calcularCompetitividad(o), 'A')!.muestraPequena, false)
})

test('sin nivel, prima inválida o fecha inválida se descartan y se cuentan', () => {
  const r = calcularCompetitividad([
    obs({ c: 'A', eur: 100, nivel: null }), obs({ c: 'A', eur: 0 }), obs({ c: 'A', eur: 100, fecha: '10/03/2031' }),
    { ...obs({ c: 'A', eur: 100 }), primaAnualCents: 100.5 },
  ])
  assert.deepEqual(r.descartadas, { invalidas: 3, sinNivel: 1 })
  assert.equal(r.pareja.length, 0)
})

test('año natural: solo cuenta el año pedido y la tanda se ancla en su primera fecha', () => {
  const o = [
    obs({ c: 'A', eur: 120 }), obs({ c: 'B', eur: 100 }),
    obs({ c: 'A', eur: 200, fecha: '2030-05-01', grupoComparacion: 'g9' }), obs({ c: 'B', eur: 100, fecha: '2030-05-01', grupoComparacion: 'g9' }),
  ]
  assert.equal(fila(calcularCompetitividad(o, { anio: 2031 }), 'A')!.pctMedianoSobreBarata, 20)
  assert.equal(fila(calcularCompetitividad(o, { anio: 2030 }), 'A')!.pctMedianoSobreBarata, 100)
  assert.equal(calcularCompetitividad(o).pareja.filter((x) => x.companiaCodigo === 'A').length, 2)
})

test('segmento: observaciones sueltas se comparan por mediana de ramo+nivel+año, no por pareja', () => {
  const s = (c: string, eur: number) => obs({ c, eur, fuente: 'poliza_escaneada', grupoComparacion: null })
  const r = calcularCompetitividad([s('A', 100), s('A', 120), s('B', 90), s('B', 100), s('C', 80)])
  assert.equal(r.pareja.length, 0)
  const a = r.segmento.find((x) => x.companiaCodigo === 'A')!
  assert.equal(a.n, 2)
  assert.equal(a.nResto, 3)
  assert.equal(a.medianaCents, 11000)
  assert.equal(a.medianaRestoCents, 9000)
  assert.equal(a.pct, r1((110 - 90) / 90 * 100))
  assert.equal(a.muestraPequena, true)
  // sin resto no hay segmento
  assert.deepEqual(calcularCompetitividad([s('A', 100)]).segmento, [])
})

test('frases: texto determinista con muestra, canal y rival', () => {
  const o: ObservacionPrecio[] = []
  for (let i = 0; i < 12; i++) o.push(obs({ c: 'A', eur: 118, grupoComparacion: `g${i}`, fuente: i < 3 ? 'bot' : 'avant2' }), obs({ c: 'B', eur: 100, grupoComparacion: `g${i}` }))
  const f = frasesCompetitividad(calcularCompetitividad(o), 'A', 2031)
  assert.equal(f.length, 1)
  assert.match(f[0]!, /^En Auto Todo riesgo con franquicia estáis un 18 % por encima de la más barata \(mediana, 12 tarificaciones; la más barata en 0 de 12; canal: Avant2 9, bot 3\)\./)
  assert.match(f[0]!, /Pierde sobre todo frente a Cía B \(estáis un 18 % por encima, 12 veces\)\./)
  assert.doesNotMatch(f[0]!, /muestra pequeña/)
  assert.deepEqual(frasesCompetitividad(calcularCompetitividad(o), 'A', 2030), [])
})

test('mediana y formato español', () => {
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([1, 2, 3, 4]), 2.5)
  assert.equal(pctEs(12.5), '12,5 %')
})
