import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_HABILES_ESPERA_CIMA_DEFECTO, decidirAvisoAnulacionSinCima, decidirAvisoDevolucionSinRecibo, decidirAvisoEmisionSinCima,
  decidirEnlacesPolizaOportunidad, dgsDeOportunidad, diasEsperaCima, diasHabilesEntre, esDiaHabil, estadoSolicitudNormalizado, mismoTomador,
  type OportunidadEnlace, type PolizaNuevaEnlace,
} from './correo-cruce-cima.ts'

// F1 del agente corredor de correo (21/10/2026). Reloj INYECTADO: «hoy» sale del reloj real solo para construir fechas
// relativas; ninguna fecha fija se compara contra el reloj (CLAUDE.md, bomba de tiempo del 17/10).
const iso = (d: Date) => d.toISOString().slice(0, 10)
// «hoy» anclado al último día hábil (sábado/domingo/festivo rompían la aserción de 3 hábiles: fallo del 24/10/2026, sábado).
const HOY = (() => {
  const d = new Date()
  while (!esDiaHabil(iso(d))) d.setUTCDate(d.getUTCDate() - 1)
  return iso(d)
})()

/** El día hábil `n` hábiles ANTES de `hoy` (camina hacia atrás con la misma regla que se prueba aparte). */
function haceHabiles(hoy: string, n: number): string {
  const d = new Date(`${hoy}T00:00:00Z`)
  let k = 0
  while (k < n) {
    d.setUTCDate(d.getUTCDate() - 1)
    if (esDiaHabil(iso(d))) k++
  }
  return iso(d)
}

test('días hábiles: sábados y domingos no cuentan; festivo nacional fijo tampoco; fecha mala = null (no 0)', () => {
  // El próximo sábado y domingo a partir de hoy.
  const d = new Date(`${HOY}T00:00:00Z`)
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1)
  const sabado = iso(d)
  d.setUTCDate(d.getUTCDate() + 1)
  const domingo = iso(d)
  d.setUTCDate(d.getUTCDate() + 1)
  const lunes = iso(d)
  assert.equal(esDiaHabil(sabado), false)
  assert.equal(esDiaHabil(domingo), false)
  assert.equal(diasHabilesEntre(sabado, domingo), 0)
  assert.equal(diasHabilesEntre(sabado, lunes), esDiaHabil(lunes) ? 1 : 0)
  // 25 de diciembre del año que viene: festivo fijo.
  assert.equal(esDiaHabil(`${Number(HOY.slice(0, 4)) + 1}-12-25`), false)
  assert.equal(diasHabilesEntre('no-es-fecha', HOY), null)
  assert.equal(diasHabilesEntre(HOY, '2026-02-30'), null)
  // Hacia atrás no cuenta en negativo.
  assert.equal(diasHabilesEntre(HOY, haceHabiles(HOY, 3)), 0)
  assert.equal(diasHabilesEntre(haceHabiles(HOY, 3), HOY), 3)
})

test('🪤 emisión sin CIMA: con 4 días hábiles NO se avisa; con 5 (el plazo) y 6, sí', () => {
  assert.equal(diasEsperaCima('occident'), DIAS_HABILES_ESPERA_CIMA_DEFECTO)
  assert.equal(DIAS_HABILES_ESPERA_CIMA_DEFECTO, 5)
  // Se ancla en un día hábil para que «n hábiles antes» sea exacto.
  const hoy = esDiaHabil(HOY) ? HOY : haceHabiles(HOY, 1)
  const base = { compania: 'occident', hoy, enCima: false as const }
  assert.equal(decidirAvisoEmisionSinCima({ ...base, fechaCorreo: haceHabiles(hoy, 4) }), 'esperar')
  assert.equal(decidirAvisoEmisionSinCima({ ...base, fechaCorreo: haceHabiles(hoy, 5) }), 'avisar')
  assert.equal(decidirAvisoEmisionSinCima({ ...base, fechaCorreo: haceHabiles(hoy, 6) }), 'avisar')
})

test('emisión sin CIMA: CIMA ya la trae → en_cima; no se pudo mirar o sin fecha → no_se_sabe (nunca «avisar»)', () => {
  const vieja = haceHabiles(HOY, 20)
  assert.equal(decidirAvisoEmisionSinCima({ compania: 'allianz', fechaCorreo: vieja, hoy: HOY, enCima: true }), 'en_cima')
  assert.equal(decidirAvisoEmisionSinCima({ compania: 'allianz', fechaCorreo: vieja, hoy: HOY, enCima: null }), 'no_se_sabe')
  assert.equal(decidirAvisoEmisionSinCima({ compania: 'allianz', fechaCorreo: null, hoy: HOY, enCima: false }), 'no_se_sabe')
})

test('anulación y devolución por correo: plazo de 2 hábiles; reflejada → en_cima; no se sabe → no_se_sabe', () => {
  const hoy = esDiaHabil(HOY) ? HOY : haceHabiles(HOY, 1)
  assert.equal(decidirAvisoAnulacionSinCima({ fechaCorreo: haceHabiles(hoy, 1), hoy, sigueEnVigor: true }), 'esperar')
  assert.equal(decidirAvisoAnulacionSinCima({ fechaCorreo: haceHabiles(hoy, 2), hoy, sigueEnVigor: true }), 'avisar')
  assert.equal(decidirAvisoAnulacionSinCima({ fechaCorreo: haceHabiles(hoy, 9), hoy, sigueEnVigor: false }), 'en_cima')
  assert.equal(decidirAvisoAnulacionSinCima({ fechaCorreo: haceHabiles(hoy, 9), hoy, sigueEnVigor: null }), 'no_se_sabe')
  assert.equal(decidirAvisoDevolucionSinRecibo({ fechaCorreo: haceHabiles(hoy, 1), hoy, reciboEnCartera: false }), 'esperar')
  assert.equal(decidirAvisoDevolucionSinRecibo({ fechaCorreo: haceHabiles(hoy, 3), hoy, reciboEnCartera: false }), 'avisar')
  assert.equal(decidirAvisoDevolucionSinRecibo({ fechaCorreo: haceHabiles(hoy, 3), hoy, reciboEnCartera: true }), 'en_cima')
  assert.equal(decidirAvisoDevolucionSinRecibo({ fechaCorreo: haceHabiles(hoy, 3), hoy, reciboEnCartera: null }), 'no_se_sabe')
})

test('estado normalizado de la solicitud: fase conocida, caducidad → cerrada; lo no reconocido es null', () => {
  assert.equal(estadoSolicitudNormalizado('emitida', 'Solicitud emitida · póliza 1'), 'emitida')
  assert.equal(estadoSolicitudNormalizado(null, 'Caducidad de solicitud'), 'cerrada')
  assert.equal(estadoSolicitudNormalizado(null, 'RE: SIN FRANQUICIA'), null)
  assert.equal(estadoSolicitudNormalizado('ganada', null), null)
})

// ── Enlace póliza ↔ oportunidad ──────────────────────────────────────────────

const AHORA = Date.now()
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString()

const op = (o: Partial<OportunidadEnlace> = {}): OportunidadEnlace => ({
  id: 'op1', clienteId: 'c1', dniHash: 'h1', ramo: 'hogar', codigoDgs: 'C0468', creadaEn: hace(20), ...o,
})
const pol = (p: Partial<PolizaNuevaEnlace> = {}): PolizaNuevaEnlace => ({
  id: 'p1', clienteId: 'c1', dniHash: 'h1', ramo: 'hogar', codigoDgs: 'C0468', numeroPoliza: '540000001', creadaEn: hace(1), previaMismoRiesgo: false, ...p,
})

test('heurística uno a uno: misma ficha + compañía + ramo → enlace', () => {
  const d = decidirEnlacesPolizaOportunidad([op()], [pol()], [])
  assert.deepEqual(d.enlaces, [{ oportunidadId: 'op1', polizaId: 'p1', via: 'tomador_compania_ramo', solicitudId: null }])
  assert.deepEqual(d.ambiguos, [])
})

test('🪤 póliza que casa con DOS oportunidades → ningún enlace y se avisa', () => {
  const d = decidirEnlacesPolizaOportunidad([op(), op({ id: 'op2' })], [pol()], [])
  assert.deepEqual(d.enlaces, [])
  assert.equal(d.ambiguos.length, 1)
  assert.equal(d.ambiguos[0].motivo, 'varias_oportunidades')
  assert.deepEqual(d.ambiguos[0].oportunidades.sort(), ['op1', 'op2'])
})

test('oportunidad con DOS pólizas candidatas → ningún enlace (las dos avisadas)', () => {
  const d = decidirEnlacesPolizaOportunidad([op()], [pol(), pol({ id: 'p2', numeroPoliza: '540000002' })], [])
  assert.deepEqual(d.enlaces, [])
  assert.deepEqual(d.ambiguos.map((a) => a.motivo), ['varias_polizas', 'varias_polizas'])
})

test('identidad: otra ficha con el MISMO índice ciego casa; con otro NIF o sin él, jamás (nunca por nombre)', () => {
  assert.equal(mismoTomador({ clienteId: 'a', dniHash: 'h' }, { clienteId: 'b', dniHash: 'h' }), true)
  assert.equal(mismoTomador({ clienteId: 'a', dniHash: 'h' }, { clienteId: 'b', dniHash: 'x' }), false)
  assert.equal(mismoTomador({ clienteId: 'a', dniHash: null }, { clienteId: 'b', dniHash: null }), false)
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ clienteId: 'c2', dniHash: 'otro' })], []).enlaces.length, 0)
})

test('sin compañía o ramo en la oportunidad, otra compañía, póliza ANTERIOR a la oportunidad o posible renovación → no casa', () => {
  assert.equal(decidirEnlacesPolizaOportunidad([op({ codigoDgs: null })], [pol()], []).enlaces.length, 0)
  assert.equal(decidirEnlacesPolizaOportunidad([op({ ramo: null })], [pol()], []).enlaces.length, 0)
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ codigoDgs: 'C0109' })], []).enlaces.length, 0)
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ ramo: 'auto' })], []).enlaces.length, 0)
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ creadaEn: hace(40) })], []).enlaces.length, 0)
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ previaMismoRiesgo: true })], []).enlaces.length, 0)
})

test('nº de solicitud → póliza gana a la heurística (aunque sea de otra compañía de ramo, fecha…); dos pólizas con ese nº → ambiguo', () => {
  // Misma ficha, otro ramo y anterior a la oportunidad: por heurística no casaría; por solicitud, sí (es prueba).
  const p = pol({ ramo: 'auto', creadaEn: hace(40), numeroPoliza: '0540000001' })
  const d = decidirEnlacesPolizaOportunidad([op(), op({ id: 'op2' })], [p], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000001', oportunidadId: 'op2' }])
  assert.deepEqual(d.enlaces, [{ oportunidadId: 'op2', polizaId: 'p1', via: 'solicitud', solicitudId: 's1' }])
  assert.deepEqual(d.solicitudesConPoliza, [{ solicitudId: 's1', polizaId: 'p1' }])
  assert.deepEqual(d.ambiguos, [])
  // Otra ficha pero el MISMO NIF (índice ciego): es el mismo tomador → enlaza.
  const mismoNif = decidirEnlacesPolizaOportunidad([op()], [pol({ clienteId: 'c9', dniHash: 'h1' })], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000001', oportunidadId: 'op1' }])
  assert.equal(mismoNif.enlaces.length, 1)
  // Misma póliza de OTRA compañía: no casa por solicitud.
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ codigoDgs: 'C0109' })], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000001', oportunidadId: 'op1' }]).solicitudesConPoliza.length, 0)
  const dos = decidirEnlacesPolizaOportunidad([op()], [pol(), pol({ id: 'p2' })], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000001', oportunidadId: 'op1' }])
  assert.deepEqual(dos.enlaces, [])
  assert.deepEqual(dos.ambiguos.map((a) => a.motivo), ['solicitud_varias_polizas', 'solicitud_varias_polizas'])
})

test('🪤 nº de solicitud que casa con una póliza de OTRO tomador → no se gana la oportunidad: ambiguo', () => {
  for (const otro of [pol({ clienteId: 'c9', dniHash: null }), pol({ clienteId: 'c9', dniHash: 'h9' })]) {
    const d = decidirEnlacesPolizaOportunidad([op()], [otro], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000001', oportunidadId: 'op1' }])
    assert.deepEqual(d.enlaces, [])
    assert.deepEqual(d.ambiguos, [{ polizaId: 'p1', oportunidades: ['op1'], motivo: 'solicitud_otro_tomador', solicitudId: 's1' }])
  }
  // Esa oportunidad tampoco se gana luego por la heurística con otra póliza (ya está en duda).
  const d2 = decidirEnlacesPolizaOportunidad([op()], [pol({ clienteId: 'c9', dniHash: null }), pol({ id: 'p2', numeroPoliza: '540000099' })], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000001', oportunidadId: 'op1' }])
  assert.deepEqual(d2.enlaces, [])
})

test('compañía de la oportunidad: la de su solicitud; si no, la ganadora por nombre solo si es una', () => {
  assert.equal(dgsDeOportunidad({ companiaSolicitud: 'reale', aseguradoraGanadora: null }), 'C0613')
  assert.equal(dgsDeOportunidad({ companiaSolicitud: null, aseguradoraGanadora: 'Seguros Catalana Occidente' }), 'C0468')
  // Plus Ultra es del grupo pero tiene OTRO código DGS: por «catalana» no se le pone el de Occident.
  assert.equal(dgsDeOportunidad({ companiaSolicitud: null, aseguradoraGanadora: 'Plus Ultra Seguros (Grupo Catalana)' }), null)
  assert.equal(dgsDeOportunidad({ companiaSolicitud: null, aseguradoraGanadora: 'Generali' }), null)
  assert.equal(dgsDeOportunidad({ companiaSolicitud: null, aseguradoraGanadora: null }), null)
})
