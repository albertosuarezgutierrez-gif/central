import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpretarRetarificacion } from './retarificar-asegura.ts'
import { ramoVariante, retarificaEnRiesgo } from '../app/(usuario)/correduria/oportunidad/[id]/variante.ts'

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

// ─── Variante del riesgo de la póliza (29/09/2026) ───────────────────────────
test('el 422 `causa: variante` es un corte sin gasto con su mensaje, no «faltan datos» vacío', () => {
  const r = interpretarRetarificacion(422, { estado: 'error', causa: 'variante', mensaje: 'Ese riesgo no es de esta póliza.', gastado: '0,00€' })
  assert.equal(r.estado, 'error')
  if (r.estado !== 'error') return
  assert.equal(r.mensaje, 'Ese riesgo no es de esta póliza.')
  assert.equal(r.gastoDesconocido, false)
  // Un 422 normal sigue siendo el de los datos que faltan.
  assert.equal(interpretarRetarificacion(422, { faltan: [], gastado: '0,00€' }).estado, 'faltan')
})

test('`oportunidadId` y `nota` viajan en el cuerpo del puerto, la nota solo con riesgo', () => {
  const cuerpo = LIB.slice(LIB.indexOf('/api/operador/codeoscopic/retarificar'))
  assert.match(cuerpo, /p\.oportunidadId \? \{ oportunidadId: p\.oportunidadId \}/)
  assert.match(cuerpo, /p\.oportunidadId && p\.nota/)
})

// ─── Hogar, igual que auto/moto (29/09/2026) ─────────────────────────────────
// Hasta hoy la pantalla de hogar no leía `?oportunidad=`: «Retarificar con las mismas personas»
// abría el formulario de hogar y la tarificación NO se colgaba del riesgo, sin que nada fallara.
const PAGINA = codigo('../app/(usuario)/correduria/poliza/[id]/retarificar/page.tsx')
const HOGAR = codigo('../app/(usuario)/correduria/poliza/[id]/retarificar/RetarificadorHogar.tsx')

test('hogar: la variante del riesgo se carga ANTES de las dos ramas de hogar y llega a las dos', () => {
  const carga = PAGINA.indexOf('cargarRiesgoDePoliza(')
  assert.ok(carga > 0, 'la página tiene que leer `?oportunidad=` con `cargarRiesgoDePoliza`')
  const catastro = PAGINA.indexOf("String(p.tipo).toLowerCase() === 'hogar'")
  const hogar = PAGINA.indexOf("if (ramo === 'hogar')")
  assert.ok(catastro > 0 && hogar > 0, 'las dos ramas de hogar siguen en la página')
  assert.ok(carga < catastro && carga < hogar, 'la variante se lee antes de hogar: si no, hogar cotiza sin colgarse del riesgo')
  const montajes = PAGINA.match(/<RetarificadorHogar[\s\S]*?\/>/g) ?? []
  assert.equal(montajes.length, 2, 'hogar se monta en dos sitios (con y sin Catastro)')
  for (const m of montajes) assert.match(m, /variante=\{oportunidadVariante \?/, 'cada RetarificadorHogar recibe la variante')
})

test('hogar: «Pedir precio» manda `oportunidadId` y `nota` como auto/moto', () => {
  const i = HOGAR.indexOf('pedirCotizacion({')
  assert.ok(i > 0)
  const llamada = HOGAR.slice(i, HOGAR.indexOf('})', i))
  assert.match(llamada, /variante: variante \? \{ oportunidadId: variante\.oportunidadId, nota \} : null/)
  assert.match(HOGAR, /\{variante && <NotaVariante nota=\{nota\} onNota=\{setNota\} \/>\}/)
})

test('asegura valida el riesgo de la póliza antes de gastar SIN mirar el ramo (vale para hogar)', () => {
  const ruta = codigo('../../asegura/app/api/operador/codeoscopic/retarificar/route.ts')
  const desde = ruta.indexOf("const oportunidadId = typeof cuerpo.oportunidadId === 'string'")
  const valida = ruta.indexOf('validarRiesgoDePoliza(', desde)
  const gasta = ruta.indexOf('await cotizar(p.peticion)')
  assert.ok(desde > 0 && valida > desde && gasta > valida, 'validar el riesgo va antes de `cotizar`')
  const tramo = ruta.slice(ruta.indexOf("if (p.estado === 'corte')"), gasta)
  assert.doesNotMatch(tramo, /\bramo\b|tipo ===/, 'la validación no puede quedar detrás de una condición de ramo')
  assert.match(tramo, /causa: 'variante'[\s\S]*gastado: '0,00€'[\s\S]*status: 422/)
  assert.match(tramo, /contexto = \{ \.\.\.p\.peticion\.contexto, oportunidadId, nota \}/)
})

test('el riesgo de una póliza de hogar se retarifica dentro de él Y hogar-nuevo ya cuelga su presupuesto del riesgo', () => {
  for (const r of ['auto', 'moto', 'hogar']) assert.equal(retarificaEnRiesgo(r), true, r)
  for (const r of ['vida', 'decesos', '']) assert.equal(retarificaEnRiesgo(r), false, r)
  // 30/09/2026: hogar-nuevo lee `?oportunidad=` (y vida/salud/decesos también): «Con otro tomador» y «Nueva
  // variante» cuelgan la tarificación del riesgo (regla 9). Solo los ramos que se cotizan fuera quedan sin ruta.
  for (const r of ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos']) assert.equal(ramoVariante(r), r, r)
  for (const r of ['responsabilidad_civil', 'comercio', 'comunidades', 'otros', '']) assert.equal(ramoVariante(r), null, r)
})

test('422 validacion CON gastado 0,00€ = «no se ha cobrado»; 502 con/sin gastado; timeout/5xx = no se sabe', () => {
  const v = interpretarRetarificacion(422, { error: 'moto no apta', causa: 'validacion', gastado: '0,00€' })
  assert.equal(v.estado, 'error')
  assert.equal(v.estado === 'error' && v.gastoDesconocido, false)
  const sin422 = interpretarRetarificacion(422, { error: 'moto no apta', causa: 'validacion' })
  assert.equal(sin422.estado === 'error' && sin422.gastoDesconocido, true)
  const c502 = interpretarRetarificacion(502, { error: 'x', razon: 'vendor', gastado: '0,00€' })
  assert.equal(c502.estado === 'error' && c502.gastoDesconocido, false)
  const s502 = interpretarRetarificacion(502, { error: 'timeout', razon: 'vendor' })
  assert.equal(s502.estado === 'error' && s502.gastoDesconocido, true)
  const s503 = interpretarRetarificacion(500, { error: 'boom' })
  assert.equal(s503.estado === 'error' && s503.gastoDesconocido, true)
})
