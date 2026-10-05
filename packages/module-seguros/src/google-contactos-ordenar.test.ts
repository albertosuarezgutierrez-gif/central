import test from 'node:test'
import assert from 'node:assert/strict'
import { informeOrdenarAgenda, pistaTrabajo } from './google-contactos-ordenar.ts'
import type { PersonaGoogle } from './google-contactos.ts'
import type { ContactoMovil } from './vcard.ts'

const GRUPO = 'contactGroups/abc'
const p = (rn: string, nombre: string | null, tels: string[], extra: Partial<PersonaGoogle> = {}): PersonaGoogle => ({
  resourceName: rn, ...(nombre ? { names: [{ givenName: nombre, displayName: nombre }] } : {}), phoneNumbers: tels.map((value) => ({ value })), ...extra,
})
const base = { crm: [] as ContactoMovil[], seleccionCompleta: true, vinculos: [], fusiones: new Map<string, string>(), grupoResourceName: GRUPO }

test('ordenar: duplicados por E.164 (escrito distinto primero), sin nombre y no E.164; solo lectura', () => {
  const google = [p('people/1', 'Ana', ['600 11 22 33']), p('people/2', 'Ana móvil', ['+34600112233']), p('people/3', null, ['611000000']), p('people/4', 'Raro', ['12'])]
  const antes = JSON.stringify(google)
  const i = informeOrdenarAgenda({ ...base, google }, { companias: [] })
  assert.equal(i.duplicadosTelefono.total, 1)
  assert.equal(i.duplicadosTelefono.ejemplos[0].escritoDistinto, true)
  assert.equal(i.duplicadosTelefono.ejemplos[0].telefono, '••••••••233')
  assert.deepEqual(i.sinNombre.ejemplos.map((x) => x.resourceName), ['people/3'])
  assert.deepEqual(i.noE164.ejemplos.map((x) => x.resourceName), ['people/4'])
  assert.equal(JSON.stringify(google), antes, 'no toca la entrada')
})

test('ordenar: fichas con otro nombre (del plan real) y contactos que parecen de trabajo', () => {
  const ana: ContactoMovil = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez', telefono: '600112233', email: null, grupo: 'cliente' }
  const google = [p('people/m', 'AA Mama', ['600112233']), p('people/t', 'Taller Paco', ['622000000']), p('people/x', 'Juan', ['633000000'], { organizations: [{ name: 'Mapfre Sevilla' }] }), p('people/y', 'Axarquía', ['644000000'])]
  const i = informeOrdenarAgenda({ ...base, crm: [ana], google }, { companias: ['Mapfre', 'AXA'] })
  assert.deepEqual(i.fichasOtroNombre.ejemplos, [{ clienteId: 'c1', nombreCrm: 'Ana Pérez', nombreEnAgenda: 'AA Mama', motivo: 'nombre_distinto' }])
  assert.deepEqual(i.pareceTrabajo.ejemplos.map((x) => [x.resourceName, x.pista]), [['people/t', 'taller'], ['people/x', 'Mapfre']])
  assert.equal(pistaTrabajo(p('z', 'Seguros Ruiz', []), []), 'seguros')
})
