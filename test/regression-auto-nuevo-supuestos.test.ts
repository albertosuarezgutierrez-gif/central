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
// Y se vigila también lo que NO debe pasar: que el campo de kilómetros nazca
// PRERRELLENADO con el supuesto. En blanco es «no se ha preguntado»; con 15.000
// escrito de oficio, el corredor lee un dato donde solo hay una media española.

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
  assert.match(
    fuente,
    /if \(kmAnuales\.trim\(\) !== '' && !kmInvalido\) correccionesFinal\.kmAnuales = Number\(kmAnuales\)/,
    'los kilómetros viajan como NÚMERO y solo si se han tecleado bien',
  )
  assert.match(
    fuente,
    /if \(fechaCompra !== '' && !compraInvalida\) correccionesFinal\.fechaCompra = fechaCompra/,
  )
  assert.match(fuente, /if \(remolqueLigero\) correccionesFinal\.remolqueLigero = true/)
})

test('el campo de kilómetros NACE VACÍO: el supuesto se enseña, no se escribe', () => {
  assert.match(fuente, /const \[kmAnuales, setKmAnuales\] = useState\(''\)/, 'estado inicial vacío')
  assert.match(
    fuente,
    /placeholder=\{String\(KM_ANUALES_SUPUESTOS\)\}/,
    'el supuesto se enseña como marcador, no como valor',
  )
  assert.doesNotMatch(
    fuente,
    /useState\(String\(KM_ANUALES_SUPUESTOS\)\)/,
    'prerrellenar el campo con el supuesto convierte un «no lo sé» en un dato afirmado',
  )
})

test('el supuesto que se enseña sale de la fuente única, no de un 15000 tecleado aquí', () => {
  assert.match(fuente, /import \{ KM_ANUALES_SUPUESTOS \} from '@central\/module-seguros'/)
  // El número en PROSA (un comentario que explica el supuesto) es correcto; lo
  // que no puede volver es el literal usado como VALOR.
  assert.doesNotMatch(fuente, /\b15000\b/, 'ningún literal del supuesto en el código de la pantalla')
})

test('un número mal tecleado se para en la pantalla, sin gastar los 0,50€', () => {
  assert.match(fuente, /const kmInvalido = kmAnuales\.trim\(\) !== '' &&/, 'existe la comprobación')
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
  assert.match(fuente, /if \(b\.kmAnuales\) setKmAnuales\(b\.kmAnuales\)/, 'y se restauran al volver')
  assert.match(fuente, /if \(b\.fechaCompra\) setFechaCompra\(b\.fechaCompra\)/)
  assert.match(fuente, /if \(b\.remolqueLigero\) setRemolqueLigero\(true\)/)
})
