import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ventanasQuePedir, planDeVentanas, parsearParametrosPlan, detalleIngesta, ingestaFiable,
  mesesSinBucket, FUENTES_FIABLES, MAX_VENTANAS_DEFECTO, MAX_VENTANAS_TECHO, MIN_FECHAS_BUCKET,
} from './mercado-cobertura.ts'
import { ventanasDelBarrido } from './mercado-ventanas.ts'

const HOY = '2026-08-06'
const AFOROS = new Map<number, string[]>([
  [4, ['prop_duplex_center']],
  [12, ['prop_house_sevillana']],
])

test('serper NO cuenta como cobertura fiable', () => {
  // Es el corazón del cambio: 20 comps de Serper para noviembre no son «noviembre medido».
  assert.deepEqual(FUENTES_FIABLES, ['booking_mcp', 'manual'])
  assert.ok(!FUENTES_FIABLES.includes('serper' as never))
})

test('lo NUNCA medido va antes que lo medido hace mucho', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 2, maxEventos: 0, fechasPorMes: 1 })
  const cobertura = [
    { checkin: plan[0].checkin, aforo: 4, ultimaMedicion: '2026-01-01', comps: 5 }, // 217 días
  ]
  const pedidas = ventanasQuePedir(plan, AFOROS, cobertura, HOY, 4)
  assert.equal(pedidas[0].diasSinMedir, null, 'una virgen manda sobre una de hace 7 meses')
  assert.equal(pedidas.at(-1)!.checkin, plan[0].checkin)
  assert.equal(pedidas.at(-1)!.aforo, 4)
})

test('entre vírgenes manda la RONDA: la línea de temporada antes que el evento PREVISTO', () => {
  const plan = ventanasDelBarrido(HOY, [{ fecha: '2026-09-20', factor: 2.5, nombre: 'Concierto' }],
    { mesesBase: 3, maxEventos: 3 })
  const pedidas = ventanasQuePedir(plan, AFOROS, [], HOY, 30)
  const primerEvento = pedidas.findIndex(p => p.motivo === 'evento')
  const ultimaBase = pedidas.reduce((acc, p, i) => (p.ronda === 0 ? i : acc), -1)
  assert.ok(primerEvento > ultimaBase, 'toda la ronda base entra antes del primer evento')
})

test('🧊 el evento CONFIRMADO sin medir pasa por DELANTE de la ronda base (caso Bienal 13/08/2026)', () => {
  // Mientras una noche de evento confirmado no se mida, el motor la tiene CONGELADA a un precio
  // posiblemente falso: cada día sin medir es un día congelado. La base puede esperar un día.
  const plan = ventanasDelBarrido(HOY, [
    { fecha: '2026-09-20', factor: 1.25, nombre: 'Bienal', confirmado: true },
    { fecha: '2026-10-24', factor: 2.5, nombre: 'Rumor de gira' }, // previsto: apuesta, no congela
  ], { mesesBase: 3, maxEventos: 3 })
  const pedidas = ventanasQuePedir(plan, AFOROS, [], HOY, 30)
  assert.equal(pedidas[0].etiqueta, 'Bienal', 'la congelada se mide ANTES que nada')
  assert.equal(pedidas[0].eventoConfirmado, true)
  const idxPrevisto = pedidas.findIndex(p => p.etiqueta === 'Rumor de gira')
  const ultimaBase = pedidas.reduce((acc, p, i) => (p.ronda === 0 ? i : acc), -1)
  assert.ok(idxPrevisto > ultimaBase, 'el previsto sigue DETRÁS de la ronda base, como siempre')
})

test('🧊 un evento confirmado YA MEDIDO no roba la prioridad (la condición es estar a ciegas)', () => {
  const plan = ventanasDelBarrido(HOY, [
    { fecha: '2026-09-20', factor: 1.25, nombre: 'Bienal', confirmado: true },
  ], { mesesBase: 2, maxEventos: 2, fechasPorMes: 1 })
  const cobertura = [{ checkin: '2026-09-20', aforo: 4, ultimaMedicion: '2026-08-05', comps: 10 }]
  const pedidas = ventanasQuePedir(plan, AFOROS, cobertura, HOY, 30)
  // Para el aforo 4 (medido) la Bienal deja de ser virgen → van primero las vírgenes de la base.
  const delAforo4 = pedidas.filter(p => p.aforo === 4)
  assert.equal(delAforo4[0].motivo, 'mes', 'medida ya no urge: vuelve el orden normal')
  assert.equal(delAforo4.at(-1)!.etiqueta, 'Bienal')
})

test('entre medidas manda la MÁS VIEJA', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 3, maxEventos: 0, fechasPorMes: 1 })
  const soloCuatro = new Map<number, string[]>([[4, ['prop_duplex_center']]])
  const cobertura = plan.map((v, i) => ({
    checkin: v.checkin, aforo: 4,
    ultimaMedicion: ['2026-08-05', '2026-07-20', '2026-08-01'][i],
    comps: 4,
  }))
  const pedidas = ventanasQuePedir(plan, soloCuatro, cobertura, HOY, 3)
  assert.deepEqual(pedidas.map(p => p.diasSinMedir), [17, 5, 1])
})

test('cada ventana se pide UNA VEZ POR AFORO, con sus pisos', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 1, maxEventos: 0, fechasPorMes: 1 })
  const pedidas = ventanasQuePedir(plan, AFOROS, [], HOY, 10)
  assert.equal(pedidas.length, 2, '1 fecha × 2 aforos')
  assert.deepEqual(pedidas.map(p => p.aforo).sort((a, b) => a - b), [4, 12])
  assert.deepEqual(pedidas.find(p => p.aforo === 12)!.pisos, ['prop_house_sevillana'])
})

test('un aforo sin pisos no gasta ventana', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 1, maxEventos: 0, fechasPorMes: 1 })
  const conHueco = new Map<number, string[]>([[4, ['prop_duplex_center']], [2, []]])
  const pedidas = ventanasQuePedir(plan, conHueco, [], HOY, 10)
  assert.equal(pedidas.length, 1)
})

test('el tope se respeta (cada consulta al conector cuesta contexto)', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0 })
  assert.equal(ventanasQuePedir(plan, AFOROS, [], HOY, 12).length, 12)
  assert.equal(ventanasQuePedir(plan, AFOROS, [], HOY, 0).length, 1, 'nunca 0: pedir nada es un no-op mudo')
})

// ─── recorte del plan para una pasada concreta ─────────────────────────────────────────────

test('el filtro de RONDAS se aplica ANTES del tope (si no, la profundidad nunca llega)', () => {
  // Es el caso real del 08/08/2026: las rondas de profundidad son las últimas de la cola de
  // urgencia, así que un filtro en cliente sobre las N primeras deja fuera casi todo.
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  const soloCuatro = new Map<number, string[]>([[4, ['prop_duplex_center']]])

  const enCliente = ventanasQuePedir(plan, soloCuatro, [], HOY, 10).filter(v => v.ronda === 2)
  const enServidor = ventanasQuePedir(plan, soloCuatro, [], HOY, 10, { rondas: [2] })

  // La ronda 0 (8 ventanas) se lleva el grueso del tope: a la ronda 2 solo le llegan las sobras.
  assert.equal(enCliente.length, 2, 'filtrando en cliente solo alcanzan las que el tope no comió')
  assert.equal(enServidor.length, 8, 'filtrando antes del tope se piden las 8 que se querían')
  assert.ok(enServidor.every(v => v.ronda === 2))
})

test('el filtro de FECHAS acota por checkin, inclusive en ambos extremos', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  const soloCuatro = new Map<number, string[]>([[4, ['prop_duplex_center']]])
  const v = ventanasQuePedir(plan, soloCuatro, [], HOY, 100, { desde: '2026-09-01', hasta: '2027-01-31' })

  assert.ok(v.length > 0)
  assert.ok(v.every(x => x.checkin >= '2026-09-01' && x.checkin <= '2027-01-31'))

  const unDia = ventanasQuePedir(plan, soloCuatro, [], HOY, 100,
    { desde: v[0].checkin, hasta: v[0].checkin })
  assert.ok(unDia.every(x => x.checkin === v[0].checkin), 'desde=hasta deja pasar ese día')
})

test('rondas y fechas se combinan (es la pasada que se pidió)', () => {
  const plan = ventanasDelBarrido(HOY, [{ fecha: '2026-10-10', factor: 2.5 }], { mesesBase: 8 })
  const v = ventanasQuePedir(plan, AFOROS, [], HOY, 100,
    { rondas: [2, 3], desde: '2026-09-01', hasta: '2027-01-31' })

  assert.ok(v.length > 0)
  assert.ok(v.every(x => (x.ronda === 2 || x.ronda === 3)))
  assert.ok(v.every(x => x.motivo === 'mes'), 'las rondas de profundidad nunca son de evento')
  assert.ok(v.every(x => x.checkin >= '2026-09-01' && x.checkin <= '2027-01-31'))
})

test('sin filtro, el comportamiento es EXACTAMENTE el de antes', () => {
  const plan = ventanasDelBarrido(HOY, [{ fecha: '2026-09-20', factor: 2.5 }], { mesesBase: 3 })
  assert.deepEqual(
    ventanasQuePedir(plan, AFOROS, [], HOY, 12, {}),
    ventanasQuePedir(plan, AFOROS, [], HOY, 12),
  )
  assert.deepEqual(ventanasQuePedir(plan, AFOROS, [], HOY, 12, { rondas: [] }),
    ventanasQuePedir(plan, AFOROS, [], HOY, 12), 'rondas vacío = sin filtro, no «ninguna ronda»')
})

test('un filtro que no casa nada devuelve VACÍO, no el plan entero', () => {
  // El fallo caro sería «filtro imposible ⇒ lo ignoro y mido todo»: la pasada parecería la pedida.
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 3, maxEventos: 0, fechasPorMes: 1 })
  const r = planDeVentanas(plan, AFOROS, [], HOY, 12, { rondas: [9] })
  assert.deepEqual(r.ventanas, [])
  assert.equal(r.candidatas, 0)
})

test('el recorte del tope se DECLARA (un truncado mudo se lee como «esto era todo»)', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  const r = planDeVentanas(plan, AFOROS, [], HOY, 10, { rondas: [2, 3] })

  assert.equal(r.ventanas.length, 10)
  assert.equal(r.candidatas, 32, '8 meses × 2 rondas × 2 aforos')
  assert.equal(r.recortadas, 22)

  const holgado = planDeVentanas(plan, AFOROS, [], HOY, 100, { rondas: [2, 3] })
  assert.equal(holgado.recortadas, 0, 'sin recorte no se inventa aviso')
})

// ─── parseo de los parámetros del endpoint ─────────────────────────────────────────────────

/** Atajo: `q('max=30&rondas=2,3')` → el resultado de parsear esa query. */
const q = (s: string) => parsearParametrosPlan(new URLSearchParams(s))

test('🚨 un `max` no numérico se RECHAZA (antes devolvía 0 ventanas en silencio)', () => {
  // Caso fundacional: Number('abc')=NaN, Math.min(30,Math.max(1,NaN))=NaN y slice(0,NaN)=[] →
  // la pasada no medía nada y lo reportaba como «no había ventanas», con recortadas:NaN.
  for (const malo of ['abc', '', ' ', '3.5', 'NaN', 'Infinity', '2e', '1,2']) {
    const r = q(`max=${encodeURIComponent(malo)}`)
    assert.equal(r.ok, false, `max=${JSON.stringify(malo)} debería rechazarse`)
  }
})

test('sin `max` se usa el defecto; con uno válido, ese', () => {
  const sinMax = q('')
  assert.ok(sinMax.ok && sinMax.valor.max === MAX_VENTANAS_DEFECTO)
  const conMax = q('max=7')
  assert.ok(conMax.ok && conMax.valor.max === 7)
})

test('un `max` fuera de rango se acota Y SE DICE', () => {
  const alto = q(`max=100`)
  assert.ok(alto.ok)
  assert.equal(alto.valor.max, MAX_VENTANAS_TECHO)
  assert.match(alto.avisos.join(' '), /acotado a 30/)

  const bajo = q('max=0')
  assert.ok(bajo.ok)
  assert.equal(bajo.valor.max, 1)
  assert.match(bajo.avisos.join(' '), /acotado a 1/)

  // Dentro de rango no se inventa aviso.
  const normal = q('max=12')
  assert.ok(normal.ok && normal.avisos.length === 0)
})

test('rondas: se aceptan las válidas, se rechazan las que no', () => {
  const bueno = q('rondas=2,3')
  assert.ok(bueno.ok && JSON.stringify(bueno.valor.filtro.rondas) === '[2,3]')

  const dup = q('rondas=2,2,3')
  assert.ok(dup.ok && JSON.stringify(dup.valor.filtro.rondas) === '[2,3]', 'deduplica')

  const espacios = q('rondas=2%2C%203')
  assert.ok(espacios.ok && JSON.stringify(espacios.valor.filtro.rondas) === '[2,3]', 'tolera espacios')

  for (const malo of ['dos', '2,dos', '-1', '2.5', '', ',', ' ']) {
    assert.equal(q(`rondas=${encodeURIComponent(malo)}`).ok, false,
      `rondas=${JSON.stringify(malo)} debería rechazarse`)
  }
})

test('fechas: formato estricto YYYY-MM-DD y rango no invertido', () => {
  const bueno = q('desde=2026-09-01&hasta=2027-01-31')
  assert.ok(bueno.ok)
  assert.equal(bueno.valor.filtro.desde, '2026-09-01')
  assert.equal(bueno.valor.filtro.hasta, '2027-01-31')

  for (const malo of ['01/09/2026', '2026-9-1', 'ayer', '2026-09-01T00:00:00Z', '']) {
    assert.equal(q(`desde=${encodeURIComponent(malo)}`).ok, false,
      `desde=${JSON.stringify(malo)} debería rechazarse`)
  }

  const invertido = q('desde=2027-01-31&hasta=2026-09-01')
  assert.equal(invertido.ok, false, 'un rango invertido devolvería vacío en silencio')

  // desde=hasta es un día concreto, perfectamente válido.
  assert.equal(q('desde=2026-09-08&hasta=2026-09-08').ok, true)
})

test('sin parámetros no hay filtro (la pasada normal no cambia)', () => {
  const r = q('')
  assert.ok(r.ok)
  assert.deepEqual(r.valor.filtro, {})
  assert.deepEqual(r.avisos, [])
})

test('el error del parseo explica el formato esperado (va tal cual al 400)', () => {
  const r = q('rondas=dos')
  assert.ok(!r.ok)
  assert.match(r.error, /rondas inválidas/)
  assert.match(r.error, /2,3/, 'el mensaje enseña un ejemplo válido')
})

// ─── parte de la pasada ────────────────────────────────────────────────────────────────────

test('el parte pone PRIMERO lo que no se pudo medir', () => {
  const d = detalleIngesta({ ventanas: 12, comps: 40, sinRespuesta: 3, sinPrecio: 1, errores: [] })
  assert.ok(d.startsWith('40 comps reales en 12 ventanas'))
  assert.ok(d.includes('3 ventanas sin respuesta del conector'))
  assert.ok(d.includes('NO es «no hay mercado»'))
  assert.ok(d.includes('1 sin precio utilizable'))
})

test('una pasada limpia no inventa avisos', () => {
  assert.equal(detalleIngesta({ ventanas: 12, comps: 48, sinRespuesta: 0, sinPrecio: 0, errores: [] }),
    '48 comps reales en 12 ventanas')
})

test('ingestaFiable: cero comps NO es fiable aunque no haya errores', () => {
  assert.equal(ingestaFiable({ ventanas: 12, comps: 0, sinRespuesta: 0, errores: [] }), false)
})

test('ingestaFiable: si la mitad o más no responde, es el conector, no el mercado', () => {
  assert.equal(ingestaFiable({ ventanas: 12, comps: 8, sinRespuesta: 6, errores: [] }), false)
  assert.equal(ingestaFiable({ ventanas: 12, comps: 20, sinRespuesta: 5, errores: [] }), true)
})

test('ingestaFiable: un error técnico invalida la pasada', () => {
  assert.equal(ingestaFiable({ ventanas: 12, comps: 30, sinRespuesta: 0, errores: ['ingest 500'] }), false)
})

test('ingestaFiable: una pasada que no pidió nada no vale como buena', () => {
  assert.equal(ingestaFiable({ ventanas: 0, comps: 0, sinRespuesta: 0, errores: [] }), false)
})

test('🧊 el colapso por bloques ya no deja noches congeladas sin medir (caso 18/19-sep, 14/08/2026)', async () => {
  const { ventanasDeConfirmadosPorFecha } = await import('./mercado-ventanas.ts')
  // Bloque real: 18(Bienal 1,5) · 19(Bienal 1,5) · 20(Sevilla-Barcelona 1,5) · 21(Bienal 1,15).
  // El bloque lo representa una sola ventana; Booking midió el 20 → sin la expansión, el 18 y el
  // 19 (CONGELADOS por el motor) no se pedían nunca.
  const eventos = [
    { fecha: '2026-09-18', factor: 1.5, nombre: 'Bienal 2o finde', confirmado: true },
    { fecha: '2026-09-19', factor: 1.5, nombre: 'Bienal 2o finde', confirmado: true },
    { fecha: '2026-09-20', factor: 1.5, nombre: 'Sevilla FC vs Barcelona', confirmado: true },
    { fecha: '2026-09-21', factor: 1.15, nombre: 'Olga Pericet', confirmado: true },
    { fecha: '2026-12-05', factor: 1.5, nombre: 'Mangafest (previsto)' }, // previsto: NO se expande
  ]
  const plan = ventanasDelBarrido('2026-08-14', eventos, { mesesBase: 2, maxEventos: 6, fechasPorMes: 1 })
  const extra = ventanasDeConfirmadosPorFecha('2026-08-14', eventos, plan)
  const fechasExtra = extra.map(v => v.checkin)
  // El representante del bloque ya está en el plan; las demás fechas confirmadas entran aparte.
  for (const f of ['2026-09-18', '2026-09-19', '2026-09-21']) {
    const enAlguno = fechasExtra.includes(f) || plan.some(v => v.checkin === f)
    assert.ok(enAlguno, `${f} tiene que poder medirse en algún sitio`)
  }
  assert.ok(!fechasExtra.includes('2026-12-05'), 'un previsto no gasta ventana por fecha')
  assert.ok(extra.every(v => v.eventoConfirmado && v.ronda === 1))

  // Y con el bloque YA MEDIDO (el 20-sep), la cola pide PRIMERO las congeladas 18/19/21.
  const todo = [...plan, ...extra]
  const cobertura = [{ checkin: '2026-09-20', aforo: 4, ultimaMedicion: '2026-08-14', comps: 10 }]
  const pedidas = ventanasQuePedir(todo, new Map([[4, ['prop_duplex_center']]]), cobertura, '2026-08-14', 3)
  assert.deepEqual(pedidas.map(v => v.checkin), ['2026-09-18', '2026-09-19', '2026-09-21'])
})

test('el parte declara los anuncios propios descartados', () => {
  const d = detalleIngesta({
    ventanas: 12, comps: 119, sinRespuesta: 0, sinPrecio: 0, errores: [], propios: 1,
  })
  assert.match(d, /119 comps reales en 12 ventanas/)
  assert.match(d, /1 anuncio\(s\) propio\(s\) descartado\(s\)/)
})

test('sin anuncios propios el parte no menciona el descarte', () => {
  const d = detalleIngesta({ ventanas: 12, comps: 119, sinRespuesta: 0, sinPrecio: 0, errores: [] })
  assert.doesNotMatch(d, /propio/)
})

// ─── Reserva de alto valor: lo CARO sin medir no espera a que pase la cola ─────────────────

test('🎄 la Navidad no se queda detrás de 40 noches de septiembre (18/08/2026)', () => {
  // Caso real: entre hoy y Navidad hay decenas de noches de evento confirmado más cercanas, y la
  // cola —que dentro de las vírgenes ordena por cercanía— las pide todas antes. Medido ese día:
  // del 19/12 al 07/01 no había NI UN comparable fiable, y el motor tarificaba Nochebuena con la
  // mediana de las noches normales de diciembre.
  const septiembre = Array.from({ length: 20 }, (_, i) => ({
    checkin: `2026-09-${String(i + 5).padStart(2, '0')}`,
    checkout: `2026-09-${String(i + 7).padStart(2, '0')}`,
    motivo: 'evento' as const, ronda: 1, eventoConfirmado: true, factor: 1.25,
  }))
  const navidad = [
    { checkin: '2026-12-29', checkout: '2026-12-31', motivo: 'evento' as const, ronda: 1, eventoConfirmado: true, factor: 1.85 },
    { checkin: '2026-12-25', checkout: '2026-12-27', motivo: 'evento' as const, ronda: 1, eventoConfirmado: true, factor: 1.40 },
  ]
  const aforos = new Map([[12, ['prop_house_sevillana']]])
  const r = planDeVentanas([...septiembre, ...navidad], aforos, [], '2026-08-18', 12)
  const fechas = r.ventanas.map(v => v.checkin)
  assert.equal(r.ventanas.length, 12)
  assert.ok(fechas.includes('2026-12-29'), 'la noche más cara sin medir tiene que entrar en la pasada')
  assert.ok(fechas.includes('2026-12-25'), 'y la segunda más cara también')
  // Sin robarle sitio a la temporada: 9 de las 12 siguen siendo la cola normal.
  assert.equal(fechas.filter(f => f.startsWith('2026-09')).length, 10)
})

test('la reserva NO se desperdicia si no hay nada caro que rescatar', () => {
  const base = Array.from({ length: 20 }, (_, i) => ({
    checkin: `2026-09-${String(i + 5).padStart(2, '0')}`,
    checkout: `2026-09-${String(i + 7).padStart(2, '0')}`,
    motivo: 'mes' as const, ronda: 0, factor: 1,
  }))
  const r = planDeVentanas(base, new Map([[12, ['prop_house_sevillana']]]), [], '2026-08-18', 12)
  assert.equal(r.ventanas.length, 12, 'la pasada se llena igual')
  assert.equal(r.recortadas, 8)
})

test('un evento PREVISTO no se cuela por delante de una noche congelada', () => {
  // Un previsto no congela ningún precio y su premio ya va ponderado: la reserva es para lo que el
  // motor tiene bloqueado esperando mercado.
  const pedidas = [
    { checkin: '2026-09-18', checkout: '2026-09-20', motivo: 'evento' as const, ronda: 1, eventoConfirmado: true, factor: 1.5 },
    { checkin: '2026-09-21', checkout: '2026-09-23', motivo: 'evento' as const, ronda: 1, eventoConfirmado: true, factor: 1.15 },
    { checkin: '2026-12-05', checkout: '2026-12-07', motivo: 'evento' as const, ronda: 1, eventoConfirmado: false, factor: 2.5 },
  ]
  const r = planDeVentanas(pedidas, new Map([[4, ['prop_duplex_center']]]), [], '2026-08-18', 2)
  assert.deepEqual(r.ventanas.map(v => v.checkin), ['2026-09-18', '2026-09-21'])
})

// ── Meses sin bucket elegible (26/08/2026) ─────────────────────────────────────────────────────
// El círculo que cerraban: el plan mide las noches de evento de un mes lejano, pero el bucket
// mensual del motor las excluye, así que ese mes nunca llega a las 3 fechas normales que le hacen
// falta — y su salto de evento sigue anclado al percentil global. Ver `mesesSinBucket`.

const mesesDe = (...m: string[]) => new Set(m)

test('mesesSinBucket: por debajo del mínimo es corto, en el mínimo ya no', () => {
  const cobertura = [
    { checkin: '2026-09-04', aforo: 4, ultimaMedicion: '2026-08-01', comps: 6 },
    { checkin: '2026-09-12', aforo: 4, ultimaMedicion: '2026-08-01', comps: 6 },
    { checkin: '2026-09-22', aforo: 4, ultimaMedicion: '2026-08-01', comps: 6 },
    { checkin: '2027-04-02', aforo: 4, ultimaMedicion: '2026-08-01', comps: 6 },
    { checkin: '2027-04-10', aforo: 4, ultimaMedicion: '2026-08-01', comps: 6 },
  ]
  const cortos = mesesSinBucket(cobertura, new Set(), mesesDe('2026-09', '2027-04'))
  assert.deepEqual([...cortos], ['2027-04'], 'septiembre llega a 3 fechas; abril se queda en 2')
  assert.equal(MIN_FECHAS_BUCKET, 3)
})

test('mesesSinBucket: las fechas de EVENTO no cuentan (el motor las excluye del bucket)', () => {
  // Caso real de abril-2027: 6 fechas medidas, 4 de ellas de Feria/Semana Santa → 2 útiles.
  const cobertura = ['2027-04-02', '2027-04-10', '2027-04-16', '2027-04-17', '2027-04-18', '2027-04-19']
    .map(checkin => ({ checkin, aforo: 12, ultimaMedicion: '2026-08-20', comps: 8 }))
  const feria = new Set(['2027-04-16', '2027-04-17', '2027-04-18', '2027-04-19'])
  assert.deepEqual([...mesesSinBucket(cobertura, feria, mesesDe('2027-04'))], ['2027-04'])
  assert.deepEqual([...mesesSinBucket(cobertura, new Set(), mesesDe('2027-04'))], [],
    'sin excluir eventos parecería cubierto — que es justo la ilusión que crea el círculo')
})

test('mesesSinBucket: un mes con CERO mediciones es el MÁS corto, no uno que no existe', () => {
  // La trampa de contar solo lo medido: julio-2027 no aparece en la cobertura, así que un recuento
  // ingenuo lo dejaría fuera de la lista de cortos — el mes más a ciegas, el único sin declarar.
  const cobertura = [{ checkin: '2026-09-04', aforo: 4, ultimaMedicion: '2026-08-01', comps: 6 }]
  const cortos = mesesSinBucket(cobertura, new Set(), mesesDe('2026-09', '2027-07'))
  assert.ok(cortos.has('2027-07'), 'un mes sin una sola fecha medida tiene que salir como corto')
  assert.ok(cortos.has('2026-09'), 'y una sola fecha tampoco llega al mínimo')
})

test('mesesSinBucket: comps 0 es «medida sin muestra», no una fecha del bucket', () => {
  const cobertura = ['2027-05-07', '2027-05-08', '2027-05-09']
    .map(checkin => ({ checkin, aforo: 4, ultimaMedicion: '2026-08-20', comps: 0 }))
  assert.deepEqual([...mesesSinBucket(cobertura, new Set(), mesesDe('2027-05'))], ['2027-05'])
})

test('la cola antepone el MES CORTO a la 1ª fecha de un mes que ya tiene bucket', () => {
  // Sin `bucket` mandaría la ronda: primero la fecha base de septiembre (ronda 0), y las de
  // profundidad de mayo (ronda 2) se quedarían para el final de la cola — o sea, nunca.
  const plan = [
    { checkin: '2026-09-04', checkout: '2026-09-06', motivo: 'mes' as const, ronda: 0 },
    { checkin: '2027-05-14', checkout: '2027-05-16', motivo: 'mes' as const, ronda: 2 },
  ]
  const aforos = new Map([[4, ['prop_duplex_center']]])
  const sinContexto = planDeVentanas(plan, aforos, [], HOY, 2)
  assert.deepEqual(sinContexto.ventanas.map(v => v.checkin), ['2026-09-04', '2027-05-14'])

  const conContexto = planDeVentanas(plan, aforos, [], HOY, 2, {}, {
    mesesCortos: mesesDe('2027-05'), fechasEvento: new Set(),
  })
  assert.deepEqual(conContexto.ventanas.map(v => v.checkin), ['2027-05-14', '2026-09-04'])
  assert.deepEqual(conContexto.ventanas.map(v => v.mesCorto), [true, false])
})

test('una noche de EVENTO de un mes corto NO se marca: medirla no acerca el bucket', () => {
  const plan = [
    { checkin: '2027-04-16', checkout: '2027-04-18', motivo: 'evento' as const, ronda: 1, factor: 3.2 },
    { checkin: '2027-04-27', checkout: '2027-04-29', motivo: 'mes' as const, ronda: 2 },
  ]
  const r = planDeVentanas(plan, new Map([[4, ['prop_duplex_center']]]), [], HOY, 2, {}, {
    mesesCortos: mesesDe('2027-04'), fechasEvento: new Set(['2027-04-16']),
  })
  const porFecha = new Map(r.ventanas.map(v => [v.checkin, v.mesCorto]))
  assert.equal(porFecha.get('2027-04-27'), true)
  assert.equal(porFecha.get('2027-04-16'), false, 'el bucket mensual excluye las fechas de evento')
})

test('lo CONGELADO sigue mandando sobre el mes corto', () => {
  // El orden importa: una noche de evento confirmado sin medir está congelada a un precio
  // posiblemente falso HOY. Un mes sin bucket es un problema estructural, no una urgencia diaria.
  const plan = [
    { checkin: '2027-05-14', checkout: '2027-05-16', motivo: 'mes' as const, ronda: 2 },
    { checkin: '2026-09-20', checkout: '2026-09-22', motivo: 'evento' as const, ronda: 1,
      eventoConfirmado: true, factor: 2.5 },
  ]
  const r = planDeVentanas(plan, new Map([[4, ['prop_duplex_center']]]), [], HOY, 2, {}, {
    mesesCortos: mesesDe('2027-05'), fechasEvento: new Set(['2026-09-20']),
  })
  assert.deepEqual(r.ventanas.map(v => v.checkin), ['2026-09-20', '2027-05-14'])
})

test('sin `bucket` el orden es EXACTAMENTE el de antes', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  assert.deepEqual(
    planDeVentanas(plan, AFOROS, [], HOY, 20).ventanas,
    planDeVentanas(plan, AFOROS, [], HOY, 20, {}, undefined).ventanas,
  )
  assert.ok(planDeVentanas(plan, AFOROS, [], HOY, 20).ventanas.every(v => v.mesCorto === false))
})
