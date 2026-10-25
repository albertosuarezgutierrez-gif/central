// Guardián del PATRIMONIO del portal (22/10/2026): un cliente NO ve los inmuebles, contratos ni gastos de otro.
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// El rol `prisma_asegura_portal` NO tiene BYPASSRLS y las tablas `portal_patrimonio_*` no tienen RLS: lo único
// que separa el patrimonio de un titular del de otro es que TODO fichero que toque `prisma.portalPatrimonio*`
// parta de `accesosPatrimonio()` (resuelto desde la cookie y `portal_vinculo`), y que ese adaptador no regale
// el nivel `total` a lo que no lo merece. La regla pura (`nivelesPatrimonio`) tiene su test en
// `packages/module-patrimonio/src/acceso.test.ts`; esto vigila lo que el puro NO puede saber (hallazgo de
// revisión del paso 2: el puro da `total` a toda ficha que reciba en `vinculadas`).
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const ACCESOS = 'apps/asegura-portal/lib/patrimonio/accesos.ts'
const LECTURA = 'apps/asegura-portal/lib/patrimonio/lectura.ts'

function cuerpo(src: string, nombre: string): string {
  const i = src.indexOf(`export async function ${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre} en ${ACCESOS}`)
  const j = src.indexOf('\nexport ', i + 1)
  return src.slice(i, j < 0 ? undefined : j)
}

test('🚨 accesosPatrimonio sale de la COOKIE y de portal_vinculo de ESA identidad', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /const sesion = await getIdentidad\(\)/)
  assert.match(f, /if \(!sesion \|\| sesion\.id !== identidadId\) return new Map\(\)/)
  assert.match(f, /portalVinculo\.findMany\(\{\s*where: \{ identidadId \}/)
})

test('🚨 la vista de corredor no abre el patrimonio: ni su sesión ni sus vínculos temporales', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /if \(sesion\.corredor\) return new Map\(\)/)
  assert.match(f, /select: \{ clienteId: true, nivel: true, origen: true \}/)
  assert.match(f, /v\.origen !== 'corredor'/)
})

test('🚨 solo los vínculos que OPERAN dan «total»; y son los mismos que alimentan Dueño y autorizaciones', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /const queOperan = vinculos\.filter\(\(v\) => v\.origen !== 'corredor' && puedeAutorizar\(nivelDe\(v\.nivel\)\)\)/)
  assert.match(f, /const propias = \[\.\.\.new Set\(queOperan\.map\(\(v\) => v\.clienteId\)\)\]/)
  assert.match(f, /empresasDeFichas\(queOperan\)/)
  assert.match(f, /vinculadas: propias,/)
  // Ningún atajo con la lista cruda de vínculos.
  assert.doesNotMatch(f, /empresasDeFichas\(vinculos\)/)
  assert.doesNotMatch(f, /vinculadas: vinculos/)
})

test('🚨 autorizaciones: solo alcances de PATRIMONIO y solo las que me alcanzan A MÍ', () => {
  const src = leer(ACCESOS)
  const f = cuerpo(src, 'accesosPatrimonio')
  assert.match(src, /const ALCANCES_PATRIMONIO = \[ALCANCE_PATRIMONIO_GESTION, ALCANCE_PATRIMONIO_TOTAL\]/)
  assert.match(f, /alcance: \{ in: ALCANCES_PATRIMONIO \}/)
  assert.match(f, /\{ autorizadoIdentidadId: identidadId \}/)
  assert.match(f, /autorizadoClienteId: \{ in: propias \}/)
  // Los alcances de la bóveda NO abren el patrimonio.
  assert.doesNotMatch(src, /ALCANCES\b(?!_PATRIMONIO)/)
})

test('🚨 fichasVivas: solo fichas activas y sin fusionar llegan a la regla pura', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /prisma\.cliente\.findMany\(\{\s*where: \{ id: \{ in: candidatas \}, mergedIntoClienteId: null, activo: true \}/)
  assert.match(f, /fichasVivas: new Set\(vivas\.map\(\(f\) => f\.id\)\)/)
  assert.match(f, /const porCartera = nivelesPatrimonio\(\{/)
})

test('lectura.ts es PURO: sin prisma ni sesión, y sin convertir «no se sabe» en 0', () => {
  const src = leer(LECTURA)
  assert.doesNotMatch(src, /from ['"][^'"]*(\/db|\/session|@prisma\/client)['"]/)
  assert.doesNotMatch(src, /prisma\./)
  assert.doesNotMatch(src, /\?\?\s*(0|\[\]|false|'otro')\b/)
})

// ─── Todo fichero que toque `prisma.portalPatrimonio*` pasa por `accesosPatrimonio` ─────────────────────
const USA_PATRIMONIO = /prisma\s*\.\s*portalPatrimonio[A-Z]/
const PASA_POR_ACCESOS = /\baccesosPatrimonio\(/

/** Infractores: tocan las tablas del patrimonio sin resolver antes los accesos de la sesión. */
/**
 * El ÚNICO fichero que puede tocar el patrimonio sin `accesosPatrimonio`: el adaptador del cron de gastos (lo ejecuta
 * `CRON_SECRET`, no una persona). Añadir algo aquí es una decisión, no un trámite.
 */
const CRON_SIN_SESION = new Set(['apps/asegura-portal/lib/patrimonio/generar-gastos-bd.ts'])

function sinAccesos(ficheros: ReadonlyArray<{ f: string; src: string }>): string[] {
  return ficheros
    .filter(({ f, src }) => !CRON_SIN_SESION.has(f) && USA_PATRIMONIO.test(src) && !PASA_POR_ACCESOS.test(src))
    .map(({ f }) => f)
}

test('el detector de este cepo muerde (brazos sintéticos)', () => {
  assert.deepEqual(sinAccesos([{ f: 'a.ts', src: 'await prisma.portalPatrimonioInmueble.findMany({})' }]), ['a.ts'])
  assert.deepEqual(
    sinAccesos([{ f: 'b.ts', src: 'const a = await accesosPatrimonio(id); await prisma.portalPatrimonioGasto.findMany({})' }]),
    [],
  )
})

test('🚨 ningún fichero del portal toca prisma.portalPatrimonio* sin pasar por accesosPatrimonio', () => {
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // El test de la regla pura y los propios ficheros de test no consultan.
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .map((f) => ({ f, src: leer(f) }))
  assert.ok(ficheros.some(({ f }) => f === ACCESOS), 'el cepo no está viendo lib/patrimonio/accesos.ts')
  const infractores = sinAccesos(ficheros)
  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros leen o escriben el PATRIMONIO sin resolver antes `accesosPatrimonio(identidadId)`. Sin RLS, ' +
      `una consulta con el titular de la URL devuelve los inmuebles de cualquiera:\n  - ${infractores.join('\n  - ')}`,
  )
})

// ─── Documentos (paso 8, 22/10/2026): ficheros en BD de un titular que no son de otro ───────────────────────────
const DOC_BD = 'apps/asegura-portal/lib/patrimonio/documentos-bd.ts'
const DOC_RUTA = 'apps/asegura-portal/app/api/patrimonio/documentos/route.ts'
const DOC_RUTA_ID = 'apps/asegura-portal/app/api/patrimonio/documentos/[id]/route.ts'

/** Cuerpo de un método del objeto de puertos (`async nombre(` hasta el siguiente método de primer nivel). */
function metodo(src: string, nombre: string): string {
  const i = src.indexOf(`async ${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre} en ${DOC_BD}`)
  const j = src.slice(i + 1).search(/\n    (?:async )?\w+\(/)
  return src.slice(i, j < 0 ? undefined : i + 1 + j)
}

test('🚨 documentos-bd: parte de accesosPatrimonio, no está exento y TODA consulta lleva el titular resuelto', () => {
  const src = leer(DOC_BD)
  assert.ok(!CRON_SIN_SESION.has(DOC_BD))
  assert.match(src, /\baccesosPatrimonio\(identidadId\)/)
  assert.match(src, /getIdentidad\(\)\)\?\.id === identidadId/, 'defensa en profundidad: la sesión es la de identidadId')
  for (const m of ['ownerDelTitular', 'guardar', 'listar', 'leer', 'borrar']) {
    assert.match(metodo(src, m), /titularDe\(clienteId\)/, `${m}: el titular se resuelve desde la ficha autorizada`)
  }
  for (const m of ['listar', 'leer', 'borrar']) {
    assert.match(metodo(src, m), /titularId: t\.id/, `${m}: el documento se busca DENTRO del titular (id ajeno = 0 filas = 404)`)
  }
  assert.match(metodo(src, 'ownerDelTitular'), /titularId: t\.id/, 'el owner se busca dentro del titular')
  assert.match(metodo(src, 'borrar'), /borradoEn: null/, 'solo se sella un documento vivo')
})

test('🚨 documentos-bd: las LISTAS no leen el fichero (solo la descarga) y nada borra filas', () => {
  const src = leer(DOC_BD)
  assert.doesNotMatch(metodo(src, 'listar'), /contenido/, 'la lista no puede traer los bytes de 50 ficheros')
  assert.match(src, /const SELECT_META = \{[^}]*\}/)
  assert.doesNotMatch(src.match(/const SELECT_META = \{[^}]*\}/)![0], /contenido/)
  assert.match(metodo(src, 'leer'), /contenido: true/, 'la descarga sí lee el fichero')
  assert.doesNotMatch(src, /\.delete\(|\.deleteMany\(|\$queryRawUnsafe|\$executeRawUnsafe/, 'sin DELETE: borrar es sellar borrado_en')
})

test('🚨 documentos: la descarga es attachment + nosniff + no-store, y pasa por responderDescargaDocumento', () => {
  const src = leer(DOC_RUTA_ID)
  assert.match(src, /responderDescargaDocumento\(/)
  assert.match(src, /'content-disposition': disposicion\(/)
  assert.match(src, /return `attachment; filename=/, 'siempre attachment, nunca inline')
  assert.match(src, /'x-content-type-options': 'nosniff'/)
  assert.match(src, /'cache-control': 'private, no-store'/)
  assert.match(src, /responderBorrarDocumento\(/)
  assert.doesNotMatch(src, /inline/i)
  // El titular y la identidad salen de la sesión/acceso: la ruta no consulta nada por sí misma.
  assert.doesNotMatch(src, /prisma/)
  assert.doesNotMatch(leer(DOC_RUTA), /prisma/)
})

test('🚨 documentos (lógica pura): el rol y la carpeta salen del documento REAL, y ajeno = la misma 404', () => {
  const src = leer('apps/asegura-portal/lib/patrimonio/documentos-api.ts')
  const desc = src.slice(src.indexOf('export async function responderDescargaDocumento'), src.indexOf('export async function responderBorrarDocumento'))
  assert.match(desc, /if \(!accesos\.has\(c\.titular\)\) return NO_ENCONTRADO/)
  assert.match(desc, /puedeDocumento\(accesos\.get\(c\.titular\), 'ver', d\.owner\.tipo, d\.meta\.carpeta\)/)
  assert.doesNotMatch(src, /status:\s*403/, 'ajeno es 404, nunca 403')
})

// ─── Enlace inmueble ↔ póliza (24/10/2026, P11): el enlace no puede ser la puerta trasera a la póliza de otro ─────
const SEG_BD = 'apps/asegura-portal/lib/patrimonio/seguros-inmueble-bd.ts'
const SEG_API = 'apps/asegura-portal/lib/patrimonio/seguros-inmueble-api.ts'
const SEG_RUTA = 'apps/asegura-portal/app/api/patrimonio/inmuebles/[id]/seguros/route.ts'

test('🚨 enlaces: solo seguros-inmueble-bd toca la tabla puente, y siempre tras autorizar el inmueble', () => {
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  const tocan = ficheros.filter((f) => /prisma\s*\.\s*portalPatrimonioInmueblePoliza\b|tx\s*\.\s*portalPatrimonioInmueblePoliza\b/.test(leer(f)))
  assert.deepEqual(tocan, [SEG_BD], 'la tabla puente tiene UNA puerta: lib/patrimonio/seguros-inmueble-bd.ts')
  const src = leer(SEG_BD)
  assert.ok(!CRON_SIN_SESION.has(SEG_BD))
  assert.match(src, /\baccesosPatrimonio\(identidadId\)/)
  assert.match(src, /titular: \{ clienteId: \{ in: \[\.\.\.acc\.keys\(\)\] \}, archivadoEn: null \}/, 'el inmueble se busca DENTRO de los titulares autorizados')
  // Cada operación (leer enlaces, crear, archivar, declarar) vuelve a autorizar el inmueble antes de tocarlo.
  assert.ok((src.match(/await inmuebleAutorizadoId\(/g) ?? []).length >= 5, 'cada puerto re-autoriza el inmueble')
  const ops = [...src.matchAll(/portalPatrimonioInmueblePoliza\.(findMany|updateMany|create)\(\{\s*(where|data): \{ ([^}]*)/g)]
  assert.ok(ops.length >= 4, 'brazo de control: el detector tiene que ver las 4 operaciones')
  for (const m of ops) assert.match(m[3], /inmuebleId/, `${m[1]} sin inmuebleId`)
  assert.doesNotMatch(src, /\.delete\(|\.deleteMany\(|\$queryRaw|\$executeRaw/, 'sin DELETE ni SQL crudo')
})

test('🚨 enlaces: lo que «ve» la identidad sale de carteraDeIdentidad y de SUS declaradas; nunca prisma.poliza por un id', () => {
  const src = leer(SEG_BD)
  assert.match(src, /carteraDeIdentidad\(identidadId\)/)
  assert.doesNotMatch(src, /prisma\s*\.\s*(poliza|cliente)\b/, 'ni pólizas ni fichas leídas a mano: la cartera ya viene filtrada por nivel')
  assert.match(src, /portalPolizaDeclarada\.findMany\(\{\s*where: \{ identidadId, \.\.\.DECLARADA_NO_ELIMINADA \}/)
  assert.match(src, /ubicacion: p\.bien\.ubicacion/, 'la dirección para casar es la que ESTE nivel ve (describirBien)')
  // La API busca la póliza del cuerpo DENTRO de su lista (tipo incluido), no en la unión ni por id suelto.
  const api = leer(SEG_API)
  assert.match(api, /const fuente = tipo === 'cartera' \? vis\.cartera : vis\.declaradas/)
  assert.match(api, /const poliza = fuente\.find\(\(v\) => v\.id === c\.polizaId\)/)
  assert.match(api, /if \(inm === null \|\| !puede\(inm\.nivel, 'enlazar_seguro'\)\) return NO_ENCONTRADO/)
  assert.match(api, /vigente: v \? v\.vigente : null/, 'póliza que no ves: vigencia «no se sabe», ni sí ni no')
  assert.match(api, /poliza: v \? pintable\(v\) : null/, 'póliza que no ves: sin detalle')
  assert.doesNotMatch(api, /numeroPoliza|prima/i, 'el nº de póliza y la prima no salen por el inmueble')
  assert.doesNotMatch(api, /status:\s*403/)
  assert.doesNotMatch(leer(SEG_RUTA), /prisma/)
})

// ─── Calendario y push del patrimonio (24/10/2026, P13) ────────────────────────────────────────────────────────────
const CAL_BD = 'apps/asegura-portal/lib/patrimonio/calendario-bd.ts'
const PUSH_BD = 'apps/asegura-portal/lib/patrimonio/avisos-push-bd.ts'

test('🚨 calendario-bd: calendarioDeIdentidad parte de accesosPatrimonio y calendarioDeClientes solo tiene DOS llamadores', () => {
  const src = leer(CAL_BD)
  assert.ok(!CRON_SIN_SESION.has(CAL_BD))
  assert.match(cuerpo(src, 'calendarioDeIdentidad'), /accesosPatrimonio\(identidadId\)/)
  assert.match(src, /titular: \{ clienteId: \{ in: \[\.\.\.clientesIds\] \}, archivadoEn: null \}/, 'el inmueble se busca DENTRO de los titulares pasados')
  // Obligaciones y contratos cuelgan SOLO de los inmuebles ya acotados.
  assert.match(src, /inmuebleId: \{ in: ids \}, archivadoEn: null/)
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  const llaman = ficheros.filter((f) => f !== CAL_BD && /\bcalendarioDeClientes\(/.test(leer(f)))
  assert.deepEqual(llaman, [PUSH_BD], 'calendarioDeClientes lee por una lista de fichas: solo el push, que las acota por vínculo')
})

test('🚨 push del patrimonio: solo fichas PROPIAS que operan, sin vista de corredor, vivas; texto sin alias; sello solo si salió', () => {
  const src = leer(PUSH_BD)
  assert.match(src, /portalVinculo\.findMany\(\{ where: \{ identidadId \}/)
  assert.match(src, /v\.origen !== 'corredor' && puedeAutorizar\(nivelDe\(v\.nivel\)\)/)
  assert.match(src, /mergedIntoClienteId: null, activo: true/)
  assert.match(src, /calendarioDeClientes\(vivas\.map/)
  // Ni Dueño ni autorizaciones: lo dudoso cae fuera.
  assert.doesNotMatch(src, /empresasDeFichas|portalAutorizacion|ALCANCE_PATRIMONIO/)
  assert.match(src, /if \(algunaOk\) \{\s*await prisma\.portalAvisoLeido\.createMany/)
  assert.match(src, /identidadId, clave: \{ startsWith: PREFIJO_PUSH_PATRIMONIO \}/)
  assert.match(src, /motivoSinPush\(/)
  assert.match(leer('apps/asegura-portal/app/api/cron/avisos-push/route.ts'), /avisarPatrimonioPush\(vapid, hoy\)/)
})
