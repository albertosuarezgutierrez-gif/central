// La reserva de cuota para los MESES SIN BUCKET elegible (28/08/2026).
//
// Caso fundacional: julio y agosto de 2027. La cola de urgencia antepone —bien— el evento
// CONFIRMADO sin medir, porque su precio está congelado hasta que Booking lo mida. El 28/08 había
// suficientes para comerse las 24 ventanas de la pasada entera, así que los dos únicos meses sin
// bucket del horizonte llevaban días sin que les llegara el turno. Consecuencia medida: sus 62
// noches (el 17% del calendario, iguales en los 4 pisos) se tarificaban con la mediana ANUAL en vez
// de con su temporada — y en Sevilla el ADR de agosto es 102€ contra 142€ de media, así que la
// mediana anual pide de más justo en el mes más flojo del año.
//
// La cura NO es reordenar la cola (eso dejaría precios de evento congelados sin verificar, que es
// justo lo que esa prioridad evita): es reservar suelo de cuota, igual que ya se hizo con los
// bloques caros tras el caso de la Navidad de House.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  conReservas, conReservaAltoValor, planDeVentanas, RESERVA_MES_CORTO, RESERVA_ALTO_VALOR,
  type VentanaPedida,
} from './mercado-cobertura.ts'
import type { Ventana } from './mercado-ventanas.ts'

type Extra = Partial<VentanaPedida>
const v = (checkin: string, extra: Extra = {}): VentanaPedida => ({
  checkin, checkout: checkin, aforo: 4, pisos: ['p'], motivo: 'mes', ronda: 0,
  factor: 1, diasSinMedir: null, comps: 0, mesCorto: false, eventoConfirmado: false, ...extra,
})

// Fechas ÚNICAS a propósito: el plan real nunca produce dos ventanas con la misma
// `(checkin, aforo)` —se genera por (ventana del plan × aforo) y el checkin no se repite—, y la
// clave es lo que usa el reparto para saber qué ya está dentro. Un fixture con claves repetidas
// mide una situación que no existe y hace fallar al código por un motivo falso.
const dia = (n: number) => `2026-1${Math.floor(n / 28)}-${String((n % 28) + 1).padStart(2, '0')}`

/** 30 ventanas de evento confirmado sin medir: la cola que se comía el cupo el 28/08. */
const cola = () => Array.from({ length: 30 }, (_, i) =>
  v(dia(i), { motivo: 'evento', eventoConfirmado: true, factor: 2 }))

const cortas = (n: number) => Array.from({ length: n }, (_, i) =>
  v(`2027-08-${String(i + 1).padStart(2, '0')}`, { mesCorto: true, ronda: 2 }))

test('sin reserva, los meses cortos NO entran: es el fallo del 28/08', () => {
  const pedidas = [...cola(), ...cortas(8)]
  const sinReserva = conReservas(pedidas, 24, { altoValor: 0, mesCorto: 0 })
  assert.equal(sinReserva.filter(x => x.mesCorto).length, 0)
})

test('la reserva por DEFECTO es > 0: si alguien la pone a 0, el fallo del 28/08 vuelve', () => {
  // Fijado con un literal a propósito. Comprobar el comportamiento contra la propia constante que
  // se está probando es tautológico: con la constante a 0 el test seguiría verde y el guardián no
  // guardaría nada. (Lo descubrí probándolo en rojo: la mutación no lo tumbaba.)
  assert.equal(RESERVA_MES_CORTO, 4)
  assert.ok(RESERVA_MES_CORTO >= 1, 'sin reserva, los meses sin bucket no llegan nunca')
})

test('con la reserva entran, y son exactamente las plazas reservadas', () => {
  const pedidas = [...cola(), ...cortas(8)]
  assert.equal(conReservas(pedidas, 24, { altoValor: 0, mesCorto: 4 }).filter(x => x.mesCorto).length, 4)
  assert.equal(conReservas(pedidas, 24, { altoValor: 0, mesCorto: 2 }).filter(x => x.mesCorto).length, 2)
})

test('el DEFECTO del módulo basta para rescatar meses cortos sin pedirlo', () => {
  // Sin pasar `mesCorto`: es como lo llama `planDeVentanas`, así que es el camino real.
  const pedidas = [...cola(), ...cortas(8)]
  assert.ok(conReservas(pedidas, 24).filter(x => x.mesCorto).length >= 1)
})

test('la pasada NO crece: el tope se respeta exactamente', () => {
  const pedidas = [...cola(), ...cortas(8)]
  assert.equal(conReservas(pedidas, 24).length, 24)
  assert.equal(conReservas(pedidas, 10).length, 10)
  // Es reordenar dentro del tope, no medir más: mismo coste de consultas que antes.
  assert.equal(conReservas(pedidas, 24).length, conReservas(pedidas, 24, { altoValor: 0, mesCorto: 0 }).length)
})

test('la reserva que no se usa NO se desperdicia: vuelve a la cola', () => {
  // Sin un solo mes corto que rescatar, la pasada se llena igual que sin reserva.
  const soloCola = cola()
  assert.equal(conReservas(soloCola, 24).length, 24)
  assert.deepEqual(
    conReservas(soloCola, 24, { altoValor: 0 }).map(x => x.checkin),
    soloCola.slice(0, 24).map(x => x.checkin),
  )
})

test('las dos reservas conviven sin pisarse', () => {
  const caras = Array.from({ length: 5 }, (_, i) =>
    v(`2027-12-2${i}`, { motivo: 'evento', eventoConfirmado: true, factor: 3 }))
  const pedidas = [...cola(), ...caras, ...cortas(8)]
  const r = conReservas(pedidas, 24, { altoValor: RESERVA_ALTO_VALOR, mesCorto: RESERVA_MES_CORTO })
  assert.equal(r.length, 24)
  assert.equal(r.filter(x => x.mesCorto).length, RESERVA_MES_CORTO)
  // Los de factor 3 son los más caros vírgenes: la reserva de alto valor los rescata.
  assert.ok(r.filter(x => x.factor === 3).length >= 1)
  // Y ninguna ventana sale repetida.
  const claves = r.map(x => `${x.checkin}|${x.aforo}`)
  assert.equal(new Set(claves).size, claves.length)
})

test('un tope pequeño recorta las reservas en vez de vaciar la cabeza', () => {
  const pedidas = [...cola(), ...cortas(8)]
  const r = conReservas(pedidas, 3)
  assert.equal(r.length, 3)
  // Queda al menos una plaza para la cola de urgencia: la reserva nunca se queda con todo.
  assert.ok(r.some(x => !x.mesCorto))
})

test('el mes corto entra por CERCANÍA, no por orden de llegada', () => {
  const lejos = v('2027-08-30', { mesCorto: true })
  const cerca = v('2027-07-02', { mesCorto: true })
  const r = conReservas([...cola(), lejos, cerca], 24, { altoValor: 0, mesCorto: 1 })
  assert.equal(r.filter(x => x.mesCorto).length, 1)
  assert.equal(r.find(x => x.mesCorto)!.checkin, '2027-07-02')
})

test('la envoltura vieja conReservaAltoValor sigue comportándose igual', () => {
  // No se toca su contrato: hay consumidores y tests que dependen de ella.
  const caras = Array.from({ length: 4 }, (_, i) =>
    v(`2027-12-2${i}`, { motivo: 'evento', eventoConfirmado: true, factor: 3 }))
  const pedidas = [...cola(), ...caras]
  const r = conReservaAltoValor(pedidas, 24)
  assert.equal(r.length, 24)
  assert.ok(r.filter(x => x.factor === 3).length >= 1)
})

test('EL CAMINO REAL: planDeVentanas rescata los meses cortos, no solo la función suelta', () => {
  // Sin este test, revertir el cableado de `planDeVentanas` a la reserva vieja deja `conReservas`
  // huérfana y los tests de arriba siguen verdes: probarían una función que ya no usa nadie.
  // (Comprobado en rojo: esa mutación NO tumbaba ninguno de los otros diez.)
  const plan: Ventana[] = [
    // La cola que se comió el cupo el 28/08: eventos confirmados, nunca medidos.
    ...Array.from({ length: 30 }, (_, i): Ventana => ({
      checkin: dia(i), checkout: dia(i), motivo: 'evento', ronda: 1,
      eventoConfirmado: true, factor: 2,
    })),
    // Julio-2027: las fechas de profundidad que le faltan para tener bucket.
    ...Array.from({ length: 4 }, (_, i): Ventana => ({
      checkin: `2027-07-0${i + 1}`, checkout: `2027-07-0${i + 2}`, motivo: 'mes', ronda: 2,
    })),
  ]
  const aforos = new Map<number, string[]>([[5, ['prop_luxury_busto']]])
  const bucket = { mesesCortos: new Set(['2027-07']), fechasEvento: new Set<string>() }

  const { ventanas } = planDeVentanas(plan, aforos, [], '2026-08-28', 24, {}, bucket)
  const rescatadas = ventanas.filter(v => v.checkin.startsWith('2027-07'))
  assert.ok(rescatadas.length >= 1,
    'julio-2027 tiene que entrar aunque los 30 eventos confirmados vayan por delante')
  assert.equal(ventanas.length, 24, 'y sin que la pasada cueste una consulta más')
})
