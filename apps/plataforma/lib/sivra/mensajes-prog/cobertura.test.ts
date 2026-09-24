import test from 'node:test'
import assert from 'node:assert/strict'
import { revisarCobertura, claveAviso, textoCobertura, AVISO_ANTELACION_DIAS, type EntradaCobertura } from './cobertura.ts'

const PISOS = [
  { propertyId: 'prop_luxury_busto', piso: 'Luxury Busto' },
  { propertyId: 'prop_duplex_center', piso: 'Duplex Center' },
]

const base: EntradaCobertura = {
  hoy: '2026-09-05',
  reservas: [],
  pisosActivos: new Set(['prop_luxury_busto', 'prop_duplex_center']),
  pisosConocidos: PISOS,
  pisosDeclarados: new Set(['prop_luxury_busto', 'prop_duplex_center']),
  sombraPendiente: [],
}

const reserva = (extra: Partial<EntradaCobertura['reservas'][0]> = {}) => ({
  bookingId: '154265696',
  propertyId: 'prop_luxury_busto',
  piso: 'Luxury Busto',
  huesped: 'Mafalda Soares Caldas',
  checkIn: '2026-09-05',
  hitosEnviados: [] as string[],
  ...extra,
})

test('el día normal no dice nada', () => {
  assert.deepEqual(revisarCobertura(base), [])
  assert.equal(textoCobertura([]), null)
})

// El caso REAL del 05/09/2026: llegaba ese mediodía y su víspera con los códigos estaba atrapada
// en una fila `sombra`. Nada del sistema lo dijo; se encontró mirando a mano.
test('un huésped que llega HOY sin acceso enviado se canta', () => {
  const h = revisarCobertura({ ...base, reservas: [reserva()] })
  assert.equal(h.length, 1)
  assert.equal(h[0].clase, 'llega_sin_acceso')
  assert.match(textoCobertura(h)!, /entra HOY/)
  assert.match(textoCobertura(h)!, /Mafalda/)
})

test('con la víspera ya enviada se calla', () => {
  const h = revisarCobertura({ ...base, reservas: [reserva({ hitosEnviados: ['vispera_llegada'] })] })
  assert.deepEqual(h, [])
})

test('el mensaje de acceso a 7 días también cuenta como cubierto', () => {
  const h = revisarCobertura({ ...base, reservas: [reserva({ hitosEnviados: ['acceso'] })] })
  assert.deepEqual(h, [])
})

// Una confirmación NO son instrucciones: el huésped sabe que reservó, no cómo entrar.
test('la confirmación sola no cubre la llegada', () => {
  const h = revisarCobertura({ ...base, reservas: [reserva({ hitosEnviados: ['confirmacion'] })] })
  assert.equal(h[0]?.clase, 'llega_sin_acceso')
})

test('fuera de la ventana de antelación no se avisa todavía', () => {
  const lejos = revisarCobertura({ ...base, reservas: [reserva({ checkIn: '2026-09-12' })] })
  assert.deepEqual(lejos, [])
  const justo = revisarCobertura({ ...base, reservas: [reserva({ checkIn: '2026-09-07' })] })
  assert.equal(justo[0]?.clase, 'llega_sin_acceso')
  assert.equal((justo[0] as { dias: number }).dias, AVISO_ANTELACION_DIAS)
})

test('una llegada ya pasada no se reabre', () => {
  const h = revisarCobertura({ ...base, reservas: [reserva({ checkIn: '2026-09-04' })] })
  assert.deepEqual(h, [])
})

// El caso del Dúplex: no estaba ni activo ni inactivo, no existía para el interruptor.
test('un piso conocido sin fila en mensajes_prog_pisos se canta', () => {
  const h = revisarCobertura({
    ...base,
    pisosDeclarados: new Set(['prop_luxury_busto']),
    pisosActivos: new Set(['prop_luxury_busto']),
  })
  assert.equal(h.length, 1)
  assert.equal(h[0].clase, 'piso_sin_interruptor')
  assert.match(textoCobertura(h)!, /Duplex Center/)
})

// Un piso en sombra NO es una avería, pero sus huéspedes tampoco reciben nada: se cuenta aparte.
test('un piso en sombra con reservas llegando se declara, no se calla', () => {
  const h = revisarCobertura({
    ...base,
    pisosActivos: new Set(['prop_luxury_busto']),
    reservas: [reserva({ propertyId: 'prop_duplex_center', piso: 'Duplex Center' })],
  })
  assert.equal(h.length, 1)
  assert.equal(h[0].clase, 'piso_en_sombra_con_reservas')
})

// …pero si además NO está declarado, ese hallazgo ya lo dice todo: no se avisa dos veces.
test('piso sin interruptor no duplica el aviso de sombra', () => {
  const h = revisarCobertura({
    ...base,
    pisosActivos: new Set(['prop_luxury_busto']),
    pisosDeclarados: new Set(['prop_luxury_busto']),
    reservas: [reserva({ propertyId: 'prop_duplex_center', piso: 'Duplex Center' })],
  })
  assert.equal(h.length, 1)
  assert.equal(h[0].clase, 'piso_sin_interruptor')
})

test('hitos en sombra pendientes de un piso ACTIVO se cantan', () => {
  const h = revisarCobertura({
    ...base,
    sombraPendiente: [
      { propertyId: 'prop_luxury_busto', tipo: 'bienvenida' },
      { propertyId: 'prop_luxury_busto', tipo: 'confirmacion' },
    ],
  })
  assert.equal(h.length, 1)
  assert.deepEqual((h[0] as { hitos: string[] }).hitos, ['bienvenida', 'confirmacion'])
})

test('los hitos en sombra de un piso inactivo son lo normal y no se cantan', () => {
  const h = revisarCobertura({
    ...base,
    pisosActivos: new Set(['prop_duplex_center']),
    sombraPendiente: [{ propertyId: 'prop_luxury_busto', tipo: 'bienvenida' }],
  })
  assert.deepEqual(h, [])
})

test('la clave de dedupe es por hallazgo y por día', () => {
  const h = revisarCobertura({ ...base, reservas: [reserva()] })
  assert.equal(claveAviso(h[0], '2026-09-05'), '2026-09-05:llega_sin_acceso:154265696')
  assert.notEqual(claveAviso(h[0], '2026-09-06'), claveAviso(h[0], '2026-09-05'))
})
