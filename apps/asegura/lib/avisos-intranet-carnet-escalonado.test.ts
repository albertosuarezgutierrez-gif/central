// El correo de la intranet no repite el MISMO umbral del carné (90/30/7/0) pero sí manda el siguiente.
// Reutiliza el sello que ya existe (`portal_aviso_enviado`, clave por aviso): sin tabla nueva.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { avisosNuevos, claveAviso, type Pendiente } from './avisos-intranet-reglas.ts'

const HOY = new Date('2026-10-21T08:00:00Z')
const dia = (n: number) => new Date(HOY.getTime() + n * 86_400_000).toISOString().slice(0, 10)
const vacio = { autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], firmas: [] }
const pend = (carnets: Pendiente['carnets']): Pendiente => ({ clienteId: 'c', nombre: null, ...vacio, carnets })

test('🪤 mismo tramo: ya sellado → no se reenvía; tramo siguiente → sí', () => {
  const caduca = dia(100)
  const hoyMasN = (n: number) => new Date(HOY.getTime() + n * 86_400_000)
  const car = [{ id: 'k1', tipo: 'B', fechaCaducidad: caduca }]
  const primero = avisosNuevos(pend(car), hoyMasN(15), new Set())!
  assert.equal(primero.nuevos.length, 1)
  const sello = new Set(primero.nuevos.map(claveAviso))
  assert.match([...sello][0]!, /^carnet_en_ventana:k1@\d{4}-\d{2}-\d{2}#90$/)
  // Una semana después sigue en el tramo de 90: nada nuevo.
  assert.equal(avisosNuevos(pend(car), hoyMasN(22), sello)!.nuevos.length, 0)
  // Entra en el de 30: sale otra vez (y solo una).
  const t30 = avisosNuevos(pend(car), hoyMasN(75), sello)!
  assert.equal(t30.nuevos.length, 1)
  sello.add(claveAviso(t30.nuevos[0]!))
  assert.equal(avisosNuevos(pend(car), hoyMasN(80), sello)!.nuevos.length, 0)
  // Y el de 7 días.
  assert.equal(avisosNuevos(pend(car), hoyMasN(94), sello)!.nuevos.length, 1)
})

test('el resto de tipos conserva su sello tipo:id (caducado, sin nacimiento…)', () => {
  assert.equal(claveAviso({ tipo: 'carnet_caducado', id: 'k1', clave: 'carnet_caducado:k1' }), 'carnet_caducado:k1')
  assert.equal(claveAviso({ tipo: 'carnet_sin_nacimiento', id: 'carnet_nacimiento' }), 'carnet_sin_nacimiento:carnet_nacimiento')
  assert.equal(claveAviso({ tipo: 'carnet_en_ventana', id: 'k1' }), 'carnet_en_ventana:k1', 'sin clave, como siempre')
})

test('un carné sin nacimiento (caducidad null) da UN aviso al correo y no se repite una vez sellado', () => {
  const car = [{ id: 'k1', tipo: 'B', fechaCaducidad: null }, { id: 'k2', tipo: 'A2', fechaCaducidad: null }]
  const r = avisosNuevos(pend(car), HOY, new Set())!
  assert.equal(r.nuevos.length, 1)
  assert.equal(avisosNuevos(pend(car), HOY, new Set(r.nuevos.map(claveAviso)))!.nuevos.length, 0)
})
