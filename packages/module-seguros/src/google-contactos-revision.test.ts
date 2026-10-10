import test from 'node:test'
import assert from 'node:assert/strict'
import { accionesPermitidas, efectoResolucion } from './google-contactos-revision.ts'
import { camposDeCrm, hashCampos, personaDesdeCampos, planificarSync, type PersonaGoogle, type Vinculo } from './google-contactos.ts'
import type { ContactoMovil } from './vcard.ts'

const GRUPO = 'contactGroups/abc'
const ana: ContactoMovil = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez', telefono: '600 11 22 33', email: null, grupo: 'cliente' }
const fueraDelGrupo: PersonaGoogle = { resourceName: 'people/1', etag: 'e1', ...personaDesdeCampos(camposDeCrm(ana)!, 'c1'), memberships: [] }

/** Lo que haría la BD con el efecto de resolver: solo `'ninguno'` deja el vínculo como está. */
function tras(v: Vinculo, efecto: string): Vinculo[] {
  if (efecto === 'ninguno') return [v]
  if (efecto === 'reactivar') return [{ ...v, estado: 'activo' }]
  return [] // olvidar
}

test('🪤 «Mantener CRM» sobre un contacto SACADO del grupo solo cierra: no lo recrea en Google', () => {
  const v: Vinculo = { clienteId: 'c1', resourceName: 'people/1', etag: 'e1', hashEnviado: hashCampos(camposDeCrm(ana)!), origen: 'creado', estado: 'activo' }
  const entrada = (vinculos: Vinculo[]) => ({ crm: [ana], seleccionCompleta: true, vinculos, fusiones: new Map(), google: [fueraDelGrupo], modo: 'completo' as const, grupoResourceName: GRUPO })
  const p1 = planificarSync(entrada([v]))
  assert.equal(p1.revisiones[0].tipo, 'sacado_del_grupo')
  assert.deepEqual(p1.apartar, ['c1'])
  const apartado: Vinculo = { ...v, estado: 'fuera_del_grupo' }

  for (const accion of accionesPermitidas('sacado_del_grupo')) {
    const ef = efectoResolucion('sacado_del_grupo', accion)
    assert.ok(ef.ok)
    assert.equal(ef.altaLead, false)
    const p2 = planificarSync(entrada(tras(apartado, ef.vinculo)))
    assert.equal(p2.crear.length, 0, `${accion} recrearía el contacto`)
    assert.equal(p2.actualizar.length, 0, `${accion} volvería a escribir el contacto`)
  }
})

test('acciones por tipo: «Aceptar como lead» solo para un contacto nuevo del grupo', () => {
  assert.deepEqual(accionesPermitidas('propuesta_lead'), ['aceptar_lead', 'descartar'])
  assert.equal(efectoResolucion('cambio_en_google', 'aceptar_lead').ok, false)
  assert.equal(efectoResolucion('desconocido', 'descartar').ok, false)
  const a = efectoResolucion('propuesta_lead', 'aceptar_lead')
  assert.ok(a.ok && a.altaLead && a.estado === 'aceptada')
  const d = efectoResolucion('propuesta_lead', 'descartar')
  assert.ok(d.ok && !d.altaLead && d.estado === 'descartada')
})
