import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpretarRetarificacion } from './retarificar-asegura.ts'

// El 409 con el que asegura corta «Pedir precio» cuando ya hay un proyecto
// vigente sin emitir (guardián de reutilización, PR #2790). Forma real del
// cuerpo: `sinGasto({ error, proyectoExistente }, 409)`.
const VIGENTE = {
  error:
    'Ya hay un proyecto de Codeoscopic vigente para esta póliza (40684860, Allianz, 312.41€, válido ' +
    'hasta 2026-09-12). No se pide precio de nuevo: crear otro proyecto cuesta otros 0,50€ y la ' +
    'compañía puede dar otro precio. Manda `forzarNuevo: true` solo si de verdad hace falta una cotización nueva.',
  proyectoExistente: { projectId: '40684860', compania: 'Allianz', primaEur: 312.41, caducaEn: '2026-09-12' },
  gastado: '0,00€',
}

test('el 409 del proyecto vigente es su propio estado, no «este ramo no se retarifica»', () => {
  const r = interpretarRetarificacion(409, VIGENTE)
  assert.equal(r.estado, 'proyecto_vigente')
  if (r.estado !== 'proyecto_vigente') return
  assert.deepEqual(r.proyecto, { projectId: '40684860', compania: 'Allianz', primaEur: 312.41, caducaEn: '2026-09-12' })
  assert.match(r.mensaje, /40684860/)
})

test('un 409 sin `proyectoExistente` sigue siendo el del ramo, como antes', () => {
  const r = interpretarRetarificacion(409, { error: 'hoy no se retarifica el ramo «decesos»', gastado: '0,00€' })
  assert.equal(r.estado, 'ramo')
  // Y una forma rara del proyecto no se cuela como vigente: sin `projectId` no hay nada que reutilizar.
  assert.equal(interpretarRetarificacion(409, { ...VIGENTE, proyectoExistente: { compania: 'Allianz' } }).estado, 'ramo')
})

// ─── El botón y el escape hatch, leyendo el fuente ───────────────────────────
// Las dos decisiones que no tienen tipo: (1) `forzarNuevo` es exactamente el
// gesto de haber descartado el precio recuperado, ni un `true` fijo ni ausente;
// (2) con el precio recuperado en pantalla, «Pedir precio» está apagado —
// ofrecerlo era ofrecer el 409.
// Sin comentarios: aquí se vigila el CÓDIGO, y los comentarios citan a propósito
// los nombres que estos detectores buscan (explican de dónde sale el contrato).
function codigo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}
const PANTALLA = codigo('../app/(usuario)/correduria/poliza/[id]/retarificar/retarificador.tsx')
const LIB = codigo('./retarificar-asegura.ts')

test('`forzarNuevo` solo viaja tras «Descartar»: en la pantalla vale `guardadaDescartada`', () => {
  assert.match(
    PANTALLA,
    /forzarNuevo:\s*guardadaDescartada\b/,
    'la pantalla tiene que mandar `forzarNuevo: guardadaDescartada` — ni `true` fijo (volvería el doble ' +
      'cargo por accidente) ni omitirlo («Descartar y pedir precio de cero» moriría en el 409).',
  )
  assert.doesNotMatch(PANTALLA, /forzarNuevo:\s*true\b/, 'un `forzarNuevo: true` fijo anula el guardián de reutilización.')
  // Y el cliente del puerto solo lo pone en el cuerpo cuando es el booleano `true`.
  const cuerpo = LIB.slice(LIB.indexOf('/api/operador/codeoscopic/retarificar'))
  assert.match(cuerpo, /p\.forzarNuevo === true \? \{ forzarNuevo: true \}/, 'el puerto compara `forzarNuevo` con `=== true`.')
})

// La otra orilla del puerto, leída como fuente (mismo patrón que
// `apps/asegura-web/lib/contrato-lead.test.ts`): que plataforma MANDE el flag no
// sirve de nada si la ruta de asegura lo tira antes de `prepararRetarificacion`
// — que es exactamente lo que pasaba hasta el 12/09/2026, con este mismo test
// verde mirando solo al emisor.
test('la ruta de operador de asegura REENVÍA `forzarNuevo` a prepararRetarificacion', () => {
  const ruta = codigo('../../asegura/app/api/operador/codeoscopic/retarificar/route.ts')
  const i = ruta.indexOf('prepararRetarificacion({')
  assert.ok(i > 0, 'la ruta tiene que llamar a `prepararRetarificacion({`')
  const llamada = ruta.slice(i, ruta.indexOf('})', i))
  assert.match(
    llamada,
    /forzarNuevo:\s*cuerpo\.forzarNuevo === true/,
    'la ruta `/api/operador/codeoscopic/retarificar` de asegura tiene que pasar `forzarNuevo: ' +
      'cuerpo.forzarNuevo === true` dentro del `cuerpo` de `prepararRetarificacion`. Si lo tira, ' +
      '«Descartar y pedir precio de cero» muere en el 409 del guardián desde plataforma.',
  )
})

test('con un precio real ya pagado en pantalla, «Pedir precio» está apagado', () => {
  const guarda = /const precioPagadoEnPantalla =([\s\S]*?)\n  const puedePulsar/.exec(PANTALLA)?.[1] ?? ''
  assert.match(
    guarda,
    /guardadaPrevia !== null && !guardadaDescartada/,
    'la guarda tiene que cubrir la cotización recuperada al abrir (y no descartada).',
  )
  assert.match(
    guarda,
    /resultado\.estado === 'ok' && !resultado\.simulado && cotizacionIdDe\(resultado\.guardado\) !== null/,
    'la guarda tiene que cubrir también el precio REAL que se acaba de pagar en esta visita: si no, ' +
      'tras «Descartar» + «Pedir precio» el botón seguía encendido y `forzarNuevo` seguía valiendo `true`.',
  )
  const puede = /const puedePulsar =[\s\S]*?\n\n/.exec(PANTALLA)?.[0] ?? ''
  assert.match(puede, /!precioPagadoEnPantalla/, '`puedePulsar` tiene que apagar el botón con un precio pagado a la vista.')
})
