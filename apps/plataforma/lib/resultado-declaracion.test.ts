// Runner: `node --test --experimental-strip-types lib/resultado-declaracion.test.ts`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoPrestacionExenta, calcularResultadoDeclaracion, retencionCierre } from './resultado-declaracion.ts'
import { SIN_PALANCAS } from './simulador-irpf.ts'
import { PERFIL, ctxFixture, entradaFixture } from './resultado-declaracion.fixture.ts'

const cerca = (a: number | null | undefined, b: number, tol = 0.011) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`)
const ded = (r: ReturnType<typeof calcularResultadoDeclaracion>['conjunta'], id: string) => r.contribuyentes.flatMap(c => c.deducciones).filter(d => d.id === id)

test('conjunta: familia numerosa 12 meses = 1.200€ y maternidad con tope por cuotas RETA (467,45 × 2 hijos)', () => {
  const r = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture())
  cerca(ded(r.conjunta, 'fn_general')[0].importe, 1200)
  cerca(ded(r.conjunta, 'maternidad')[0].importe, 934.9)
  assert.match(ded(r.conjunta, 'maternidad')[0].nota ?? '', /RETA/)
})

test('el resultado = cuota líquida − retenciones − pagos − reembolsables (+ abonos)', () => {
  const r = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture())
  const c = r.conjunta.contribuyentes[0]
  const reemb = c.deducciones.filter(d => d.reembolsable).reduce((s, d) => s + (d.importe ?? 0), 0)
  const ret = c.retenciones.reduce((s, d) => s + (d.importe ?? 0), 0)
  cerca(c.resultado, c.cuotaLiquida! - ret - reemb)
  cerca(ret, 1500 + 297.17) // Alberto anualizado (12/12) + Pilar
})

test('con cuotas RETA altas: maternidad 2.400€ + guardería 2.000€ (1.000€ por hijo, reparto estimado)', () => {
  const r = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture({ perfil: { ...PERFIL, cuotasSSMadreAnual: 5000 } }))
  cerca(ded(r.conjunta, 'maternidad')[0].importe, 2400)
  const g = ded(r.conjunta, 'guarderia')[0]
  cerca(g.importe, 2000); assert.equal(g.estimada, true)
})

test('individual: maternidad solo en Pilar; familia numerosa 600€ cada uno (art. 81 bis); suma = la de conjunta', () => {
  const r = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture())
  const [a, p] = r.individual.contribuyentes
  assert.equal(a.titular, 'alberto'); assert.equal(p.titular, 'pilar')
  assert.equal(a.deducciones.some(d => d.id === 'maternidad'), false)
  assert.ok(p.deducciones.some(d => d.id === 'maternidad'))
  cerca(a.deducciones.find(d => d.id === 'fn_general')!.importe, 600)
  cerca(p.deducciones.find(d => d.id === 'fn_general')!.importe, 600)
  assert.ok(r.individual.resultado != null && r.conjunta.resultado != null)
})

test('recomendada = la de menor resultado y la ventaja es la diferencia', () => {
  const r = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture())
  const [c, i] = [r.conjunta.resultado!, r.individual.resultado!]
  assert.equal(r.recomendada, i < c ? 'individual' : 'conjunta')
  cerca(r.ventaja, Math.abs(c - i))
})

test('dato que falta = pendiente (null), no 0: sin cuotas RETA la maternidad queda «pendiente de dato»', () => {
  const r = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture({ perfil: { ...PERFIL, cuotasSSMadreAnual: null } }))
  assert.equal(ded(r.conjunta, 'maternidad')[0].importe, null)
  assert.ok(r.conjunta.pendientes.some(x => /maternidad/i.test(x)))
  assert.equal(r.firme, false)
})

test('sin retenciones de Pilar ni modelo 130 ni abonos: pendientes listados y no firme; completo → firme', () => {
  const faltan = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture({
    retencionesPilar: null, pagosFraccionados: { alberto: null, pilar: null }, perfil: { ...PERFIL, abonoAnticipadoMaternidad: null },
  }))
  assert.ok(faltan.conjunta.pendientes.length >= 3); assert.equal(faltan.firme, false)
  assert.equal(faltan.conjunta.contribuyentes[0].retenciones.find(p => p.id === 'ret_pilar')!.importe, null)
  const todo = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture({ perfil: { ...PERFIL, cuotasSSMadreAnual: 5000 } }))
  assert.equal(todo.firme, true)
})

test('base desconocida → resultado null en esa modalidad (nunca 0) y no hay recomendada', () => {
  const e = entradaFixture(); e.periodo.bloques.actividad_correduria = null; e.periodo.baseGeneral = null
  const r = calcularResultadoDeclaracion(e, SIN_PALANCAS, ctxFixture())
  assert.equal(r.conjunta.resultado, null); assert.equal(r.individual.resultado, null)
  assert.equal(r.recomendada, null); assert.equal(r.ventaja, null)
})

test('retenciones de comisiones: el cierre anualiza (10 meses → ×12/10) y SIEMPRE va marcado estimado', () => {
  const p = retencionCierre({ total: 1000, real: 400, estimada: 600, fuente: 'mixta' }, 10)
  cerca(p.importe, 1200); assert.equal(p.estimada, true); assert.match(p.nota ?? '', /anualizada/)
  assert.equal(retencionCierre(null, 10).importe, null)
})

test('aviso de prestación exenta: salta por el CONCEPTO (INSS/TGSS/nacimiento), no por clientes normales', () => {
  assert.equal(avisoPrestacionExenta([{ fecha: '2026-05-29', concepto: 'TRANSF. ALMACEN DE MARISCOS GONZA', importe: 990.56 }]), null)
  const a = avisoPrestacionExenta([{ fecha: '2026-05-29', concepto: 'TRANSF. INSS PRESTACION NACIMIENTO', importe: 1981.13 }])
  assert.match(a ?? '', /art\. 7\.h/); assert.match(a ?? '', /1\.981,13/)
  for (const c of ['TRANSF INSS', 'TGSS ABONO', 'SEGURIDAD SOCIAL'])
    assert.ok(avisoPrestacionExenta([{ fecha: '2026-05-29', concepto: c, importe: 100 }]), c)
})

test('contexto: meses transcurridos (año en curso = mes de hoy; ejercicio cerrado = 12) y 130 sin dato = null', async () => {
  const { armarContextoResultado, mesesTranscurridos } = await import('./resultado-declaracion.ts')
  assert.equal(mesesTranscurridos(2026, '2026-11-03'), 11)
  assert.equal(mesesTranscurridos(2025, '2026-11-03'), 12)
  const c = armarContextoResultado({ anio: 2026, hoy: '2026-11-03', perfil: PERFIL, descendientes: [], retencionesCorreduria: null, retencionesPilar: null,
    ingresosPilar: [{ fecha: '2026-05-29', concepto: 'PRESTACION NACIMIENTO INSS', importe: 1981.13 }] })
  assert.deepEqual(c.pagosFraccionados, { alberto: null, pilar: null })
  assert.equal(c.avisos.length, 1)
})

test('donativosAnual 250 del perfil: baja ≈200 € el resultado (80 % de 250) en ambas modalidades, sin contarse dos veces', () => {
  const a = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture())
  const b = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture({ perfil: { ...PERFIL, donativosAnual: 250 } }))
  cerca(a.conjunta.resultado! - b.conjunta.resultado!, 200)
  cerca(a.individual.resultado! - b.individual.resultado!, 200)
  assert.equal(b.conjunta.contribuyentes[0].deducciones.some(d => d.id === 'donativos'), false)
})

test('abonos 140/143 sin dato (null): faltanAbonos + aviso destacado + no firme; con dato 0 no hay aviso', () => {
  const sin = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture({ perfil: { ...PERFIL, abonoAnticipadoMaternidad: null, abonoAnticipadoFamiliaNumerosa: null } }))
  assert.equal(sin.faltanAbonos, true); assert.equal(sin.firme, false)
  assert.match(sin.avisoAbonos ?? '', /menos favorable: faltan abonos anticipados 140\/143/)
  const con = calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctxFixture())
  assert.equal(con.faltanAbonos, false); assert.equal(con.avisoAbonos, null)
})

test('and_fn individual: si Alberto supera el límite de renta, Pilar se la aplica al 100 % (no 50 %)', () => {
  const e = entradaFixture()
  // Alberto base alta (>25.000), Pilar baja (5.000 < 25.000)
  const r = calcularResultadoDeclaracion(e, SIN_PALANCAS, ctxFixture())
  const [a, p] = r.individual.contribuyentes
  const fa = a.deducciones.find(d => d.id === 'and_fn'), fp = p.deducciones.find(d => d.id === 'and_fn')
  assert.equal(fa, undefined)
  assert.ok(fp, 'Pilar tiene and_fn')
  assert.ok(fp!.nota == null, 'sin nota de reparto 50/50')
  // 100 % = el importe completo de la línea (el de la modalidad conjunta, mismos parámetros)
  const conj = r.conjunta.contribuyentes[0].deducciones.find(d => d.id === 'and_fn')
  if (conj?.importe != null) cerca(fp!.importe, conj.importe)
})

test('guardería: la nota dice el origen (perfil) y avisa si difiere del banco (2.107,50 vs 3.435,50)', () => {
  const g = (ctx: ReturnType<typeof ctxFixture>) => ded(calcularResultadoDeclaracion(entradaFixture(), SIN_PALANCAS, ctx).conjunta, 'guarderia')[0].nota ?? ''
  assert.match(g(ctxFixture({ guarderiaBancoAnual: 2107.5 })), /origen: perfil \(3\.435,50€\).*difiere del banco \(2\.107,50€\)/)
  assert.match(g(ctxFixture({ guarderiaBancoAnual: 3435.5 })), /coincide con el banco/)
  assert.match(g(ctxFixture({ guarderiaBancoAnual: null })), /banco: sin dato/)
})
