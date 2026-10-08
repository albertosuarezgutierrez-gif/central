// Humo del PDF de la propuesta de escenarios: se pinta, lleva un bloque por escenario y no lleva DNI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nombreFicheroPropuesta, pdfPropuestaEscenarios } from './propuesta-escenarios-pdf.ts'
import type { VistaPropuesta } from './propuesta-escenarios.ts'

const vista: VistaPropuesta = {
  id: '00000000-0000-0000-0000-000000000001', referencia: 'ASP-26-0001', oportunidadId: '00000000-0000-0000-0000-000000000002',
  creadoAt: '2026-10-07T10:00:00.000Z', creadoPor: 'alberto', canalAviso: null, avisadoAt: null, retiradaAt: null,
  cliente: 'Rafael López', ramo: 'auto',
  escenarios: [
    { numero: 1, presupuestoId: 'b', referencia: 'AS-26-0042', etiqueta: 'Tomador: Rafael · Conductor: Ana · Propietario: Rafael',
      tomador: { clienteId: 'r', nombre: 'Rafael López' }, estado: 'borrador', venceEl: '2026-10-20T00:00:00.000Z', masEconomica: true, primaMinima: 498.75,
      seguroAnterior: 'Seguro anterior: Mapfre · 5 años sin siniestros',
      opciones: [{ compania: 'Reale', producto: 'Terceros Ampliado', modalidad: null, primaEur: 498.75, coberturas: ['Responsabilidad civil', 'Lunas'] }] },
    { numero: 2, presupuestoId: 'a', referencia: 'AS-26-0041', etiqueta: 'Tomador: Ana · Conductor: Ana · Propietario: Rafael',
      tomador: { clienteId: 'n', nombre: 'Ana García' }, estado: 'borrador', venceEl: '2026-10-20T00:00:00.000Z', masEconomica: false, primaMinima: 1234.56,
      seguroAnterior: 'Seguro anterior: no consta',
      opciones: [{ compania: 'Allianz', producto: 'Todo riesgo', modalidad: 'Franquicia 300', primaEur: 1234.56, coberturas: [] }] },
  ],
}

test('el PDF se pinta con un bloque por escenario', async () => {
  const bytes = await pdfPropuestaEscenarios(vista)
  assert.ok(bytes.length > 2000)
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  assert.equal(nombreFicheroPropuesta(vista), 'propuesta-ASP-26-0001-Rafael-Lopez-2026-10-07.pdf')
})

test('🪤 la vista del puerto no lleva figuras (con DNI): solo la etiqueta ya escrita', () => {
  const src = readFileSync(new URL('./propuesta-escenarios.ts', import.meta.url), 'utf8')
  const tipo = src.slice(src.indexOf('export type EscenarioVista'), src.indexOf('export type VistaPropuesta'))
  assert.doesNotMatch(tipo, /figuras|dni/i)
  const leer = src.slice(src.indexOf('const escenarios: EscenarioVista[]'), src.indexOf('/** Las propuestas de una oportunidad'))
  assert.doesNotMatch(leer, /figuras: e\.figuras|\.\.\.e[,\s]/, 'no se copia el escenario entero (llevaría las figuras)')
})

test('🪤 avisar exige `confirmar: true` ANTES de leer o escribir nada', () => {
  const src = readFileSync(new URL('./propuesta-escenarios.ts', import.meta.url), 'utf8')
  const avisar = src.slice(src.indexOf('export async function avisarPropuesta'))
  const guarda = avisar.indexOf("if (e.confirmar !== true) return error('sin_confirmar'")
  assert.ok(guarda > 0 && guarda < avisar.indexOf('leerPropuesta('), 'la confirmación va lo primero')
  for (const s of ['prepararAviso(', 'ejecutarAviso(']) {
    const i = avisar.indexOf(s)
    assert.ok(i > 0 && guarda < i, `la confirmación va antes de ${s}`)
  }
})
