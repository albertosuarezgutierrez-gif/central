import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarCarteraVigor, totalesPorCompania, panelControl, type AcuerdoControl, type ObjetivoEvaluadoControl, type FilaCartera } from './acuerdos-control.ts'

// Datos FICTICIOS (ninguna cifra de ningún acuerdo real).
const acuerdo = (id: string, compania: string, pct: number | null, p: Partial<AcuerdoControl> = {}): AcuerdoControl => ({
  id, companiaCodigoDgs: compania, fuente: 'Directo', revisado: true,
  comisiones: [{ ramo: 'hogar', pctNp: pct, pctCartera: null }],
  objetivos: [], ...p,
})
const ev = (objetivoId: string, medido: number, umbral: number, falta: number | null = null): ObjetivoEvaluadoControl =>
  ({ acuerdoId: 'x', objetivoId, estado: { color: 'en_camino', medido, umbral, falta } })

test('agregar: por compañía × ramo; prima ilegible no suma 0 y sin compañía no se reparte', () => {
  const r = agregarCarteraVigor([
    { companiaCodigoDgs: 'C1', ramo: 'hogar', primaAnual: 100.5 },
    { companiaCodigoDgs: 'C1', ramo: 'hogar', primaAnual: null },
    { companiaCodigoDgs: 'C1', ramo: 'auto', primaAnual: 50 },
    { companiaCodigoDgs: null, ramo: 'auto', primaAnual: 10 },
    { companiaCodigoDgs: 'C2', ramo: null, primaAnual: 10 },
  ])
  assert.equal(r.sinCompania, 1)
  assert.equal(r.sinRamo, 1)
  const h = r.filas.find((f) => f.ramo === 'hogar')!
  assert.deepEqual(h, { companiaCodigoDgs: 'C1', ramo: 'hogar', polizas: 2, prima: 100.5, sinPrima: 1 })
})

test('totales por compañía; cartera no leída = null', () => {
  assert.equal(totalesPorCompania(null), null)
  const t = totalesPorCompania([
    { companiaCodigoDgs: 'C1', ramo: 'hogar', polizas: 2, prima: 10, sinPrima: 0 },
    { companiaCodigoDgs: 'C1', ramo: 'auto', polizas: 1, prima: 5, sinPrima: 1 },
  ])!
  assert.deepEqual(t.get('C1'), { polizas: 3, prima: 15, sinPrima: 1 })
})

test('recomendada: la mejor comisión de nueva producción', () => {
  const p = panelControl({ acuerdos: [acuerdo('a1', 'C1', 10), acuerdo('a2', 'C2', 14)], objetivos: [], cartera: [] })
  assert.equal(p.ramos[0].recomendada, 'C2')
  assert.equal(p.ramos[0].candidatas[0].companiaCodigoDgs, 'C2')
})

test('recomendada: con comisión parecida (≤1 punto) manda el objetivo más avanzado', () => {
  const con = (id: string, c: string, pct: number, objId: string) => acuerdo(id, c, pct, { objetivos: [{ id: objId, base: 'primas_np', ramos: [] }] })
  const p = panelControl({
    acuerdos: [con('a1', 'C1', 14, 'o1'), con('a2', 'C2', 13.5, 'o2')],
    objetivos: [ev('o1', 10, 100), ev('o2', 80, 100, 20)],
    cartera: [],
  })
  assert.equal(p.ramos[0].recomendada, 'C2')
  const c2 = p.ramos[0].candidatas[0].objetivo
  assert.equal(c2.estado === 'medido' && c2.avance, 0.8)
})

test('recomendada: una comisión mucho mejor no la gana un objetivo cercano', () => {
  const con = (id: string, c: string, pct: number, objId: string) => acuerdo(id, c, pct, { objetivos: [{ id: objId, base: 'primas_np', ramos: [] }] })
  const p = panelControl({ acuerdos: [con('a1', 'C1', 20, 'o1'), con('a2', 'C2', 10, 'o2')], objetivos: [ev('o1', 1, 100), ev('o2', 99, 100)], cartera: [] })
  assert.equal(p.ramos[0].recomendada, 'C1')
})

test('null ≠ 0: sin ningún % conocido no se recomienda; un % null no gana a uno conocido', () => {
  const sin = panelControl({ acuerdos: [acuerdo('a1', 'C1', null), acuerdo('a2', 'C2', null)], objetivos: [], cartera: [] })
  assert.equal(sin.ramos[0].recomendada, null)
  const uno = panelControl({ acuerdos: [acuerdo('a1', 'C1', null), acuerdo('a2', 'C2', 3)], objetivos: [], cartera: [] })
  assert.equal(uno.ramos[0].recomendada, 'C2')
})

test('objetivo pendiente o sin evaluar: sin avance, nunca 0 % ni verde', () => {
  const a = acuerdo('a1', 'C1', 10, { objetivos: [{ id: 'o1', base: null, ramos: [] }] })
  const p1 = panelControl({ acuerdos: [a], objetivos: [{ acuerdoId: 'a1', objetivoId: 'o1', estado: { color: 'pendiente', motivo: 'sin_clave' } }], cartera: [] })
  assert.deepEqual(p1.ramos[0].candidatas[0].objetivo, { estado: 'pendiente', motivo: 'sin_clave' })
  const p2 = panelControl({ acuerdos: [a], objetivos: [], cartera: [] })
  assert.equal(p2.ramos[0].candidatas[0].objetivo.estado, 'pendiente')
  const p3 = panelControl({ acuerdos: [acuerdo('a1', 'C1', 10)], objetivos: [], cartera: [] })
  assert.equal(p3.ramos[0].candidatas[0].objetivo.estado, 'sin_objetivo')
})

test('un objetivo de otro ramo no cuenta; umbral 0 no divide', () => {
  const a = acuerdo('a1', 'C1', 10, { objetivos: [{ id: 'o1', base: null, ramos: ['auto'] }, { id: 'o2', base: null, ramos: ['hogar'] }] })
  const p = panelControl({ acuerdos: [a], objetivos: [ev('o1', 50, 100), ev('o2', 5, 0)], cartera: [] })
  const o = p.ramos[0].candidatas[0].objetivo
  assert.ok(o.estado === 'medido' && o.avance === null && o.umbral === 0)
})

test('cartera: sin leer → pólizas null; leída sin filas → 0; ramos sin acuerdo se declaran', () => {
  const a = [acuerdo('a1', 'C1', 10)]
  assert.equal(panelControl({ acuerdos: a, objetivos: [], cartera: null }).ramos[0].candidatas[0].polizas, null)
  const cartera: FilaCartera[] = [
    { companiaCodigoDgs: 'C2', ramo: 'hogar', polizas: 4, prima: 400, sinPrima: 0 },
    { companiaCodigoDgs: 'C1', ramo: 'vida', polizas: 2, prima: 80, sinPrima: 1 },
  ]
  const p = panelControl({ acuerdos: a, objetivos: [], cartera })
  assert.equal(p.ramos[0].candidatas[0].polizas, 0)
  assert.deepEqual(p.ramos[0].cartera, { polizas: 4, prima: 400, sinPrima: 0 })
  assert.deepEqual(p.ramosSinAcuerdo, [{ ramo: 'vida', polizas: 2 }])
})

test('acuerdo sin cotejar: recomendación provisional; línea sin ramo no calcula', () => {
  const a = acuerdo('a1', 'C1', 10, { revisado: false, comisiones: [{ ramo: 'hogar', pctNp: 10, pctCartera: null }, { ramo: null, pctNp: 99, pctCartera: null }] })
  const p = panelControl({ acuerdos: [a], objetivos: [], cartera: [] })
  assert.match(p.ramos[0].motivo, /Provisional/)
  assert.equal(p.ramos[0].candidatas[0].sinCotejar, true)
  assert.equal(p.lineasSinRamo, 1)
})

test('misma compañía con dos acuerdos en un ramo: una sola candidata, la de mejor %', () => {
  const p = panelControl({ acuerdos: [acuerdo('a1', 'C1', 8), acuerdo('a2', 'C1', 12, { fuente: 'APROMES' })], objetivos: [], cartera: [] })
  assert.equal(p.ramos[0].candidatas.length, 1)
  assert.equal(p.ramos[0].candidatas[0].fuente, 'APROMES')
})
