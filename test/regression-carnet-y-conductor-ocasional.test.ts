import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián de los dos huecos que destapó comparar nuestro formulario de auto
// con el de Avant2 (21/09/2026, §5 de
// `docs/superpowers/specs/2026-09-21-avant2-auto-tarificacion-comparativa-design.md`):
//
//  1. El carnet iba CABLEADO a `{type:'B', issuingZone:'Spain'}`. Un carnet
//     extranjero se declaraba como español y el vendor lo aceptaba: tarifica y
//     devuelve un precio firme. No es un precio malo — es una declaración
//     inexacta del riesgo (art. 10 LCS) que paga el asegurado el día del
//     siniestro.
//  2. El conductor ocasional (`secondaryDriver`) no viajaba siquiera. No
//     declarar a quien también conduce es reticencia, misma ley, mismo
//     perjudicado.
//
// Ninguno de los dos rompe un tipo ni una llamada si alguien los quita: la
// cotización seguiría saliendo, con el mismo aspecto y el precio equivocado.
// Por eso se vigilan leyendo el FUENTE.

const raiz = join(import.meta.dirname, '..')
const persona = readFileSync(join(raiz, 'apps/asegura/lib/codeoscopic/persona.ts'), 'utf8')
const peticion = readFileSync(join(raiz, 'apps/asegura/lib/codeoscopic/peticion-auto.ts'), 'utf8')
const puerto = readFileSync(join(raiz, 'apps/asegura/lib/retarificar-cartera.ts'), 'utf8')
const pantalla = readFileSync(
  join(raiz, 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx'),
  'utf8',
)

test('el carnet NO vuelve a viajar cableado', () => {
  assert.doesNotMatch(
    persona,
    /type: \{ id: 'B' \}/,
    'el tipo de carnet sale de `extra.tipoCarnet`, con el supuesto en una constante',
  )
  assert.doesNotMatch(persona, /issuingZone: \{ id: 'Spain' \}/, 'lo mismo para la zona de expedición')
  assert.match(persona, /TIPO_CARNET_SUPUESTO = 'B'/)
  assert.match(persona, /ZONA_CARNET_SUPUESTA = 'Spain'/)
})

test('el supuesto del carnet se DECLARA, no se aplica en silencio', () => {
  const desde = readFileSync(join(raiz, 'apps/asegura/lib/codeoscopic/desde-cartera.ts'), 'utf8')
  // Dos veces: retarificar una póliza y la oportunidad nueva. Moto tiene su
  // propio catálogo de carnets y queda fuera a propósito.
  assert.equal((desde.match(/suponer\(\s*'zonaCarnet'/g) ?? []).length, 2)
  assert.equal((desde.match(/suponer\(\s*'tipoCarnet'/g) ?? []).length, 2)
})

test('el conductor ocasional viaja como `secondaryDriver`', () => {
  assert.match(peticion, /riesgo\.secondaryDriver = construirPersona\(d\.conductorOcasional/)
  assert.match(peticion, /if \(d\.conductorOcasional\) \{/, 'y solo si se ha declarado')
})

test('los dos catálogos del carnet se sirven, y gratis', () => {
  assert.match(puerto, /case 'zonas-carnet':/)
  assert.match(puerto, /case 'tipos-carnet':/)
  // Están en `resolverCatalogo`, que corre con el interruptor de tarificación
  // ignorado: elegir la zona no puede exigir haber pagado.
  const resolver = puerto.slice(puerto.indexOf('export async function resolverCatalogo'))
  assert.match(resolver.slice(0, resolver.indexOf('export ', 10)), /case 'zonas-carnet':/)
})

test('la pantalla los pregunta, y nacen VACÍOS', () => {
  assert.match(pantalla, /etiqueta="Carnet expedido en"/)
  assert.match(pantalla, /etiqueta="Tipo de carnet"/)
  assert.match(pantalla, /const \[zonaCarnet, setZonaCarnet\] = useState\(''\)/)
  assert.match(pantalla, /const \[tipoCarnet, setTipoCarnet\] = useState\(''\)/)
  // Y en blanco NO se manda: manda el supuesto declarado del precalificador.
  assert.match(pantalla, /if \(zonaCarnet !== ''\) correccionesFinal\.zonaCarnet = zonaCarnet/)
  assert.match(pantalla, /if \(tipoCarnet !== ''\) correccionesFinal\.tipoCarnet = tipoCarnet/)
})

test('la pantalla ofrece el conductor ocasional y lo manda', () => {
  assert.match(pantalla, /conductor ocasional/i)
  assert.match(pantalla, /correccionesFinal\.conductorOcasional = personaParaPuerto\(ocasional, true\)/)
})

test('un ocasional con el DNI del habitual se para en la pantalla, sin pagar', () => {
  assert.match(pantalla, /const ocasionalDuplicado =/)
  assert.match(pantalla, /faltaOcasional \|\| ocasionalDuplicado/, 'y bloquea el botón de cotizar')
})
