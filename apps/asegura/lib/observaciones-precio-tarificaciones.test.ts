import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCompetitividad } from '@central/module-seguros'
import { observacionesDeTarificaciones, type PrecioLeido, type TarificacionLeida } from './observaciones-precio-tarificaciones.ts'

// Datos FICTICIOS: compañías «Alfa», «Beta», «Gamma». Las fechas van fijas en la propia fila (sin reloj).
const CATALOGO = [
  { codigoDgs: 'C1', nombreComun: 'Alfa' },
  { codigoDgs: 'C2', nombreComun: 'Beta' },
  { codigoDgs: 'C3', nombreComun: 'Gamma' },
]
const av = (compania: string, eur: number | null, p: Partial<PrecioLeido> = {}): PrecioLeido => ({
  id: `${compania}-${eur}`, idVendor: `${compania}-${eur}`, compania, producto: `${compania} Autos`, modalidad: `${compania} Terceros`, categoria: 'Terceros',
  primaEur: eur, franquiciaEur: null, garantias: null, coberturas: null, ...p,
})
const bot = (compania: string, eur: number, producto = 'Auto · Terceros básico'): PrecioLeido => ({
  id: null, compania, producto, modalidad: null, categoria: null, primaEur: eur, franquiciaEur: null, garantias: null, coberturas: null,
})
const tar = (p: Partial<TarificacionLeida> & { precios: PrecioLeido[] }): TarificacionLeida => ({
  id: 't1', canal: 'codeoscopic', ramo: 'auto', oportunidadId: null, fecha: '2031-03-10', fallos: null, ...p,
})

test('Avant2: una tarificación con varias compañías compite entre sí por nivel; el nombre se resuelve al código DGS', () => {
  const l = observacionesDeTarificaciones([tar({ precios: [av('Alfa', 300), av('Beta', 250), av('Gamma', 260)] })], CATALOGO)
  assert.equal(l.observaciones.length, 3)
  assert.deepEqual(new Set(l.observaciones.map((o) => o.companiaCodigo)), new Set(['C1', 'C2', 'C3']))
  assert.ok(l.observaciones.every((o) => o.fuente === 'avant2' && o.nivel === 'Terceros básico' && o.grupoComparacion === 't:t1'))
  const r = calcularCompetitividad(l.observaciones)
  assert.equal(r.pareja.find((x) => x.companiaCodigo === 'C1')!.pctMedianoSobreBarata, 20)
})

test('un bot y el Avant2 de la MISMA oportunidad se juntan; el bot solo, sin oportunidad, no compara', () => {
  const l = observacionesDeTarificaciones([
    tar({ id: 'a', oportunidadId: 'op1', precios: [av('Beta', 250)] }),
    tar({ id: 'b', canal: 'rpa', oportunidadId: 'op1', precios: [bot('alfa', 300)] }),
    tar({ id: 'c', canal: 'rpa', precios: [bot('gamma', 200)] }), // sin oportunidad: queda solo
  ], CATALOGO)
  const r = calcularCompetitividad(l.observaciones)
  assert.equal(r.pareja.length, 2) // Alfa y Beta, no Gamma
  const alfa = r.pareja.find((x) => x.companiaCodigo === 'C1')!
  assert.deepEqual(alfa.canales, { bot: 1 })
  assert.equal(alfa.pctMedianoSobreBarata, 20)
  assert.deepEqual(l.tarificaciones, { avant2: 1, bot: 2 })
})

test('excluye primas inválidas, fuera de rango del ramo e incoherentes (franquicia que no cuadra)', () => {
  const l = observacionesDeTarificaciones([
    tar({
      precios: [
        av('Alfa', 300), av('Beta', null), av('Gamma', 0),
        av('Beta', 280, { modalidad: 'Beta Todo Riesgo Franquicia 450€', categoria: 'Todo Riesgo con Franquicia', franquiciaEur: 600, id: 'x', idVendor: 'x' }),
      ],
    }),
    tar({ id: 'r', canal: 'rpa', precios: [bot('alfa', 5) /* fuera de rango */] }),
  ], CATALOGO)
  assert.equal(l.observaciones.length, 1)
  assert.deepEqual(l.excluidas, { sinPrima: 2, fueraDeRango: 1, incoherentes: 1 })
})

test('compañía fuera del catálogo: compite con una clave propia, sin ficha', () => {
  const l = observacionesDeTarificaciones([tar({ precios: [av('Delta Seguros', 300), av('Alfa', 310)] })], CATALOGO)
  assert.ok(l.observaciones.some((o) => o.companiaCodigo.startsWith('?:') && o.companiaNombre === 'Delta Seguros'))
})

test('un ramo sin niveles (o sin clasificar) queda sin nivel y no compite', () => {
  const l = observacionesDeTarificaciones([tar({ ramo: 'decesos', precios: [av('Alfa', 300), av('Beta', 310)] })], CATALOGO)
  assert.ok(l.observaciones.every((o) => o.nivel === null))
  assert.equal(calcularCompetitividad(l.observaciones).pareja.length, 0)
})

test('tipos de "sin precio": solo Avant2 con fallos guardados; con precio no cuenta como rechazo; NULL no entra', () => {
  const f = (compania: string, motivo: string, tambienDioPrecio = false) => ({ compania, producto: 'P', configuracion: 'c', motivo, tambienDioPrecio })
  const l = observacionesDeTarificaciones([
    tar({ id: '1', fallos: [f('Beta', 'Error: 607. Riesgo no contratable.'), f('Gamma', 'Error: código de envío 2115'), f('Alfa', 'Error: otra config', true)], precios: [av('Alfa', 300)] }),
    tar({ id: '2', fallos: null, precios: [av('Alfa', 300)] }), // anterior al detalle: no se sabe
    tar({ id: '3', canal: 'rpa', fallos: [f('Alfa', 'Riesgo no contratable')], precios: [bot('alfa', 300)] }), // el bot no cuenta rechazos
  ], CATALOGO)
  const por = (c: string) => l.sinPrecio.find((s) => s.companiaCodigo === c)!
  assert.deepEqual({ ...por('C2'), companiaCodigo: '' }, { companiaCodigo: '', ramo: 'auto', anio: 2031, tarificaciones: 1, conPrecio: 0, rechazos: 1, errores: 0 })
  assert.equal(por('C3').errores, 1)
  assert.equal(por('C3').rechazos, 0)
  assert.equal(por('C1').tarificaciones, 1) // solo la tarificación 1; la 2 (fallos NULL) y la 3 (bot) no
  assert.equal(por('C1').conPrecio, 1)
  assert.equal(por('C1').rechazos, 0)
})

test('simuladas o de otro canal no se leen; sin fecha válida tampoco', () => {
  const l = observacionesDeTarificaciones([
    tar({ id: 'm', canal: 'manual', precios: [av('Alfa', 300), av('Beta', 310)] }),
    tar({ id: 'f', fecha: 'ayer', precios: [av('Alfa', 300), av('Beta', 310)] }),
  ], CATALOGO)
  assert.equal(l.observaciones.length, 0)
  assert.deepEqual(l.tarificaciones, { avant2: 0, bot: 0 })
})
