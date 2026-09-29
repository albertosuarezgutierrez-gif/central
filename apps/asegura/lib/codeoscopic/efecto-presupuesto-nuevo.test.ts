// Un presupuesto de negocio NUEVO no puede pedirse con efecto «mañana»: la cotización caduca al día
// siguiente (effectiveDate es de solo lectura) y emitir obliga a pagar otra. Alberto, 29/09/2026:
// «por defecto una fecha a unos días, para poder rescatar el presupuesto y no volver a tarificar».
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DIAS_EFECTO_PRESUPUESTO_NUEVO, sumarDias } from './fecha-efecto.ts'
import { precalificarDecesosNueva } from './desde-cartera-decesos.ts'
import { precalificarSaludNueva } from './desde-cartera-salud.ts'
import { precalificarVidaNueva } from './desde-cartera-vida.ts'
import type { ClienteCartera } from './desde-cartera.ts'

const HOY = '2026-09-29'
const CLIENTE = {
  nombre: 'Ana', apellidos: 'Pérez López', dni: null, telefono: null, fechaNacimiento: '1980-01-01',
  estadoCivil: null, saludo: '2', codigoPostal: '41003', fechaCarnet: null,
} as ClienteCartera

const casos = [
  ['decesos', () => precalificarDecesosNueva(CLIENTE, { estadoCivilId: null, capital: 3000 }, HOY)],
  ['salud', () => precalificarSaludNueva(CLIENTE, { estadoCivilId: null, capital: null, modalidadDeseada: null }, HOY)],
  ['vida', () => precalificarVidaNueva(CLIENTE, { estadoCivilId: null, capital: 50000 } as Parameters<typeof precalificarVidaNueva>[1], HOY)],
] as const

for (const [ramo, pre] of casos) {
  test(`${ramo} nuevo: efecto a ${DIAS_EFECTO_PRESUPUESTO_NUEVO} días, declarado como supuesto (no mañana)`, () => {
    const r = pre()
    assert.equal(r.datos.fechaEfecto, sumarDias(HOY, DIAS_EFECTO_PRESUPUESTO_NUEVO))
    assert.notEqual(r.datos.fechaEfecto, '2026-09-30', 'mañana: la cotización caducaría al día siguiente')
    assert.ok(r.supuestos.some((s) => s.campo === 'fechaEfecto'), 'la fecha es un supuesto y se tiene que ver')
  })
}
