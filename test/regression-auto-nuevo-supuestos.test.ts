import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián de los tres datos del coche que hasta el 21/09/2026 viajaban al
// tarificador SIN que nadie los hubiera preguntado (comparativa con Avant2,
// `docs/superpowers/specs/2026-09-21-avant2-auto-tarificacion-comparativa-design.md`).
//
// `kilometersPerYear`, `purchaseDate` y `lightTrailer` SIEMPRE han ido en el
// cuerpo de `POST /insurances`: lo que faltaba era poder desmentir el supuesto
// desde la pantalla. Quitar cualquiera de los tres campos del formulario no
// rompe ningún tipo ni ninguna llamada — la cotización volvería a salir con el
// valor inventado y el precio seguiría pareciendo bueno. Por eso se vigila
// leyendo el FUENTE.
//
// 25/09/2026 — Alberto cambia la decisión del 21/09 («que salga por defecto»):
// los kilómetros nacen en 10.000, el garaje en «vía pública» (29/09: en garaje), la fecha de
// matriculación se ESTIMA por la matrícula (marcada como estimada) y la de
// compra enseña la de matriculación. Lo que se sigue vigilando: que la
// estimación nunca pise una fecha tecleada y que se declare como estimada.

const FORM = join(
  import.meta.dirname,
  '..',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx',
)
const fuente = readFileSync(FORM, 'utf8')

test('la pantalla pregunta los tres datos que antes se suponían', () => {
  assert.match(fuente, /etiqueta="Kilómetros al año"/, 'el campo de kilómetros sigue montado')
  assert.match(fuente, /etiqueta="Fecha de compra"/, 'el campo de fecha de compra sigue montado')
  assert.match(fuente, /etiqueta="Remolque ligero/, 'el campo de remolque ligero sigue montado')
})

test('los tres viajan al puerto, y solo cuando el corredor los ha dicho', () => {
  // 10/10/2026: los km viajan YA PARSEADOS por `kmParaCotizar` (lib/correduria/km-auto.ts): como corrección solo
  // si son DATO del cliente; los 10.000 de partida van como supuesto (`resueltos.kmAnualesSupuestos`).
  assert.match(
    fuente,
    /const km = kmParaCotizar\(\{ texto: kmAnuales, porDefecto: KM_AUTO_POR_DEFECTO, delRiesgo: kmDelRiesgo, tocado: kmTocado \}\)/,
    'los kilómetros pasan por el helper puro que separa dato de supuesto',
  )
  assert.match(fuente, /if \(km\.correccion !== null\) correccionesFinal\.kmAnuales = km\.correccion/, 'como corrección, solo el dato')
  assert.match(fuente, /\.\.\.\(km\.supuesto !== null \? \{ kmAnualesSupuestos: km\.supuesto \} : \{\}\)/, 'el defecto viaja como supuesto')
  assert.match(fuente, /kmAnuales: km\.paraRiesgo,/, 'al riesgo solo se anota el dato, nunca el supuesto')
  assert.doesNotMatch(fuente, /if \(kmLeidos !== null\) correccionesFinal\.kmAnuales = kmLeidos/, 'el defecto no vuelve a viajar como dato del cliente')
  assert.doesNotMatch(
    fuente,
    /correccionesFinal\.kmAnuales = Number\(/,
    '`Number()` lee «15.000» como 15: el parseo es `kilometrosDesdeTexto`, no el del navegador',
  )
  assert.match(
    fuente,
    /if \(fechaCompra !== '' && !compraInvalida\) correccionesFinal\.fechaCompra = fechaCompra/,
  )
  assert.match(fuente, /if \(remolqueLigero\) correccionesFinal\.remolqueLigero = true/)
})

test('los kilómetros nacen en 10.000, visibles y editables', () => {
  // 10/10/2026: UNA sola constante para la pantalla y el asistente de Telegram, en `lib/correduria/km-auto.ts`.
  assert.match(readFileSync(join(import.meta.dirname, '..', 'apps/plataforma/lib/correduria/km-auto.ts'), 'utf8'), /export const KM_AUTO_POR_DEFECTO = 10000\b/)
  assert.match(fuente, /import \{ KM_AUTO_POR_DEFECTO,[^}]*\} from '@\/lib\/correduria\/km-auto'/)
  assert.doesNotMatch(fuente, /const KM_(ANUALES|AUTO)_POR_DEFECTO =/, 'ni una copia local de la constante')
  // 30/09/2026: los km del riesgo mandan si los trae; si no, nacen en el defecto.
  assert.match(fuente, /const \[kmAnuales, setKmAnuales\] = useState\(datosRiesgo\?\.kmAnuales != null \? String\(datosRiesgo\.kmAnuales\) : String\(KM_AUTO_POR_DEFECTO\)\)/)
  assert.doesNotMatch(fuente, /\b15000\b/, 'el supuesto viejo no vuelve como valor')
})

test('el garaje nace en GARAJE, nunca en la calle (29/09/2026; antes «vía pública»)', () => {
  // 30/09/2026: el garaje del riesgo (si sigue en el catálogo) manda; si no, el defecto GARAJE.
  assert.match(fuente, /const \[garaje, setGaraje\] = useState\(\(\) => garajeDelRiesgo \?\? garajePorDefecto\(garajes\)\?\.id \?\? ''\)/)
  assert.doesNotMatch(fuente, /garajes\.find\(\(g\) => \/v\[ií\]a/, 'el defecto viejo no vuelve')  // El «soltero» por defecto es SOLO del asistente: aquí viajaría sin marca de supuesto y se emitiría sin aviso.
  assert.doesNotMatch(fuente, /estadoCivilPorDefecto/, 'la pantalla no pone estado civil por defecto')
})

test('la fecha de matriculación se estima por la matrícula, sin pisar la del corredor', () => {
  assert.match(fuente, /import \{ fechaMatriculacionEstimada \} from '@central\/module-seguros\/matricula'/)
  // 10/10/2026: embebido en la oportunidad la fecha es la del riesgo (no se estima aquí en silencio).
  assert.match(fuente, /const puedeRellenarFecha = !embebido && \(matriculacion === '' \|\| matriculacionEstimada\)/, 'solo rellena vacía o ya estimada')
  assert.match(fuente, /if \(!puedeRellenarFecha\) return/)
  assert.match(fuente, /\}, \[matricula\]\)/, 'se recalcula con CADA matrícula, también la restaurada del borrador')
  assert.match(fuente, /tipo=fecha-matriculacion&matricula=/, 'consulta la fecha a Avant2 (/car/registration-date)')
  assert.match(fuente, /setMatriculacionEstimada\(false\)/, 'teclear la fecha la hace del corredor')
  assert.match(fuente, /Estimada por la matrícula/, 'se declara como estimada en pantalla')
})

test('la fecha de compra enseña la de matriculación por defecto', () => {
  assert.match(fuente, /value=\{fechaCompra \|\| matriculacion\}/)
})

test('un número mal tecleado se para en la pantalla, sin gastar los 0,50€', () => {
  assert.match(fuente, /const kmLeidos = kilometrosDesdeTexto\(kmAnuales\)/, 'el parseo es el compartido')
  assert.match(fuente, /const kmInvalido = kmAnuales\.trim\(\) !== '' && kmLeidos === null/)
  assert.match(fuente, /faltaHistorial \|\| kmInvalido/, 'y bloquea el botón de cotizar')
})

test('una fecha de compra anterior a la matriculación se para antes de pagar', () => {
  assert.match(
    fuente,
    /const compraInvalida = fechaCompra !== '' && matriculacion !== '' && fechaCompra < matriculacion/,
  )
  assert.match(fuente, /kmInvalido \|\| compraInvalida/, 'y bloquea el botón de cotizar')
})

test('no se pierden al salir de la pantalla: van en el borrador local', () => {
  const tipo = fuente.slice(fuente.indexOf('type BorradorAutoNuevo = {'), fuente.indexOf('const PERSONA_VACIA'))
  for (const campo of ['kmAnuales?: string', 'fechaCompra?: string', 'remolqueLigero?: boolean']) {
    assert.ok(tipo.includes(campo), `el borrador declara ${campo}`)
  }
  assert.match(fuente, /if \(b\.kmAnuales && datosRiesgo\?\.kmAnuales == null\) setKmAnuales\(b\.kmAnuales\)/, 'y se restauran al volver (salvo que el riesgo ya los traiga)')
  assert.match(fuente, /if \(b\.fechaCompra && !datosRiesgo\?\.fechaCompra\) setFechaCompra\(b\.fechaCompra\)/)
  assert.match(fuente, /if \(b\.remolqueLigero && datosRiesgo\?\.remolqueLigero == null\) setRemolqueLigero\(true\)/)
})

// ── Lo que se PINTA junto al precio tiene que ser lo que VIAJÓ ──────────────
// 🪤 El precalificador supone ANTES de recibir las correcciones, así que su
// lista habla del estado anterior. Sin filtrarla, la pantalla enseña «este
// precio sale suponiendo kmAnuales: 15000» junto a un precio tarificado con
// los 8.000 que tecleó el corredor. Nada falla: solo miente, y encima sobre la
// cotización que acaba de costar 0,50€.

const PUERTO = join(import.meta.dirname, '..', 'apps/asegura/lib/retarificar-cartera.ts')
const puerto = readFileSync(PUERTO, 'utf8')

test('ninguna respuesta devuelve los supuestos SIN filtrar por las correcciones', () => {
  assert.doesNotMatch(
    puerto,
    /supuestos: pre\.supuestos(?! as \{)/,
    'un `supuestos: pre.supuestos` crudo vuelve a pintar como supuesto lo que el corredor ya corrigió',
  )
  assert.equal(
    (puerto.match(/supuestosVigentes\(/g) ?? []).length,
    6,
    'las seis salidas de supuestos (auto, moto, hogar, auto nueva, moto nueva y el genérico) lo aplican',
  )
})
