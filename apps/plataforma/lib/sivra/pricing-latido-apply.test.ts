import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pasadaFiable, detalleApply, avisoSmoobuRechaza, avisoSmoobuLecturaFalla,
  type ParteApply, type FalloEscritura, type FalloLectura,
} from './pricing-latido-apply.ts'

const BASE: ParteApply = {
  pisos: 4, fechasEscritas: 426, sinTarifar: 0, fallos: [], fallosLectura: [],
  degradaciones: [], dryRun: false,
}
const FALLO: FalloEscritura = { property: 'prop_house_sevillana', motivo: 'Smoobu POST 401', fechas: 9 }
const FALLO_LECTURA: FalloLectura = { property: 'prop_house_sevillana', motivo: 'GET 401' }

test('una pasada limpia es fiable', () => {
  assert.equal(pasadaFiable(BASE), true)
})

test('🛑 Smoobu rechazando la escritura pone la pasada en ROJO', () => {
  // El eslabón que escribe el precio que ve el huésped. Hasta el 23/08/2026 esto vivía solo en el
  // array `results` de la respuesta HTTP: ni ok:false, ni Telegram, ni latido.
  assert.equal(pasadaFiable({ ...BASE, fallos: [FALLO] }), false)
})

test('🛑 Smoobu sin responder a la LECTURA también pone la pasada en ROJO', () => {
  // Hallazgo del 15/09/2026: el 401 de /rates con HMAC llevaba 4+ días saliendo `ok:true` porque
  // solo se apuntaba en `results`, exactamente el mismo silencio que el de la escritura pero un
  // eslabón más arriba — aquí ni se llega a decidir un precio.
  assert.equal(pasadaFiable({ ...BASE, fallosLectura: [FALLO_LECTURA] }), false)
})

test('una degradación ya declarada también la pone en rojo', () => {
  assert.equal(pasadaFiable({ ...BASE, degradaciones: ['pricing_eventos_auto ilegible'] }), false)
})

test('🚦 un piso SIN TARIFAR no pone la pasada en rojo', () => {
  // Deliberado: tiene su propio aviso (avisoPisosSinTarifar) y los demás pisos sí se tarificaron.
  // Un vigía que grita por lo que no le toca acaba ignorándose, y entonces no avisa de nada.
  assert.equal(pasadaFiable({ ...BASE, sinTarifar: 1 }), true)
})

test('🚦 cero noches escritas NO es un fallo: es «nada cruzó el umbral del 3%»', () => {
  // Lo que ese cero no puede seguir siendo es indistinguible de «no corrió» — y eso lo arregla que
  // EXISTA el latido, no que se ponga rojo. Ponerlo rojo daría alarma casi cada pasada tranquila.
  assert.equal(pasadaFiable({ ...BASE, fechasEscritas: 0 }), true)
})

test('el detalle dice SIEMPRE de cuántos pisos habla', () => {
  // «0 filas» sin denominador es justo el parte ambiguo que hubo que resolver a mano el 22/08.
  assert.match(detalleApply({ ...BASE, fechasEscritas: 0 }), /0 noche\(s\) escritas en 4 piso\(s\)/)
})

test('el detalle antepone el rechazo de Smoobu a todo lo demás', () => {
  const d = detalleApply({ ...BASE, fallos: [FALLO] })
  assert.ok(d.startsWith('🛑 Smoobu RECHAZÓ'), `empieza por: ${d.slice(0, 40)}`)
  assert.match(d, /house_sevillana: Smoobu POST 401/)
  assert.match(d, /9 noche\(s\) sin aplicar/)
})

test('el detalle antepone el fallo de LECTURA incluso al rechazo de escritura', () => {
  // Es el fallo más arriba de la cadena: si Smoobu ni deja leer, es lo primero que hay que ver.
  const d = detalleApply({ ...BASE, fallos: [FALLO], fallosLectura: [FALLO_LECTURA] })
  assert.ok(d.startsWith('🛑 Smoobu no respondió al LEER'), `empieza por: ${d.slice(0, 50)}`)
  assert.match(d, /house_sevillana: GET 401/)
})

test('sin fallos de lectura NO hay aviso de lectura', () => {
  assert.equal(avisoSmoobuLecturaFalla([]), null)
})

test('🚨 el aviso de lectura deja claro que no hay propuesta, no solo que no se aplicó', () => {
  const txt = avisoSmoobuLecturaFalla([FALLO_LECTURA])
  assert.ok(txt)
  assert.match(txt, /NO ha podido ni comparar el precio actual/)
  assert.match(txt, /house_sevillana: GET 401/)
})

test('el detalle distingue el simulacro de una pasada que escribe', () => {
  assert.match(detalleApply({ ...BASE, dryRun: true }), /SIMULACRO/)
  assert.doesNotMatch(detalleApply(BASE), /SIMULACRO/)
})

test('sin fallos NO hay aviso', () => {
  // Un aviso que salta siempre deja de leerse.
  assert.equal(avisoSmoobuRechaza([]), null)
})

test('🚨 el aviso dice que el huésped sigue viendo el precio ANTERIOR', () => {
  // «no se aplicaron N noches» se lee como «no hacía falta». La diferencia es toda la señal.
  const txt = avisoSmoobuRechaza([FALLO])
  assert.ok(txt)
  assert.match(txt, /precio ANTERIOR en el canal/)
  assert.doesNotMatch(txt, /correcto|en orden|✅/)
})

test('el aviso suma las noches de todos los pisos rechazados', () => {
  const txt = avisoSmoobuRechaza([FALLO, { property: 'prop_duplex_center', motivo: 'Smoobu POST 500', fechas: 212 }])
  assert.ok(txt)
  assert.match(txt, /2 piso\(s\)/)
  assert.match(txt, /221 noche\(s\)/)
})

test('el aviso explica por qué NO se anotó en pricing_applied', () => {
  // Es la mitad menos obvia del arreglo: una fila ahí afirmaría que se aplicó, y encima sería el
  // ancla `ref24` del raíl de mañana (apply/route.ts lee de esa misma tabla).
  const txt = avisoSmoobuRechaza([FALLO])
  assert.ok(txt)
  assert.match(txt, /pricing_applied/)
  assert.match(txt, /ancla del raíl/)
})

test('⏸️ la PAUSA global gana al «SIMULACRO» en el parte', () => {
  // `apply` convierte la pasada en dryRun cuando pricing_config.paused, así que los dos casos
  // llegan con dryRun:true. Sin distinguirlos, una pausa OLVIDADA (motor entero apagado) sería
  // indistinguible de una llamada de prueba, y el latido saldría verde.
  const d = detalleApply({ ...BASE, dryRun: true, paused: true })
  assert.match(d, /PAUSA global/)
  assert.doesNotMatch(d, /SIMULACRO/)
})

test('sin pausa, un dryRun sigue diciendo SIMULACRO', () => {
  assert.match(detalleApply({ ...BASE, dryRun: true, paused: false }), /SIMULACRO/)
})

test('la nota del motor viaja al parte (puerta corta: ningún piso activo)', () => {
  // La salida temprana de apply no trae pisos ni noches: sin la nota, el detalle sería
  // «0 noche(s) escritas en 0 piso(s)» y no diría POR QUÉ.
  const d = detalleApply({
    ...BASE, pisos: 0, fechasEscritas: 0,
    nota: 'Ningún piso con apply_enabled=true (o filtro sin match)',
  })
  assert.match(d, /apply_enabled=true/)
})
