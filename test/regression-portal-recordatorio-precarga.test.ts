/**
 * Guardián de las PRECARGAS de los recordatorios del portal (21/09/2026).
 *
 * Lo que vigila no lo puede comprobar un test de unidad, porque no es una
 * función sino una FRONTERA:
 *
 *  1. Que la pantalla no meta sola en el formulario una fecha `calculada`. El
 *     módulo puro ya marca la ITV como tal (y eso tiene su propio test), pero
 *     esa marca no sirve de nada si el componente la ignora y la escribe igual:
 *     no falla, no avisa, y alguien guarda una fecha que puede estar a meses de
 *     la suya creyendo que se la hemos dado nosotros.
 *  2. Que el cálculo NO baje al navegador. `proximaItv()` estima la
 *     matriculación con `@central/module-seguros`, y ese paquete importado
 *     desde un componente de cliente se lleva la cartera entera al bundle.
 *  3. Que un puente caído no tumbe la bóveda entera por una precarga, y que
 *     «no lo hemos podido mirar» se DIGA en vez de pasar por «no tienes carné».
 *
 * El fuente se lee SIN comentarios: los de estos ficheros contienen literalmente
 * las palabras que se buscan (explican la regla), así que un fichero bien
 * documentado saldría marcado y uno mudo pasaría — el cepo al revés.
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const ROOT = join(import.meta.dirname, '..')
const MODULO = 'packages/module-seguros-portal/src/recordatorio-precarga.ts'
const ITV = 'packages/module-seguros-portal/src/itv.ts'
const PANTALLA = 'apps/asegura-portal/app/(portal)/boveda/Recordatorios.tsx'
const PAGINA = 'apps/asegura-portal/app/(portal)/boveda/page.tsx'

/** Copiado de `regression-portal-parte-siniestro.test.ts`: escanea en vez de
 *  usar un regex porque un `'https://…'` dentro de una cadena truncaría media
 *  línea de código y crearía un falso negativo. */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue }
      if (c === comilla) comilla = null
      out += c; i += 1; continue
    }
    if (c === "'" || c === '"' || c === '`') { comilla = c; out += c; i += 1; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue }
    out += c; i += 1
  }
  return out
}

const leer = (rel: string) => sinComentarios(readFileSync(join(ROOT, rel), 'utf8'))

test('las piezas existen', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo verde vacío que persigue.
  for (const f of [MODULO, ITV, PANTALLA, PAGINA]) {
    assert.ok(existsSync(join(ROOT, f)), `falta ${f}`)
  }
})

test('🚨 la pantalla solo escribe la fecha cuando la precarga es FIRME', () => {
  const src = leer(PANTALLA)
  // La asignación tiene que llevar la condición pegada. Un `fecha: p.fecha` a
  // secas es exactamente el fallo: typechequea, no avisa y rellena la ITV.
  assert.match(
    src,
    /fecha:\s*p\.confianza\s*===\s*'firme'\s*\?\s*p\.fecha\s*:\s*''/,
    'la fecha de una precarga calculada no puede entrar sola en el formulario',
  )
  assert.ok(
    !/fecha:\s*p\.fecha\s*[,}]/.test(src),
    'hay una asignación de fecha sin la guarda de confianza',
  )
})

test('🚨 la pantalla no decide por su cuenta qué es firme: no recalcula ninguna fecha', () => {
  const src = leer(PANTALLA)
  for (const prohibido of ['proximaItv', 'fechaMatriculacionEstimada', 'perfilItvDeRamo']) {
    assert.ok(!src.includes(prohibido), `${prohibido} no puede vivir en un componente de cliente`)
  }
  assert.ok(
    !/from\s+'@central\/module-seguros'/.test(src),
    'importar la cartera desde un componente de cliente se la lleva al bundle',
  )
})

test('🚨 la ITV siempre viaja con algo que advertir', () => {
  const src = leer(MODULO)
  // El aviso de una ITV no puede ser `null`: si lo fuera, la pantalla la
  // pintaría como una fecha sin reparos y el «esto es un cálculo» desaparecería
  // sin que nada fallara.
  assert.ok(
    /confianza:\s*'calculada'/.test(src),
    'la ITV tiene que marcarse como calculada en el módulo',
  )
  assert.ok(
    !/clave:\s*'itv'[\s\S]{0,400}?confianza:\s*'firme'/.test(src),
    'ninguna precarga de ITV puede declararse firme',
  )
})

test('🚨 un puente caído no tumba la bóveda: el fallo del carné se captura y se declara', () => {
  const src = leer(PAGINA)
  assert.match(src, /precargasDeRecordatorio\(/, 'la página tiene que componer las precargas')
  assert.match(
    src,
    /carnetsDeIdentidad\([^)]*\)\s*\.catch\(/,
    'carnetsDeIdentidad lanza: sin catch, un puente caído deja la bóveda entera en blanco',
  )
  assert.ok(
    !/carnets:\s*\[\]/.test(src),
    'un array vacío diría «no tiene carné» sobre algo que no se ha podido mirar',
  )
})

test('🚨 una póliza que ya no está en vigor no sugiere ITV', () => {
  const src = leer(PAGINA)
  // Quien vendió el coche no quiere un recordatorio de su ITV, y la cartera que
  // se lee aquí es la VIVA (que incluye canceladas). Sin este filtro no falla
  // nada: simplemente aparece una sugerencia de un coche que ya no es suyo.
  assert.match(
    src,
    /\.filter\(\(p\) => p\.vigencia !== 'no_vigente'\)/,
    'las precargas de ITV tienen que partir de las pólizas en vigor',
  )
})

test('🚨 cepo POSITIVO: la pantalla dice cuándo NO se ha podido comprobar el carné', () => {
  const src = leer(PANTALLA)
  // Sin esto, el fallo del puente es indistinguible de no tener carné: la fila
  // de precargas sale sin el carné y nadie explica por qué.
  assert.match(src, /carnetsIlegibles/, 'la prop tiene que llegar')
  assert.match(
    src,
    /carnetsIlegibles\s*&&/,
    'tiene que haber una rama que pinte algo cuando no se ha podido comprobar',
  )
})

test('🚨 el cron de vencimientos NO manda su correo sobre un recordatorio propio', () => {
  // El fallo que esto cierra, y que esta misma precarga hace alcanzable: la
  // precarga de ITV cuelga el recordatorio de su póliza (para decir de qué
  // coche es), y el cron de vencimientos cogía TODA obligación con
  // `avisadaAt: null` sin mirar el tipo. Su correo dice «es la última fecha
  // para comunicar que no quieres renovar; el seguro vence el X» — sobre una
  // ITV, eso es decirle a alguien que se queda sin cobertura cuando no es
  // verdad. Lo que los distingue es el TIPO, nunca la póliza.
  const src = leer('apps/asegura/lib/avisos-vencimiento.ts')
  assert.match(
    src,
    /tipo:\s*\{\s*notIn:\s*\[\.\.\.TIPOS_RECORDATORIO_PROPIO\]\s*\}/,
    'el where del cron tiene que excluir los recordatorios propios',
  )
  assert.match(src, /TIPOS_RECORDATORIO_PROPIO.*from '@central\/module-seguros-portal'/, 'la lista se importa, no se copia')
})

test('🚨 la lista de tipos propios vive en UN sitio: dos copias divergirían en silencio', () => {
  const modulo = leer('packages/module-seguros-portal/src/recordatorio-libre.ts')
  assert.match(modulo, /export const TIPOS_RECORDATORIO_PROPIO/)
  // El portal la importa en vez de declarar la suya.
  const portal = leer('apps/asegura-portal/lib/recordatorios.ts')
  assert.ok(
    !/const TIPOS_PROPIOS\s*[:=]/.test(portal),
    'el portal no puede volver a declarar su propia copia de la lista',
  )
  assert.match(portal, /TIPOS_RECORDATORIO_PROPIO/)
})

test('la ITV no se calcula con periodicidad fija: el tramo manda', () => {
  const src = leer(ITV)
  // Los dos tramos del turismo tienen que estar: sin el de los 10 años, a un
  // coche viejo se le avisaría cada dos años cuando le toca cada uno.
  assert.match(src, /desdeMeses:\s*48,\s*cadaMeses:\s*24/)
  assert.match(src, /desdeMeses:\s*120,\s*cadaMeses:\s*12/)
  // Y la moto NO puede tener el tramo anual: su cuadro es otro.
  const moto = /moto:\s*\[([\s\S]*?)\]/.exec(src)
  assert.ok(moto, 'los tramos de la moto tienen que estar declarados')
  assert.ok(!/cadaMeses:\s*12/.test(moto[1]!), 'la moto es bienal de por vida, no anual')
})

test('🚨 un recordatorio recurrente no se queda CLAVADO cuando nadie tiene push', () => {
  // La regresión que esto cierra: al excluir los tipos propios del cron de
  // correo (test de arriba), `avisadaAt` dejó de sellarse en esas filas — y el
  // avance de ciclo lo exigía. Quien no tiene push activado se habría quedado
  // con su «ITV cada 12 meses» congelado en una fecha pasada PARA SIEMPRE, y
  // además invisible para la ventana de aviso. Antes lo avanzaba, de rebote, el
  // correo equivocado que se acaba de quitar.
  const src = leer('apps/asegura-portal/lib/recordatorios.ts')
  assert.match(
    src,
    /OR:\s*\[[\s\S]{0,400}?fechaEvento:\s*\{\s*lt:\s*new Date\(hoyUtc\.getTime\(\)\s*-\s*DIAS_VENTANA_AVISO/,
    'falta el brazo por TIEMPO: sin él, sin push el ciclo no avanza nunca',
  )
  assert.match(src, /DIAS_VENTANA_AVISO/, 'el plazo tiene que ser la MISMA ventana del aviso, no un número suelto')
})

test('🚨 el cron de PUSH no excluye los recordatorios propios: cambia el TEXTO', () => {
  // Es la diferencia con el cron de correo, y confundirlas deja mudo el único
  // canal que puede avisar de un recordatorio sin póliza.
  const src = leer('apps/asegura-portal/app/api/cron/avisos-push/route.ts')
  assert.match(src, /textoPushObligacion\(\{\s*tipo:\s*o\.tipo/, 'el texto tiene que decidirse por el tipo')
  assert.match(src, /select:\s*\{[^}]*tipo:\s*true/, 'sin traer el tipo, el texto no puede depender de él')
  assert.ok(
    !/notIn:\s*\[\.\.\.TIPOS_RECORDATORIO_PROPIO\]/.test(src),
    'excluirlos aquí los deja sin ningún canal de aviso',
  )
})
