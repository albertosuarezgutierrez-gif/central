import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ventanasDelBarrido, picosDeEvento, findeDelMes } from './mercado-ventanas.ts'

const HOY = '2026-08-01' // sábado

test('la base mensual sigue siendo el primer viernes de cada mes', () => {
  assert.equal(findeDelMes(HOY, 1), '2026-09-04')
  assert.equal(findeDelMes(HOY, 2), '2026-10-02')
  // Diciembre de 2026 empieza en martes: su primer viernes es el 4.
  assert.equal(findeDelMes(HOY, 4), '2026-12-04')
})

test('sin eventos: 3 fechas por mes, y la PRIMERA sigue siendo el primer viernes', () => {
  // Cambio deliberado del 01/08/2026: eran 8 ventanas (una por mes) y el motor descartaba el bucket
  // mensual de casi todos los meses por falta de fechas distintas. Ver la cabecera de findeDelMes.
  const v = ventanasDelBarrido(HOY, [], { mesesBase: 8 })
  assert.equal(v.length, 24)
  assert.ok(v.every(x => x.motivo === 'mes'))
  assert.equal(v[0].checkin, '2026-09-04')
  assert.equal(v[0].checkout, '2026-09-06')
})

test('la Feria entera gasta UNA ventana, la de mayor factor', () => {
  const feria = [
    { fecha: '2027-04-12', factor: 2.5 }, { fecha: '2027-04-13', factor: 2.6 },
    { fecha: '2027-04-14', factor: 2.8 }, { fecha: '2027-04-15', factor: 3.0 },
    { fecha: '2027-04-16', factor: 3.2 }, { fecha: '2027-04-17', factor: 3.2 },
    { fecha: '2027-04-18', factor: 2.6 },
  ]
  const picos = picosDeEvento(feria)
  assert.equal(picos.length, 1)
  assert.equal(picos[0].fecha, '2027-04-16', 'empate a 3.2 → gana la primera')
})

test('dos eventos separados son dos bloques', () => {
  const picos = picosDeEvento([
    { fecha: '2026-10-09', factor: 1.35 }, { fecha: '2026-10-10', factor: 1.40 },
    { fecha: '2026-10-30', factor: 1.35 }, { fecha: '2026-10-31', factor: 1.45 },
  ])
  assert.deepEqual(picos.map(p => p.fecha), ['2026-10-10', '2026-10-31'])
})

test('la misma fecha por dos fuentes no abre dos bloques', () => {
  // Karol G está en pricing_eventos_auto por ticketmaster, websearch Y agente.
  const picos = picosDeEvento([
    { fecha: '2027-06-11', factor: 1.6, nombre: 'ticketmaster' },
    { fecha: '2027-06-11', factor: 2.5, nombre: 'agente' },
    { fecha: '2027-06-12', factor: 1.6, nombre: 'ticketmaster' },
  ])
  assert.equal(picos.length, 1)
  assert.equal(picos[0].nombre, 'agente', 'gana el factor mayor')
})

test('lo que NO llega al umbral no gasta ventana', () => {
  assert.equal(picosDeEvento([{ fecha: '2026-09-11', factor: 1.05 }]).length, 0)
})

test('las fechas de evento se añaden a la base y se marcan como tales', () => {
  const v = ventanasDelBarrido(HOY, [
    { fecha: '2026-09-12', factor: 1.4, nombre: 'Bienal' },
    { fecha: '2027-04-16', factor: 3.2, nombre: 'Feria 2027' },
  ], { mesesBase: 2, maxEventos: 6 })

  assert.equal(v.filter(x => x.motivo === 'mes').length, 6) // 2 meses x 3 fechas
  const ev = v.filter(x => x.motivo === 'evento')
  assert.deepEqual(ev.map(x => x.checkin), ['2026-09-12', '2027-04-16'])
  assert.equal(ev[0].etiqueta, 'Bienal')
  // La muestra del segundo sabado se aparta del evento (ver el test dedicado mas abajo).
  assert.ok(!v.some(x => x.motivo === 'mes' && x.checkin === '2026-09-12'))
})

test('prioriza lo CERCANO: lo que ya se está vendiendo', () => {
  const eventos = [
    { fecha: '2027-04-16', factor: 3.2, nombre: 'Feria' },   // lejos, factor enorme
    { fecha: '2026-08-16', factor: 1.6, nombre: 'fútbol' },  // dentro de dos semanas
  ]
  const v = ventanasDelBarrido(HOY, eventos, { mesesBase: 1, maxEventos: 1 })
  const ev = v.filter(x => x.motivo === 'evento')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].checkin, '2026-08-16', 'el cercano gana al de factor mayor pero lejano')
})

test('el tope de eventos se respeta (cada ventana cuesta dinero)', () => {
  const eventos = Array.from({ length: 20 }, (_, i) => ({
    fecha: `2026-1${i < 5 ? '0' : '1'}-${String((i % 5) * 6 + 2).padStart(2, '0')}`,
    factor: 1.5,
  }))
  const v = ventanasDelBarrido(HOY, eventos, { mesesBase: 8, maxEventos: 3 })
  assert.equal(v.filter(x => x.motivo === 'evento').length, 3)
})

test('ninguna fecha se barre dos veces, aunque base y evento coincidan', () => {
  // El 04/09 es el primer viernes de septiembre Y lo marcamos como evento. La muestra se aparta al
  // 11/09 (para que siga sumando al bucket mensual) y el 04/09 se barre como EVENTO.
  const v = ventanasDelBarrido(HOY, [{ fecha: '2026-09-04', factor: 2 }], { mesesBase: 1, maxEventos: 6 })
  const fechas = v.map(x => x.checkin)
  assert.equal(new Set(fechas).size, fechas.length, 'sin checkin repetido')
  assert.equal(v.filter(x => x.motivo === 'mes').length, 3, '3 muestras utiles para el bucket')
  assert.deepEqual(v.filter(x => x.motivo === 'evento').map(x => x.checkin), ['2026-09-04'])
  assert.ok(!v.some(x => x.motivo === 'mes' && x.checkin === '2026-09-04'))
})

test('fuera del horizonte no se barre: el motor tampoco tarifica ahí', () => {
  const v = ventanasDelBarrido(HOY, [{ fecha: '2028-04-16', factor: 3.2 }], { mesesBase: 1, horizonteDias: 365 })
  assert.equal(v.filter(x => x.motivo === 'evento').length, 0)
})

test('una fecha de evento ya pasada no gasta ventana', () => {
  const v = ventanasDelBarrido(HOY, [{ fecha: '2026-04-24', factor: 3.5 }], { mesesBase: 1 })
  assert.equal(v.filter(x => x.motivo === 'evento').length, 0)
})

// ─── 3 fechas por mes: el bucket mensual del motor exige MIN_FECHAS_MES=3 ──────────────────

test('cada mes aporta 3 fechas DISTINTAS, no solo el primer viernes', () => {
  const v = ventanasDelBarrido('2026-08-01', [], { mesesBase: 3, maxEventos: 0 })
  const porMes = new Map()
  for (const w of v) {
    const m = w.checkin.slice(0, 7)
    porMes.set(m, (porMes.get(m) ?? new Set()).add(w.checkin))
  }
  for (const [mes, fechas] of porMes) {
    assert.equal(fechas.size, 3, `${mes} deberia aportar 3 fechas y aporta ${fechas.size}`)
  }
})

test('la mezcla es 2 de finde + 1 entre semana (el bucket se aplica a TODO el mes)', () => {
  // Septiembre de 2026: primer viernes 04, segundo sabado 12, segundo martes 08.
  assert.equal(findeDelMes('2026-08-01', 1, 0), '2026-09-04')
  assert.equal(findeDelMes('2026-08-01', 1, 1), '2026-09-12')
  assert.equal(findeDelMes('2026-08-01', 1, 2), '2026-09-08')
})

test('el orden 0 NO cambia: la serie historica del primer viernes se mantiene', () => {
  assert.equal(findeDelMes('2026-08-01', 3, 0), findeDelMes('2026-08-01', 3))
})

test('el orden del plan protege temporada y eventos si se corta por tiempo', () => {
  const eventos = [{ fecha: '2026-09-20', factor: 2.5, nombre: 'Concierto' }]
  const v = ventanasDelBarrido('2026-08-01', eventos, { mesesBase: 3, maxEventos: 3 })
  // Ronda 0 = una fecha de cada mes; ronda 1 = eventos; despues, profundidad.
  const rondas = v.map(w => w.ronda)
  assert.deepEqual([...rondas].sort((a, b) => a - b), rondas, 'el plan debe venir ordenado por ronda')
  assert.equal(v.filter(w => w.ronda === 0).length, 3, 'una fecha por mes en la primera ronda')
  assert.equal(v.find(w => w.motivo === 'evento')?.ronda, 1, 'los eventos van justo despues')
  // Cortar por presupuesto deja intactas temporada + eventos.
  const supervivientes = v.slice(0, 4)
  assert.equal(supervivientes.filter(w => w.motivo === 'evento').length, 1)
})

test('una fecha de evento que coincide con una de muestra no se barre dos veces', () => {
  const eventos = [{ fecha: findeDelMes('2026-08-01', 2, 1), factor: 2.5 }]
  const v = ventanasDelBarrido('2026-08-01', eventos, { mesesBase: 3, maxEventos: 3 })
  const fechas = v.map(w => w.checkin)
  assert.equal(new Set(fechas).size, fechas.length, 'no puede haber checkin repetido')
})

test('fechasPorMes=1 reproduce el barrido antiguo (una ventana por mes)', () => {
  const v = ventanasDelBarrido('2026-08-01', [], { mesesBase: 4, maxEventos: 0, fechasPorMes: 1 })
  assert.equal(v.length, 4)
  assert.ok(v.every(w => w.ronda === 0))
})

test('una muestra que cae en dia de evento se corre una semana', () => {
  // El 12/09/2026 es el segundo sabado de septiembre (muestra de orden 1) y ademas es Bienal.
  // Si se dejara ahi, el motor la excluiria del bucket mensual y septiembre volveria a quedarse
  // con 2 fechas utiles — el bug que este helper viene a cerrar.
  const v = ventanasDelBarrido(HOY, [{ fecha: '2026-09-12', factor: 2.5, nombre: 'Bienal' }],
    { mesesBase: 1, maxEventos: 6 })
  const base = v.filter(x => x.motivo === 'mes').map(x => x.checkin)
  assert.equal(base.length, 3)
  assert.ok(!base.includes('2026-09-12'), 'ninguna muestra puede caer en la fecha de evento')
  assert.ok(base.includes('2026-09-19'), 'la muestra del segundo sabado se corre al siguiente')
  // Y el evento SI se barre, por su propia ventana.
  assert.deepEqual(v.filter(x => x.motivo === 'evento').map(x => x.checkin), ['2026-09-12'])
})
