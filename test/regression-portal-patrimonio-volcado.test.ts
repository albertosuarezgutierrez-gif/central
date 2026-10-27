// Guardián del VOLCADO INICIAL SEMIAUTOMÁTICO del patrimonio (27/10/2026, hoja de ruta §7 punto 4). `node --test`.
//
// El comportamiento lo prueban `volcado.test.ts` (reglas puras), `volcado-api.test.ts` (nada sin confirmar, 404 nunca 403,
// sin cruzar titulares), `volcado-tx.test.ts` (orden y titular de cada `create`) y `xlsx-lectura.test.ts` (lector seguro).
// Esto vigila lo que esos tests no pueden ver en el adaptador con BD y en las rutas:
//   1. NADA SE ESCRIBE SIN CONFIRMAR: el único sitio que crea inmuebles/contratos/gastos fijos es `escribirVolcadoTx`, y solo
//      lo llama `confirmar`, dentro de UNA transacción y DESPUÉS del cierre condicionado a que siguiera abierto;
//   2. la escritura no cruza titulares: el titular sale de la fila del VOLCADO (buscada con la identidad y los accesos), nunca
//      del cuerpo; todo `create` de `volcado-tx.ts` lleva `titularId: x.titularId`;
//   3. toda consulta del volcado lleva la identidad y, las que vienen de una petición, el titular dentro de los accesos;
//   4. la IA se llama DESPUÉS de reservar el cupo (atómico, por titular) y las facturas comparten ese cupo;
//   5. rutas: sin prisma, identidad de la cookie, content-length (411/413) antes de leer el cuerpo;
//   6. del inquilino no viaja ni se guarda más que nombre y tipo.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const BD = 'apps/asegura-portal/lib/patrimonio/volcado-bd.ts'
const TX = 'apps/asegura-portal/lib/patrimonio/volcado-tx.ts'
const API = 'apps/asegura-portal/lib/patrimonio/volcado-api.ts'
const IA = 'apps/asegura-portal/lib/patrimonio/extraer-volcado.ts'
const RUTAS = [
  'apps/asegura-portal/app/api/patrimonio/volcados/route.ts',
  'apps/asegura-portal/app/api/patrimonio/volcados/[id]/route.ts',
  'apps/asegura-portal/app/api/patrimonio/volcados/[id]/confirmar/route.ts',
  'apps/asegura-portal/app/api/patrimonio/volcados/[id]/descartar/route.ts',
]

function metodo(src: string, nombre: string): string {
  const i = src.indexOf(`async ${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.slice(i + 1).search(/\n {4}(async )?[a-zA-Z]+[:(]/)
  return src.slice(i, j < 0 ? undefined : i + 1 + j)
}

/** Ficheros del portal (sin tests) que llaman a la escritura del volcado. */
export function quienEscribe(ficheros: ReadonlyArray<{ f: string; src: string }>): string[] {
  return ficheros.filter(({ src }) => /\bescribirVolcadoTx\(/.test(src)).map(({ f }) => f)
}

test('el detector de «quién escribe el volcado» muerde (brazos sintéticos)', () => {
  assert.deepEqual(quienEscribe([{ f: 'x.ts', src: 'await escribirVolcadoTx(tx, {})' }]), ['x.ts'])
  assert.deepEqual(quienEscribe([{ f: 'y.ts', src: 'await reservarVolcadoTx(tx, {})' }]), [])
})

test('🚨 nada sin confirmar: solo volcado-bd llama a escribirVolcadoTx, y solo desde confirmar, tras el cierre y en UNA transacción', () => {
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== TX)
    .map((f) => ({ f, src: leer(f) }))
  assert.deepEqual(quienEscribe(ficheros), [BD])
  const src = leer(BD)
  assert.equal((src.match(/escribirVolcadoTx\(/g) ?? []).length, 1, 'una sola llamada')
  const conf = metodo(src, 'confirmar')
  assert.match(conf, /prisma\.\$transaction\(/)
  const cierre = conf.indexOf("estado: 'confirmada'")
  const escribe = conf.indexOf('escribirVolcadoTx(')
  assert.ok(cierre > 0 && escribe > cierre, 'el cierre va ANTES de crear nada')
  assert.match(conf.slice(0, escribe), /cierre\.count === 0\) return/, 'si el cierre no tocó ninguna fila, no se crea nada')
  assert.match(conf, /contextoDe\(tx, v\.titularId\)/, 'se evalúa contra lo que hay DENTRO de la transacción')
  assert.match(conf, /titularId: v\.titularId/, 'el titular es el de la fila del volcado, no el del cuerpo')
  // La subida no toca el patrimonio.
  for (const m of ['reservar', 'guardarPropuesta']) {
    assert.doesNotMatch(metodo(src, m), /portalPatrimonio(Inmueble|Contrato|PlantillaGasto|Gasto)\b|escribirVolcadoTx/, `${m} no escribe patrimonio`)
  }
  // Y la API exige la confirmación explícita antes de llamar al puerto.
  const api = leer(API)
  const i = api.indexOf('export async function responderConfirmarVolcado(')
  const cuerpo = api.slice(i, api.indexOf('export async function', i + 10))
  assert.ok(cuerpo.indexOf('b.confirmar !== true') < cuerpo.indexOf('p.confirmar('), 'sin confirmar: true no se llama al puerto')
  assert.ok(cuerpo.indexOf('await dentro(p, id)') < cuerpo.indexOf('p.confirmar('))
})

test('🚨 volcado-tx: todo create lleva el titular del volcado y solo crea las «nueva»', () => {
  const src = leer(TX)
  const i = src.indexOf('export async function escribirVolcadoTx(')
  const cuerpo = src.slice(i)
  const creates = [...cuerpo.matchAll(/\.create\(\{\s*data: (\{[\s\S]*?\n {4,6}\}|datos)/g)]
  assert.ok(creates.length >= 4, `esperaba ≥4 create, hay ${creates.length}`)
  for (const m of creates) {
    if (m[1] === 'datos') { assert.match(cuerpo, /const datos = \{\s*titularId: x\.titularId,/); continue }
    assert.match(m[1], /titularId: x\.titularId/, `create sin el titular del volcado:\n${m[0]}`)
  }
  assert.ok((cuerpo.match(/estado !== 'nueva'\) continue|ev\.estado === 'nueva'/g) ?? []).length >= 3, 'solo lo «nueva»')
  assert.match(cuerpo, /titularId: x\.titularId, uso: 'edificio', inmueblePadreId: null, archivadoEn: null/, 'el edificio existente se busca dentro del titular')
  assert.doesNotMatch(src, /\.delete\(|\.deleteMany\(|\$queryRawUnsafe|\$executeRawUnsafe/)
})

test('🚨 volcado-bd: parte de accesosPatrimonio y TODA consulta del volcado lleva la identidad (y los accesos si viene de la petición)', () => {
  const src = leer(BD)
  assert.match(src, /accesosPatrimonio\(identidadId\)/)
  assert.match(src, /sesion\.id !== identidadId \? new Map\(\)/, 'defensa en profundidad: la sesión es la de identidadId')
  const consultas = [...src.matchAll(/portalPatrimonioImportacion\.(findFirst|updateMany|count)\(\{([\s\S]*?)\n\s*\}\)/g)]
  assert.ok(consultas.length >= 7, `esperaba ≥7 consultas, hay ${consultas.length}`)
  for (const m of consultas) assert.match(m[2], /identidadId/, `consulta sin la identidad:\n${m[0]}`)
  for (const nombre of ['ver', 'guardarPropuesta', 'descartar', 'confirmar']) {
    assert.match(metodo(src, nombre), /titular: \{ clienteId: \{ in: acc \}, archivadoEn: null \}/, `${nombre}: titular fuera de los accesos`)
  }
  assert.match(metodo(src, 'reservar'), /titularDe\(clienteId, true\)/, 'el titular se resuelve desde la ficha AUTORIZADA')
  assert.doesNotMatch(src, /\.delete\(|\.deleteMany\(|\$queryRawUnsafe|\$executeRawUnsafe/)
})

test('🧮 cupo: la IA va después de reservar (atómico y por titular) y las facturas cuentan los volcados en el mismo cupo', () => {
  const api = leer(API)
  const i = api.indexOf('export async function responderSubirVolcado(')
  const cuerpo = api.slice(i, api.indexOf('export async function', i + 10))
  assert.ok(cuerpo.indexOf('fuenteDe(x.bytes)') < cuerpo.indexOf('p.reservar('), 'los bytes antes de gastar nada')
  assert.ok(cuerpo.indexOf('p.reservar(') < cuerpo.indexOf('p.leer('), 'el cupo se reserva ANTES de la IA')
  assert.match(cuerpo, /cupoMensualIa\(valor\)\.max/)
  const tx = leer(TX)
  const j = tx.indexOf('export async function reservarVolcadoTx(')
  const r = tx.slice(j, tx.indexOf('export', j + 10))
  assert.ok(r.indexOf('pg_advisory_xact_lock') < r.indexOf('.count(') && r.indexOf('contarVolcadosMesTx(') < r.indexOf('.create('), 'bloqueo → recuentos → inserción')
  assert.match(r, /claveCupoIa\(x\.titularId\)/)
  const ftx = leer('apps/asegura-portal/lib/patrimonio/facturas-tx.ts')
  assert.match(ftx, /portal-cupo-ia:\$\{x\.titularId\}/, 'la factura toma el MISMO bloqueo del cupo')
  assert.match(ftx, /quedaCupoIa\(mes \+ \(await x\.otrasLecturasMes\(tx\)\), x\.cupoMes\)/)
  assert.match(leer('apps/asegura-portal/lib/patrimonio/facturas-bd.ts'), /otrasLecturasMes: \(t2\) => contarVolcadosMesTx\(/)
  assert.match(leer('packages/module-patrimonio/src/volcado.ts'), /MAX_ELEMENTOS_VOLCADO = 500/)
})

test('🚨 inquilino: solo nombre y tipo, por el puente, y la IA no pide identificadores', () => {
  const bd = leer(BD)
  assert.match(metodo(bd, 'altaInquilino'), /nif: null, email: null, telefono: null/)
  const ia = readFileSync(join(ROOT, IA), 'utf8')
  assert.match(ia, /NUNCA copies DNI, NIF, NIE, teléfonos, correos, IBAN/)
  assert.doesNotMatch(sinComentarios(ia), /"nif"|"telefono"|"email"|"iban"/i, 'la forma pedida a la IA no tiene campos de identificadores')
  assert.match(leer(API), /leerHojaVolcado/, 'la hoja se lee tirando las columnas de identificadores ANTES de la IA')
})

test('rutas: sin prisma, identidad de la cookie; la subida exige content-length (411) acotado (413) antes de leer el cuerpo', () => {
  for (const r of RUTAS) {
    const src = leer(r)
    assert.doesNotMatch(src, /prisma/, r)
    assert.match(src, /requireIdentidad\(\)/, r)
    assert.doesNotMatch(src, /status:\s*403[^]*?no_encontrado/, r)
  }
  const subida = leer(RUTAS[0])
  const cab = subida.indexOf("headers.get('content-length')")
  const lee = subida.indexOf('req.formData()')
  assert.ok(cab > 0 && cab < lee)
  assert.match(subida.slice(cab, lee), /status: 411/)
  assert.match(subida.slice(cab, lee), /MAX_BYTES_VOLCADO[\s\S]*status: 413/)
  assert.match(subida, /rateLimit\(`patrimonio-volcado:\$\{identidad\.id\}`/, 'el tope es por identidad, nunca por IP')
})
