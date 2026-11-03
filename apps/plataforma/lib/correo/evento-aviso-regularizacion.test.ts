import test from 'node:test'
import assert from 'node:assert/strict'
import { textoAvisoEvento, type ResultadoPuertoEvento } from './evento-aviso.ts'
import type { EventoAseguradora } from '@central/module-seguros'

const url = (id: string) => `https://x/ficha/${id}`
const ev = (o: Record<string, unknown>): EventoAseguradora => ({
  tipo: 'suplemento', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0, numeroPoliza: 'BIDS000001',
  descripcion: 'Regularización de RC', periodoDesde: '2025-06', periodoHasta: '2026-06', subtipo: 'regularizacion_rc', ...o,
} as EventoAseguradora)
const res: ResultadoPuertoEvento = {
  clave: 'BIDS000001', estado: 'aplicado', repetido: false, resumen: 'tarea creada', motivo: null,
  clienteId: 'c1', cliente: 'Persona Prueba', numeroPoliza: 'BIDS000001', tareaVence: '2026-11-17',
}

test('aviso de regularización: 1er aviso sin la marca de 2º aviso', () => {
  const t = textoAvisoEvento(ev({ esRecordatorio: false }), 'Regularización responsabilidad civil', [res], url)
  assert.match(t, /Regularización de RC/)
  assert.doesNotMatch(t, /2º aviso/)
})

test('aviso de regularización: recordatorio lleva «⚠️ 2º aviso» y la fecha de la carta', () => {
  const t = textoAvisoEvento(ev({ esRecordatorio: true, fechaEnvioCompania: '2026-10-02' }), 'Suscripción RC.constr.', [res], url)
  assert.match(t, /⚠️ 2º aviso: regularización de RC/)
  assert.match(t, /⚠️ 2º aviso · Póliza BIDS000001/)
  assert.match(t, /carta del 02\/10\/2026/)
})

test('aviso con el puerto caído: el 2º aviso también se distingue', () => {
  const t = textoAvisoEvento(ev({ esRecordatorio: true }), 'Suscripción RC.constr.', null, url)
  assert.match(t, /⚠️ 2º aviso · Póliza BIDS000001/)
})
