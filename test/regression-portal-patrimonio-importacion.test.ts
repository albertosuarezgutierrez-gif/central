// Guardián de IMPORTAR PATRIMONIO DESDE EXCEL/CSV (P18, 26/10/2026). `node --test` (gate en CI vía `pnpm test:guardia`).
//
// Lo que se vigila (el comportamiento de las reglas lo prueban `importacion.test.ts` y `importacion-api.test.ts`):
//   1. HASTA CONFIRMAR NO ENTRA NADA: ninguna lectura de rentabilidad, calendario, avisos… toca las tablas de importación, y
//      la propuesta solo se crea en `importacion-bd.ts`;
//   2. el adaptador de BD parte de `accesosPatrimonio`, filtra por la identidad y por el titular autorizado, y confirma en UNA
//      transacción cuyo primer paso es el cierre condicionado a que siguiera abierta (confirmar dos veces no duplica);
//   3. la lógica de la API responde 404 (nunca 403) y exige nivel Total (`alta_baja`);
//   4. el lector de ficheros tiene sus topes y descarta las columnas con datos personales ANTES de que nada las toque;
//   5. nada convierte «no se sabe» en 0 ni en un valor de cajón en las reglas puras.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const BD = 'apps/asegura-portal/lib/patrimonio/importacion-bd.ts'
const API = 'apps/asegura-portal/lib/patrimonio/importacion-api.ts'
const LECTURA = 'apps/asegura-portal/lib/patrimonio/importacion-lectura.ts'
const PURO = 'packages/module-patrimonio/src/importacion.ts'
const RUTAS = [
  'apps/asegura-portal/app/api/patrimonio/importaciones/route.ts',
  'apps/asegura-portal/app/api/patrimonio/importaciones/[id]/route.ts',
  'apps/asegura-portal/app/api/patrimonio/importaciones/[id]/confirmar/route.ts',
  'apps/asegura-portal/app/api/patrimonio/importaciones/[id]/descartar/route.ts',
  'apps/asegura-portal/app/api/patrimonio/importaciones/plantilla/route.ts',
]

const TABLAS_IMPORTACION = /portalPatrimonioImportacion/

/** Ficheros del portal (sin tests) que mencionan las tablas de importación. */
export function quienToca(ficheros: ReadonlyArray<{ f: string; src: string }>): string[] {
  return ficheros.filter(({ src }) => TABLAS_IMPORTACION.test(src)).map(({ f }) => f)
}

test('el detector de «quién toca las tablas de importación» muerde (brazos sintéticos)', () => {
  assert.deepEqual(quienToca([{ f: 'rentabilidad-bd.ts', src: 'await prisma.portalPatrimonioImportacionFila.findMany({})' }]), ['rentabilidad-bd.ts'])
  assert.deepEqual(quienToca([{ f: 'ok.ts', src: 'await prisma.portalPatrimonioGasto.findMany({})' }]), [])
})

test('🚨 hasta confirmar no entra nada: solo importacion-bd.ts toca las tablas de importación (ni rentabilidad, ni calendario, ni avisos)', () => {
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => ({ f, src: leer(f) }))
  assert.ok(ficheros.some(({ f }) => f === BD), 'el cepo no está viendo importacion-bd.ts')
  assert.deepEqual(quienToca(ficheros), [BD], 'las tablas de importación tienen UNA puerta; lo que leen rentabilidad/calendario/avisos no pasa por ellas')
})

test('🚨 importacion-bd: parte de accesosPatrimonio y TODA consulta de una importación lleva la identidad y el titular autorizado', () => {
  const src = leer(BD)
  assert.match(src, /\baccesosPatrimonio\(identidadId\)/)
  const consultas = [...src.matchAll(/portalPatrimonioImportacion\.(findFirst|updateMany|count)\(\{([\s\S]*?)\n\s*\}\)/g)]
  assert.ok(consultas.length >= 6, `esperaba ≥6 consultas sobre la importación, hay ${consultas.length}`)
  for (const m of consultas) {
    const cuerpo = m[2]
    if (/titularId, ficheroHash/.test(cuerpo)) continue // la comprobación de «mismo fichero abierto»: el titular ya salió de titularDe(accesos)
    // El cierre tras la guarda (`where: { id, estado… }` dentro de la MISMA transacción ya autorizada) y el sello de resultado.
    if (/data: \{ resultado:/.test(cuerpo) || (/data: \{ estado: 'confirmada'/.test(cuerpo) && /estado: \{ in: ABIERTAS \}/.test(cuerpo))) continue
    assert.match(cuerpo, /identidadId/, `consulta sin la identidad:\n${m[0]}`)
  }
  // Las que leen/escriben por id desde la request llevan además el titular DENTRO de los accesos.
  for (const nombre of ['leer', 'guardarMapeo', 'descartar']) {
    const i = src.indexOf(`async ${nombre}(`)
    assert.ok(i >= 0, nombre)
    const trozo = src.slice(i, i + 1400)
    assert.match(trozo, /titular: \{ clienteId: \{ in: \[\.\.\.acc\.keys\(\)\] \}, archivadoEn: null \}/, `${nombre}: titular fuera de los accesos`)
  }
  assert.doesNotMatch(src, /\.delete\(|\.deleteMany\(|\$queryRawUnsafe|\$executeRawUnsafe/, 'sin DELETE: se cierra con estado')
})

test('🚨 confirmar es UNA transacción y su primer paso es el cierre condicionado a seguir abierta (no duplica al confirmar dos veces)', () => {
  const src = leer(BD)
  const i = src.indexOf('async confirmar(')
  const trozo = src.slice(i, src.indexOf('async descartar('))
  assert.match(trozo, /prisma\.\$transaction\(/)
  const cierre = trozo.indexOf("estado: 'confirmada'")
  const creacion = trozo.indexOf('crearFila(tx')
  assert.ok(cierre > 0 && creacion > cierre, 'el cierre va ANTES de crear nada')
  assert.match(trozo.slice(0, creacion), /estado: \{ in: ABIERTAS \}[\s\S]*?cierre\.count === 0\) return/, 'si el cierre no tocó ninguna fila, no se crea nada')
  // Evalúa contra lo que hay DENTRO de la transacción, no contra lo que se vio en la vista previa.
  assert.match(trozo, /contextoDe\(tx,/)
  assert.match(trozo, /creadoId/, 'cada fila creada sella creado_id')
  assert.match(trozo, /resultado/, 'la auditoría guarda el recuento')
  // Solo se crean las «nueva».
  assert.match(trozo, /if \(f\.estado !== 'nueva'\) continue/)
})

test('🚨 api: 404 nunca 403, nivel Total para todo, importación buscada dentro de lo autorizado', () => {
  const src = leer(API)
  assert.doesNotMatch(src, /status:\s*403/)
  assert.match(src, /puede\(accesos\.get\(x\.titular\), 'alta_baja'\)/, 'subir exige Total')
  assert.match(src, /puede\(accesos\.get\(imp\.clienteId\), 'alta_baja'\)/, 'ver/mapear/confirmar/descartar exigen Total')
  for (const f of ['responderVer', 'responderMapear', 'responderConfirmar', 'responderDescartar']) {
    const i = src.indexOf(`export async function ${f}(`)
    assert.match(src.slice(i, i + 400), /await dentro\(p, id\)/, `${f} no busca la importación dentro de lo autorizado`)
  }
  assert.match(src, /creadasHoy\(\)\) >= MAX_IMPORTACIONES_DIA/, 'el tope diario se cuenta en BD antes de abrir el fichero')
  assert.match(src, /if \(tipo === null\) return \{ status: 422/, 'un fichero que no se reconoce no se adivina')
})

test('rutas: ninguna toca prisma; la identidad sale de la sesión; la subida corta por tamaño antes de leer el cuerpo', () => {
  for (const r of RUTAS) {
    const src = leer(r)
    assert.doesNotMatch(src, /prisma/, r)
    assert.match(src, /requireIdentidad\(\)/, r)
  }
  const subida = leer(RUTAS[0])
  assert.ok(subida.indexOf('content-length') < subida.indexOf('req.formData()'), 'el tope por Content-Length va antes de formData()')
  assert.match(subida, /MAX_BYTES_IMPORTACION/)
  assert.doesNotMatch(leer(RUTAS[4]), /prisma|findMany/, 'la plantilla no consulta la BD')
})

test('🚨 lector: topes antes de abrir, solo .xlsx/texto, sin fórmulas, y las columnas con datos personales se tiran al leer', () => {
  const src = leer(LECTURA)
  assert.ok(src.indexOf('MAX_BYTES_IMPORTACION') < src.indexOf('XLSX.read('), 'el tope de tamaño va ANTES de abrir el fichero')
  assert.match(src, /sheetRows: MAX_FILAS_IMPORTACION \+ 2/)
  assert.match(src, /cellFormula: false/)
  assert.match(src, /ES_OLE\(bytes\)\) return \{ ok: false, motivo: 'formato' \}/, '.xls antiguo fuera')
  assert.match(src, /SheetNames\[0\]/, 'solo la primera hoja')
  assert.match(src, /esColumnaSensible\(n\)/)
  assert.match(src, /sensibles\[k\] \? null/, 'la columna sensible se vacía en cada fila')
  assert.doesNotMatch(src, /prisma|\.\.\/db/, 'el lector no ve la BD')
  // La app no guarda el fichero: ni documentos ni bytes.
  assert.doesNotMatch(leer(BD), /contenido|portalPatrimonioDocumento|documentoId/)
})

test('puro: «no se sabe» no se convierte en 0 ni en valores de cajón', () => {
  const src = leer(PURO)
  assert.doesNotMatch(src, /\?\?\s*(0|\[\]|false)\b/)
  assert.doesNotMatch(src, /\?\?\s*'otro'|\|\|\s*'otro'/)
  assert.match(src, /MAX_FILAS_IMPORTACION = 500/)
  assert.match(src, /MAX_BYTES_IMPORTACION = 5 \* 1024 \* 1024/)
})
