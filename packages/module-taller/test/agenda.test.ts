// Motor de huecos por capacidad. Fechas SIEMPRE relativas a un `ahora` inyectado (nunca el reloj real).
//
// Cepos vistos fallar el 04/11/2026 (rompiendo src/agenda.ts, mirándolo en rojo y restaurando):
//   · quitar `|| f.llena` en huecosDisponibles            → rojo en «franja llena».
//   · cambiar `restante < dur` por `restante < 0`          → rojo en «capacidad diaria agotada» y en «las OT abiertas».
//   · quitar el filtro `t < inicioVentana`                  → rojo en «nunca ofrece franjas pasadas».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS_CITA_OCUPAN, SERVICIO_DIAGNOSTICO, capacidadDiaMinutos, comprobarReserva, diaSemanaDe, duracionServicio, estadoCitaAlPedir,
  fechaLocal, huecosDisponibles, instanteLocal, minutosPendientesOt, ocupacionDia, sumarDias, validarConfig,
  type CitaAgenda, type ConfigTaller, type Existentes,
} from '../src/index.ts'
import { configPrueba } from './_config.ts'

// Un lunes cualquiera del futuro lejano respecto al reloj de los tests: todo se mide contra AHORA, no contra el reloj.
const AHORA = new Date('2026-11-02T08:00:00Z') // lunes 02/11/2026 09:00 en Madrid (CET)
const LUNES = '2026-11-02'
const dia = (n: number) => sumarDias(LUNES, n)

function config(): ConfigTaller {
  const c = configPrueba()
  // Lunes-viernes 09:00-13:00 y 15:00-18:00 (7 h), franja de entrada de 60 min, 2 mecánicos, 80 % ocupable.
  c.horarioCitas = {
    franjas: [1, 2, 3, 4, 5].flatMap((d) => [{ diaSemana: d, desde: '09:00', hasta: '13:00' }, { diaSemana: d, desde: '15:00', hasta: '18:00' }]),
    duracionHuecoMinutos: 60,
    puestos: 2,
  }
  c.agenda = {
    zonaHoraria: 'Europe/Madrid', cierres: [], maxCochesPorFranja: 2, ocupablePuntosBasicos: 8000, margenEntreTrabajosMinutos: 15,
    antelacionMinimaHoras: 2, antelacionMaximaDias: 30, confirmacion: 'manual', duracionDiagnosticoMinutos: 45, invitacionCaducaDias: 7,
  }
  return c
}
const vacio: Existentes = { citas: [], ots: [] }
const cita = (fecha: string, hora: string, duracionMinutos: number, estado = 'confirmada', c = config()): CitaAgenda =>
  ({ inicio: instanteLocal(fecha, hora, c.agenda.zonaHoraria), duracionMinutos, estado })
const horas = (hs: ReturnType<typeof huecosDisponibles>) => hs.map((h) => `${h.fecha} ${h.hora}`)
const dia1 = (c: ConfigTaller, ex: Existentes, servicio: string, fecha: string) =>
  huecosDisponibles(c, ex, servicio, instanteLocal(fecha, '00:00', c.agenda.zonaHoraria), instanteLocal(fecha, '23:59', c.agenda.zonaHoraria), AHORA)

test('la config de prueba es válida y la de alta también lleva agenda', () => {
  assert.deepEqual(validarConfig(config()), [])
})

test('capacidad del día = puestos × horario × % ocupable (hacia abajo) y 0 en fin de semana y cierres', () => {
  const c = config()
  assert.equal(capacidadDiaMinutos(c, dia(0)), Math.floor((2 * 7 * 60 * 8000) / 10000)) // 2 × 420 × 0,8 = 672
  assert.equal(capacidadDiaMinutos(c, dia(5)), 0, 'sábado')
  c.agenda.cierres = [{ fecha: dia(1), motivo: 'Festivo' }]
  assert.equal(capacidadDiaMinutos(c, dia(1)), 0, 'cierre')
})

test('duración del servicio = baremo del paquete + margen; diagnóstico configurable; desconocido o inactivo = null', () => {
  const c = config()
  assert.equal(duracionServicio(c, 'aceite'), 45 + 15)
  assert.equal(duracionServicio(c, SERVICIO_DIAGNOSTICO), 45 + 15)
  c.agenda.duracionDiagnosticoMinutos = 90
  assert.equal(duracionServicio(c, SERVICIO_DIAGNOSTICO), 90 + 15)
  assert.equal(duracionServicio(c, 'no-existe'), null)
  c.paquetes[0].activo = false
  assert.equal(duracionServicio(c, 'aceite'), null)
})

test('ofrece las franjas del horario del día y solo ellas (fuera de horario no hay nada)', () => {
  const c = config()
  assert.deepEqual(dia1(c, vacio, 'aceite', dia(2)).map((h) => h.hora), ['09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00'])
  assert.deepEqual(dia1(c, vacio, 'aceite', dia(5)), [], 'sábado: cerrado')
  assert.deepEqual(dia1(c, vacio, 'aceite', dia(6)), [], 'domingo: cerrado')
})

test('nunca ofrece franjas pasadas ni dentro de la antelación mínima', () => {
  const c = config()
  const hs = huecosDisponibles(c, vacio, 'aceite', new Date(AHORA.getTime() - 86_400_000), instanteLocal(LUNES, '23:59', 'Europe/Madrid'), AHORA)
  // Ahora son las 09:00 locales y la antelación mínima es de 2 h: la primera franja posible es la de las 11:00.
  assert.deepEqual(hs.map((h) => h.hora), ['11:00', '12:00', '15:00', '16:00', '17:00'])
  assert.ok(hs.every((h) => h.inicio.getTime() >= AHORA.getTime() + 2 * 3_600_000))
  assert.deepEqual(huecosDisponibles(c, vacio, 'aceite', new Date(AHORA.getTime() - 5 * 86_400_000), new Date(AHORA.getTime() - 86_400_000), AHORA), [])
})

test('respeta la antelación máxima', () => {
  const c = config()
  const hs = huecosDisponibles(c, vacio, 'aceite', AHORA, instanteLocal(dia(90), '23:59', 'Europe/Madrid'), AHORA)
  const ultimo = hs[hs.length - 1]
  assert.ok(ultimo.inicio.getTime() <= AHORA.getTime() + 30 * 86_400_000)
  assert.ok(hs.length > 0)
})

test('franja llena: con el máximo de coches de la franja ya no se ofrece, las demás siguen', () => {
  const c = config()
  const ex: Existentes = { citas: [cita(dia(2), '10:00', 60), cita(dia(2), '10:00', 60)], ots: [] }
  const h = dia1(c, ex, 'aceite', dia(2)).map((x) => x.hora)
  assert.ok(!h.includes('10:00'), 'franja llena')
  assert.ok(h.includes('09:00') && h.includes('11:00'))
  const una = dia1(c, { citas: [cita(dia(2), '10:00', 60)], ots: [] }, 'aceite', dia(2))
  assert.equal(una.find((x) => x.hora === '10:00')?.plazasLibres, 1, 'con un coche aún cabe otro')
})

test('las citas canceladas, realizadas y no presentadas NO ocupan franja ni capacidad', () => {
  const c = config()
  for (const estado of ['cancelada', 'realizada', 'no_presentado']) {
    assert.ok(!ESTADOS_CITA_OCUPAN.includes(estado))
    const ex: Existentes = { citas: [cita(dia(2), '10:00', 600, estado), cita(dia(2), '10:00', 600, estado)], ots: [] }
    assert.equal(dia1(c, ex, 'aceite', dia(2)).length, 7, estado)
  }
  assert.ok(ESTADOS_CITA_OCUPAN.includes('pedida') && ESTADOS_CITA_OCUPAN.includes('confirmada'))
})

test('capacidad diaria agotada: aunque haya franjas libres, no se ofrece el día', () => {
  const c = config() // capacidad 672; una cita de 600 min en la franja de las 09:00 deja 72
  const ex: Existentes = { citas: [cita(dia(2), '09:00', 600)], ots: [] }
  assert.equal(dia1(c, ex, 'aceite', dia(2)).length, 7, '72 ≥ 60 del aceite: aún cabe')
  const justo: Existentes = { citas: [cita(dia(2), '09:00', 613)], ots: [] } // quedan 59 < 60
  assert.deepEqual(dia1(c, justo, 'aceite', dia(2)), [], 'quedan 59 min y el servicio gasta 60')
  assert.ok(dia1(c, justo, 'aceite', dia(3)).length > 0, 'el día siguiente sigue libre')
})

test('un servicio largo no cabe donde uno corto sí (descuenta su propia duración)', () => {
  const c = config()
  c.paquetes.push({ codigo: 'distribucion', nombre: 'Distribución', baremoMinutos: 300, precioCerradoPorTipo: {}, piezas: [], requiereAceite: false, activo: true })
  const ex: Existentes = { citas: [cita(dia(2), '09:00', 400)], ots: [] } // quedan 272
  assert.ok(dia1(c, ex, 'aceite', dia(2)).length > 0)
  assert.deepEqual(dia1(c, ex, 'distribucion', dia(2)), [], '300 + 15 > 272')
})

test('las OT abiertas con horas pendientes descuentan capacidad desde hoy y se desbordan al día siguiente', () => {
  const c = config() // capacidad por día laborable: 672
  const ots = [{ minutosPendientes: 672 }, { minutosPendientes: 100 }] // llena el lunes y gasta 100 del martes
  const ex: Existentes = { citas: [], ots }
  assert.deepEqual(huecosDisponibles(c, ex, 'aceite', instanteLocal(LUNES, '00:00', 'Europe/Madrid'), instanteLocal(LUNES, '23:59', 'Europe/Madrid'), AHORA), [], 'hoy lleno de OT')
  const martes = ocupacionDia(c, ex, dia(1), AHORA)
  assert.equal(martes.otsMin, 100)
  assert.equal(martes.porcentaje, Math.round((100 * 100) / 672))
  assert.ok(dia1(c, ex, 'aceite', dia(1)).length > 0)
})

test('una OT sin baremo (null) no cuenta 0: gasta lo que un diagnóstico', () => {
  const c = config()
  const o = ocupacionDia(c, { citas: [], ots: [{ minutosPendientes: null }] }, LUNES, AHORA)
  assert.equal(o.otsMin, c.agenda.duracionDiagnosticoMinutos)
  assert.equal(minutosPendientesOt([null, undefined], 30), null, 'sin ningún baremo: no se sabe')
  assert.equal(minutosPendientesOt([60, null, 30], 40), 50)
  assert.equal(minutosPendientesOt([60], 500), 0, 'nunca negativo')
})

test('ocupación del día: coches por franja, % y saturación (en rojo si se pasa)', () => {
  const c = config()
  const ex: Existentes = { citas: [cita(dia(2), '10:00', 400), cita(dia(2), '10:00', 400)], ots: [] } // 800 > 672
  const o = ocupacionDia(c, ex, dia(2), AHORA)
  assert.equal(o.capacidadMin, 672)
  assert.equal(o.citasMin, 800)
  assert.equal(o.porcentaje, Math.round((800 * 100) / 672))
  assert.equal(o.saturado, true)
  const f = o.franjas.find((x) => x.hora === '10:00')!
  assert.deepEqual([f.coches, f.maxCoches, f.llena], [2, 2, true])
  const sab = ocupacionDia(c, vacio, dia(5), AHORA)
  assert.equal(sab.porcentaje, null, 'día sin capacidad: no se inventa un 0 %')
  assert.equal(sab.saturado, false)
  assert.equal(ocupacionDia(c, { citas: [cita(dia(5), '10:00', 30)], ots: [] }, dia(5), AHORA).saturado, true, 'trabajo en un día sin capacidad = saturado')
})

test('cierres y festivos: ese día no se ofrece nada', () => {
  const c = config()
  c.agenda.cierres = [{ fecha: dia(2), motivo: 'Festivo local' }]
  assert.deepEqual(dia1(c, vacio, 'aceite', dia(2)), [])
  assert.ok(dia1(c, vacio, 'aceite', dia(3)).length > 0)
})

test('servicio desconocido: ningún hueco; diagnóstico sí se ofrece', () => {
  const c = config()
  assert.deepEqual(dia1(c, vacio, 'inventado', dia(2)), [])
  assert.ok(dia1(c, vacio, SERVICIO_DIAGNOSTICO, dia(2)).length > 0)
})

test('sin horario configurado no hay huecos (no se inventa uno)', () => {
  const c = config()
  c.horarioCitas.franjas = []
  assert.deepEqual(dia1(c, vacio, 'aceite', dia(2)), [])
})

test('comprobarReserva: la franja que se vio libre deja de valer si se llena antes de confirmar', () => {
  const c = config()
  const inicio = instanteLocal(dia(2), '10:00', 'Europe/Madrid')
  assert.deepEqual(comprobarReserva(c, vacio, 'aceite', inicio, AHORA), { ok: true, duracionMinutos: 60 })
  const lleno: Existentes = { citas: [cita(dia(2), '10:00', 60), cita(dia(2), '10:00', 60)], ots: [] }
  assert.deepEqual(comprobarReserva(c, lleno, 'aceite', inicio, AHORA), { ok: false, motivo: 'hueco_no_disponible' })
  assert.deepEqual(comprobarReserva(c, vacio, 'nada', inicio, AHORA), { ok: false, motivo: 'servicio_desconocido' })
  assert.equal(comprobarReserva(c, vacio, 'aceite', new Date(inicio.getTime() + 60_000), AHORA).ok, false, 'una hora que no es de franja no vale')
})

test('el taller puede mover una cita a donde el cliente no llega (sin antelación mínima), pero nunca al pasado', () => {
  const c = config()
  const enUnaHora = instanteLocal(LUNES, '10:00', 'Europe/Madrid') // 1 h de antelación < 2 h mínimas
  assert.equal(comprobarReserva(c, vacio, 'aceite', enUnaHora, AHORA).ok, false)
  assert.equal(comprobarReserva(c, vacio, 'aceite', enUnaHora, AHORA, { comoTaller: true }).ok, true)
  const pasado = instanteLocal(LUNES, '09:00', 'Europe/Madrid') // son exactamente las 09:00: no es futuro estricto, pero no es pasado
  const ayer = instanteLocal(dia(-3), '10:00', 'Europe/Madrid')
  assert.equal(comprobarReserva(c, vacio, 'aceite', ayer, AHORA, { comoTaller: true }).ok, false)
  assert.ok(pasado.getTime() <= AHORA.getTime() + 1)
})

test('confirmación automática o manual según la política del taller', () => {
  const c = config()
  assert.equal(estadoCitaAlPedir(c), 'pedida')
  c.agenda.confirmacion = 'automatica'
  assert.equal(estadoCitaAlPedir(c), 'confirmada')
})

test('zona horaria: el cambio de hora de octubre no corre las franjas (09:00 local = 08:00Z en CET y 07:00Z en CEST)', () => {
  assert.equal(instanteLocal('2026-10-20', '09:00', 'Europe/Madrid').toISOString(), '2026-10-20T07:00:00.000Z')
  assert.equal(instanteLocal('2026-11-02', '09:00', 'Europe/Madrid').toISOString(), '2026-11-02T08:00:00.000Z')
  assert.equal(fechaLocal(new Date('2026-11-02T23:30:00Z'), 'Europe/Madrid'), '2026-11-03', 'a las 00:30 locales ya es el día siguiente')
  assert.equal(diaSemanaDe('2026-11-02'), 1)
})

test('validarConfig rechaza una agenda mal puesta y el código reservado «diagnostico»', () => {
  const c = config()
  c.agenda.maxCochesPorFranja = 0
  c.agenda.ocupablePuntosBasicos = 10001
  c.agenda.zonaHoraria = 'Mordor/Barad-dur'
  c.agenda.cierres = [{ fecha: '2026-02-30', motivo: '' }]
  c.paquetes.push({ codigo: SERVICIO_DIAGNOSTICO, nombre: 'x', baremoMinutos: 1, precioCerradoPorTipo: {}, piezas: [], requiereAceite: false, activo: true })
  const e = validarConfig(c).join('|')
  for (const parte of ['maxCochesPorFranja', 'ocupablePuntosBasicos', 'zonaHoraria', 'cierre con fecha inválida', 'reservado']) assert.match(e, new RegExp(parte), parte)
})
