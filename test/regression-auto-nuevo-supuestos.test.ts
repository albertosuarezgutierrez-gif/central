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
// los kilómetros nacen en 10.000, el garaje en «vía pública», la fecha de
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
  assert.match(
    fuente,
    /if \(kmLeidos !== null\) correccionesFinal\.kmAnuales = kmLeidos/,
    'los kilómetros viajan YA PARSEADOS y solo si se han tecleado bien',
  )
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
  assert.match(fuente, /const KM_ANUALES_POR_DEFECTO = 10000\b/)
  assert.match(fuente, /const \[kmAnuales, setKmAnuales\] = useState\(String\(KM_ANUALES_POR_DEFECTO\)\)/)
  assert.doesNotMatch(fuente, /\b15000\b/, 'el supuesto viejo no vuelve como valor')
})

test('el garaje nace en «vía pública»', () => {
  assert.match(fuente, /const \[garaje, setGaraje\] = useState\(\s*\(\) => \(garajes\.find\(\(g\) => \/v\[ií\]a\\s\+p\[uú\]blica\/i/)
})

test('la fecha de matriculación se estima por la matrícula, sin pisar la del corredor', () => {
  assert.match(fuente, /import \{ fechaMatriculacionEstimada \} from '@central\/module-seguros\/matricula'/)
  assert.match(fuente, /onChange=\{\(e\) => cambiarMatricula\(e\.target\.value\)\}/, 'la matrícula dispara la estimación')
  assert.match(fuente, /if \(matriculacion === '' \|\| matriculacionEstimada\) \{/, 'solo rellena vacía o ya estimada')
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
  assert.match(fuente, /if \(b\.kmAnuales\) setKmAnuales\(b\.kmAnuales\)/, 'y se restauran al volver')
  assert.match(fuente, /if \(b\.fechaCompra\) setFechaCompra\(b\.fechaCompra\)/)
  assert.match(fuente, /if \(b\.remolqueLigero\) setRemolqueLigero\(true\)/)
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
