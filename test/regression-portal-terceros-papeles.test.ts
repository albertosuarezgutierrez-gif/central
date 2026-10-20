// Guardián: qué PAPELES de tercero de un siniestro llegan al portal del CLIENTE (20/10/2026).
//
// Plan `docs/CIMA-SEGUIMIENTO-Y-DATOS.md` B5 (decisión de Alberto): el cliente ve al contrario y a los
// profesionales de su siniestro, pero NUNCA datos de salud (`asistente`) ni de pagos a terceros
// (`receptor_pago`). La ingesta (asegura#891) escribe papeles nuevos en `cima_extra.terceros`, y
// `tercerosParaCliente` se aplica en el puente de asegura y otra vez en el portal: si la lista blanca
// se ensancha o se cae (vuelve a «acepta cualquier papel»), este test cae.
//
// Añadir un papel a `PAPELES_TERCERO_CLIENTE` es una decisión LEGAL: obliga a tocar también esta lista.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAPELES_TERCERO_CLIENTE,
  PAPELES_TERCERO_PROHIBIDOS,
  terceroParaCliente,
  tercerosParaCliente,
} from '../packages/module-seguros-portal/src/personas-cliente.ts'

const ESPERADA = [
  'abogado', 'conductor_asegurado', 'conductor_contrario', 'contacto_asegurado', 'contrario',
  'perito', 'perjudicado', 'taller', 'tercero', 'testigo', 'tramitador',
]

const tercero = (papel: unknown) => ({ papel, nombre: 'Nombre Prueba', matricula: '0000XXX', compania: 'X' })

test('la lista blanca de papeles es EXACTAMENTE la decidida (B5)', () => {
  assert.deepEqual([...PAPELES_TERCERO_CLIENTE].sort(), ESPERADA)
})

test('🚨 «asistente» y «receptor_pago» están prohibidos y no cruzan', () => {
  assert.deepEqual([...PAPELES_TERCERO_PROHIBIDOS].sort(), ['asistente', 'receptor_pago'])
  for (const p of PAPELES_TERCERO_PROHIBIDOS) {
    assert.equal(terceroParaCliente(tercero(p)), null, p)
    assert.deepEqual(tercerosParaCliente([tercero(p)]), [], p)
  }
})

test('🚨 fail-closed: un papel desconocido, «otro» o ausente no cruza', () => {
  for (const p of ['papel_nuevo_de_la_ingesta', 'otro', '', null, undefined]) {
    assert.deepEqual(tercerosParaCliente([tercero(p)]), [], String(p))
  }
})

test('cada papel permitido cruza', () => {
  for (const p of ESPERADA) assert.deepEqual(tercerosParaCliente([tercero(p)]).map((t) => t.papel), [p], p)
})
