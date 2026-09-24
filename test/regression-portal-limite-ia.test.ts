// Las dos rutas del portal que GASTAN (IA propia y consultas al Catastro con
// nuestra IP) tienen tope por IDENTIDAD.
//
// Hasta la auditoría del 20/09/2026 solo exigían sesión — y la sesión NO es un
// tope: entrar al portal es pedir un código a un correo cualquiera, así que
// cualquiera con un buzón consigue una. El docblock de `catastro/sugerir` decía
// literalmente que la sesión estaba ahí para no «gastar IA de nuestra cuenta».
//
// 🪤 Mide el ORDEN, no la presencia: un tope DEBAJO de la llamada a la IA se
// pone verde en un test de palabras y no evita ni un céntimo. Es el mismo cepo
// que `regression-portal-limite-acceso.test.ts` para el amplificador de correo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const POLIZAS = 'apps/asegura-portal/app/api/polizas/route.ts'
const SUGERIR = 'apps/asegura-portal/app/api/catastro/sugerir/route.ts'

const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** El cuerpo del `POST`: por encima están los `import` y las constantes, que
 *  falsearían cualquier comparación por posición. */
function cuerpoDelPost(ruta: string): string {
  const fuente = sinComentarios(leer(ruta))
  const i = fuente.indexOf('export async function POST')
  assert.ok(i > 0, `no se encontró el handler POST en ${ruta}`)
  return fuente.slice(i)
}

function pos(cuerpo: string, aguja: string): number {
  const i = cuerpo.indexOf(aguja)
  assert.ok(i >= 0, `no aparece en el cuerpo del POST: ${aguja}`)
  return i
}

test('POST /api/polizas topa por identidad ANTES de leer el fichero y de llamar a la IA', () => {
  const cuerpo = cuerpoDelPost(POLIZAS)
  const tope = pos(cuerpo, 'rateLimit(')
  assert.ok(tope < pos(cuerpo, 'altaConDocumento('), 'el tope va antes de procesar el documento')
  assert.ok(tope < pos(cuerpo, 'altaAMano('), 'el tope cubre también el alta a mano: también escribe filas')
  const entero = sinComentarios(leer(POLIZAS))
  assert.ok(pos(entero, 'rateLimit(') < pos(entero, 'extraerPoliza('), 'la IA se llama después del tope')
})

test('POST /api/catastro/sugerir topa ANTES de la IA y del Catastro', () => {
  const cuerpo = cuerpoDelPost(SUGERIR)
  assert.ok(pos(cuerpo, 'rateLimit(') < pos(cuerpo, 'sugerirDirecciones('), 'hasta 9 consultas + 1 de IA por llamada')
})

test('el tope es por IDENTIDAD, nunca por IP', () => {
  // Varios clientes comparten IP (una oficina, el CGNAT del móvil) y el mismo
  // cliente cambia de red: por IP se castiga al vecino y se le escapa el abuso.
  for (const ruta of [POLIZAS, SUGERIR]) {
    const cuerpo = cuerpoDelPost(ruta)
    const i = pos(cuerpo, 'rateLimit(')
    const llamada = cuerpo.slice(i, i + 160)
    assert.match(llamada, /identidad\.id/, `${ruta}: la clave del tope tiene que ser la identidad`)
    assert.doesNotMatch(llamada, /getIp\(/, `${ruta}: por IP no vale aquí`)
  }
})

test('el tope agotado es 429 con retry-after, no un 400 ni un 500', () => {
  for (const ruta of [POLIZAS, SUGERIR]) {
    const fuente = sinComentarios(leer(ruta))
    assert.match(fuente, /demasiadas_peticiones/, `${ruta}: el error tiene nombre propio`)
    assert.match(fuente, /status:\s*429/, `${ruta}: un tope agotado es 429`)
    assert.match(fuente, /retry-after/i, `${ruta}: sin retry-after el cliente no sabe cuándo volver`)
  }
})

test('las constantes del tope tienen NOMBRE, como en /api/acceso/solicitar', () => {
  for (const ruta of [POLIZAS, SUGERIR]) {
    const fuente = sinComentarios(leer(ruta))
    assert.match(fuente, /const MAX_POR_IDENTIDAD = \d+/, `${ruta}: un número suelto en la llamada no se puede leer`)
    assert.match(fuente, /const VENTANA_MS = /, `${ruta}: la ventana también`)
  }
})

test('se reutiliza el limitador de la app, no se escribe otro', () => {
  for (const ruta of [POLIZAS, SUGERIR]) {
    assert.match(
      sinComentarios(leer(ruta)),
      /import\s*\{[^}]*rateLimit[^}]*\}\s*from\s*'@\/lib\/rate-limit'/,
      `${ruta}: el tope sale de lib/rate-limit`,
    )
  }
})

test('la sesión sigue exigiéndose: el tope se suma, no sustituye', () => {
  for (const ruta of [POLIZAS, SUGERIR]) {
    const cuerpo = cuerpoDelPost(ruta)
    assert.ok(pos(cuerpo, 'requireIdentidad()') < pos(cuerpo, 'rateLimit('), `${ruta}: sin identidad no hay clave que topar`)
    assert.match(cuerpo, /sin_sesion/, `${ruta}: sin sesión, 401`)
  }
})
