import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { notaCierreDocumentacion, planSolicitud, textoTareaRechazo, validarEntradaEvento, type ItemEvento } from './correo-evento.ts'

// F0 del agente corredor de correo (21/10/2026): la solicitud de Occident EMITIDA (con nº de póliza) y RECHAZADA.
// · Emitida → estado en la oportunidad + cierre de la tarea «enviar documentación». NUNCA se crea ni toca la póliza: CIMA.
// · Rechazada → tarea en la oportunidad (abierta) con el código de motivo de la compañía, nunca la nota libre.
// Datos inventados del mismo formato que los reales; `hoy` inyectado (nunca el reloj).
const HOY = new Date().toISOString().slice(0, 10)

function entrada(evento: Record<string, unknown>) {
  return validarEntradaEvento({
    mensajeId: '<m-f0@occidentinforma.com>',
    evento: { compania: 'occident', codigoDgs: 'C0468', tipo: 'solicitud', ilegibles: 0, numeroSolicitud: '170000021', ramo: 'Acc.colec.', tomador: 'ACADEMIA INVENTADA SL', estado: 'Solicitud emitida · póliza 540000021', url: null, fase: 'emitida', numeroPoliza: '540000021', motivoRechazo: null, ...evento },
  })
}
type ItemSolicitud = Extract<ItemEvento, { tipo: 'solicitud' }>
const itemDe = (v: ReturnType<typeof entrada>): ItemSolicitud => {
  assert.ok(v.ok)
  return v.entrada.items[0] as ItemSolicitud
}

test('validarEntradaEvento: fase y póliza de la emitida pasan; una fase desconocida es null; la póliza solo con «emitida»', () => {
  const i = itemDe(entrada({}))
  assert.equal(i.fase, 'emitida')
  assert.equal(i.numeroPoliza, '540000021')
  assert.doesNotMatch(JSON.stringify(i), /ACADEMIA/)
  assert.equal(itemDe(entrada({ fase: 'ganada' })).fase, null)
  // Un nº de póliza en otra fase no significa nada aquí: no se guarda.
  assert.equal(itemDe(entrada({ fase: 'aceptada' })).numeroPoliza, null)
  // Póliza ilegible en una emitida: se cuenta, no se inventa.
  const v = entrada({ numeroPoliza: '<script>' })
  assert.ok(v.ok)
  assert.equal((v.entrada.items[0] as ItemSolicitud).numeroPoliza, null)
  assert.equal(v.entrada.ilegibles, 1)
  // El motivo solo con «rechazada», y pasa por la limpieza de texto libre.
  assert.equal(itemDe(entrada({ fase: 'rechazada', numeroPoliza: null, motivoRechazo: 'RIESGO EXCLUIDO 12345678Z' })).motivoRechazo, 'RIESGO EXCLUIDO [retirado]')
  assert.equal(itemDe(entrada({ motivoRechazo: 'RIESGO EXCLUIDO' })).motivoRechazo, null)
})

const OP = { id: 'op-1', clienteId: 'cli-1', estado: 'en_negociacion', ramo: 'accidentes', cliente: 'Academia Inventada SL' }
const item = (o: Partial<ItemSolicitud>): ItemSolicitud =>
  ({ tipo: 'solicitud', clave: '170000021', numeroSolicitud: '170000021', ramo: 'Acc.colec.', estado: null, url: null, fase: null, numeroPoliza: null, motivoRechazo: null, ...o })

test('planSolicitud EMITIDA: «emitida póliza N», cierra la tarea de documentación de ESA solicitud, no crea ninguna', () => {
  const p = planSolicitud(item({ fase: 'emitida', numeroPoliza: '540000021', estado: 'Solicitud emitida · póliza 540000021' }), 'occident', OP, { fechaCorreo: HOY, hoy: HOY })
  assert.ok(p.estado === 'aplicado')
  assert.match(p.resumen, /emitida póliza 540000021/)
  assert.equal(p.cerrarTareaDocumentacion, 'Enviar documentación a Occident — Solicitud 170000021')
  assert.equal(p.tareaDocumentacion, null)
  assert.equal(p.tareaRechazo, null)
  assert.equal(p.detalleHistorial.numeroPoliza, '540000021')
  assert.equal(p.detalleHistorial.fase, 'emitida')
  // Aunque el estado dijera «PTE DOCUMENTACION», una emitida no pide documentación.
  const q = planSolicitud(item({ fase: 'emitida', numeroPoliza: '540000021', estado: 'PRIMA / PROY * PTE DOCUMENTACION' }), 'occident', OP, { fechaCorreo: null, hoy: HOY })
  assert.ok(q.estado === 'aplicado' && q.tareaDocumentacion === null)
  // Emitida sin nº legible: también cierra la de documentación, y lo dice.
  const r = planSolicitud(item({ fase: 'emitida', numeroPoliza: null }), 'occident', OP, { fechaCorreo: null, hoy: HOY })
  assert.ok(r.estado === 'aplicado' && r.cerrarTareaDocumentacion !== null)
  assert.match(r.resumen, /dudoso/)
})

test('planSolicitud RECHAZADA con la oportunidad abierta → tarea para HOY con el motivo; cerrada → solo nota', () => {
  const p = planSolicitud(item({ fase: 'rechazada', estado: 'Solicitud rechazada', motivoRechazo: 'RIESGO EXCLUIDO' }), 'occident', OP, { fechaCorreo: null, hoy: HOY })
  assert.ok(p.estado === 'aplicado' && p.tareaRechazo)
  assert.equal(p.tareaRechazo.fechaLimite, HOY)
  assert.equal(p.tareaRechazo.observaciones, textoTareaRechazo('occident', '170000021', 'RIESGO EXCLUIDO'))
  assert.match(p.tareaRechazo.observaciones, /RECHAZADO la solicitud 170000021 \(motivo: RIESGO EXCLUIDO\)/)
  assert.equal(p.tareaDocumentacion, null)
  assert.equal(p.cerrarTareaDocumentacion, null)
  const g = planSolicitud(item({ fase: 'rechazada', estado: 'Solicitud rechazada' }), 'occident', { ...OP, estado: 'perdida' }, { fechaCorreo: null, hoy: HOY })
  assert.ok(g.estado === 'aplicado' && g.tareaRechazo === null)
  // Sin oportunidad: bandeja, como siempre.
  assert.equal(planSolicitud(item({ fase: 'emitida', numeroPoliza: '540000021' }), 'occident', null, { fechaCorreo: null, hoy: HOY }).estado, 'sin_resolver')
})

test('planSolicitud sin fase (eventos de antes de F0): igual que siempre — PTE DOCUMENTACION crea la tarea, nada se cierra', () => {
  const p = planSolicitud({ tipo: 'solicitud', clave: '170000001', numeroSolicitud: '170000001', ramo: null, estado: 'PRIMA / PROY * PTE DOCUMENTACION', url: null }, 'occident', OP, { fechaCorreo: null, hoy: HOY })
  assert.ok(p.estado === 'aplicado' && p.tareaDocumentacion && p.cerrarTareaDocumentacion === null && p.tareaRechazo === null)
})

test('notaCierreDocumentacion dice por qué se cerró (con o sin póliza)', () => {
  assert.match(notaCierreDocumentacion('540000021'), /EMITIDA \(póliza 540000021\)/)
  assert.doesNotMatch(notaCierreDocumentacion(null), /póliza/)
})

test('🪤 la emitida cierra SOLO si el estado se aplicó y SOLO la tarea de documentación de esa oportunidad (texto exacto)', () => {
  const src = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  const ap = src.slice(src.indexOf('async function aplicarSolicitud('), src.indexOf('async function procesarSolicitud('))
  const cierre = ap.indexOf('if (actualizado && plan.cerrarTareaDocumentacion)')
  assert.ok(cierre > ap.indexOf('progreso.estadoAplicado = true'), 'tras confirmar el estado (un correo viejo no cierra nada)')
  const tramo = ap.slice(cierre, ap.indexOf('const t = plan.tareaDocumentacion'))
  assert.match(tramo, /and oportunidad_id = \$\{op\.id\}::uuid/)
  assert.match(tramo, /and observaciones = \$\{plan\.cerrarTareaDocumentacion\}/)
  // La póliza no se escribe desde el correo: ni insert ni update de `polizas` en el camino de la solicitud.
  assert.doesNotMatch(ap, /(insert into|update) polizas/i)
})
