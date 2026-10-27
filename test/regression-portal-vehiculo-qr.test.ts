// Guardián del QR por VEHÍCULO (27/10/2026, F1). `node --test` (gate en CI vía `pnpm test:guardia`).
//
// Spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §7 (guardianes de F1: 1, 2, 4-dueño, 5, 6, 7, 9).
// Las reglas puras tienen su test en `packages/module-seguros-portal/src/vehiculo-publico.test.ts` (allow-list,
// semáforos, `null` = «no se sabe») y `vehiculo-acceso.test.ts` (quién gestiona, dos mundos). Esto vigila que los
// ficheros con BD y la página las sigan usando. Los comentarios se quitan antes de mirar: un cepo de texto que se
// satisface con un comentario no cepa nada.
//
// Lo que protege: un token SIN sesión pegado en una guantera. Si alguna de estas promesas se rompe, nada falla —
// la página sigue saliendo— y lo que cambia es cuánto enseña o a quién.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const crudo = (f: string) => readFileSync(join(ROOT, f), 'utf8')
// Primero las líneas `//` (un `/api/vehiculos/*` dentro de un comentario de línea abriría un falso bloque) y
// después los bloques `/* … */` y `{/* … */}` del JSX.
const leer = (f: string) =>
  crudo(f)
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')

const APP = 'apps/asegura-portal'
const PAGINA = `${APP}/app/v/[token]/page.tsx`
const TOKEN = `${APP}/lib/vehiculo-token.ts`
const PUBLICO = `${APP}/lib/vehiculo-publico.ts`
const ACCESO = `${APP}/lib/vehiculo-acceso.ts`
const QR = `${APP}/lib/vehiculo-qr.ts`
const FLOTA = `${APP}/lib/flota.ts`
const SQL = `${APP}/prisma/sql/2026-10-27_portal_vehiculo_qr.sql`

/** El cuerpo de una función exportada (hasta la siguiente `export` de primer nivel). */
function cuerpo(src: string, nombre: string): string {
  const i = src.indexOf(`export async function ${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.indexOf('\nexport ', i + 1)
  return src.slice(i, j < 0 ? undefined : j)
}

// ─── §7-1 y §7-5: la página pública solo pinta la allow-list ─────────────────

test('🚨 §7-1: la página pública recibe SOLO la vista de la allow-list; no lee cartera, flota ni Prisma', () => {
  const src = leer(PAGINA)
  assert.match(src, /await vistaPublicaPorToken\(token\)/)
  for (const prohibido of [/cartera-lectura/, /@\/lib\/flota/, /@\/lib\/db/, /prisma/, /carteraDeIdentidad/, /vehiculoPorToken/]) {
    assert.doesNotMatch(src, prohibido, `la página pública no puede leer datos por su cuenta (${prohibido})`)
  }
  // Ningún dato prohibido por nombre (spec §3.2), ni siquiera «para mañana».
  assert.doesNotMatch(src, /\b(prima|recibos|siniestros|dni|nif|iban|direccion|ubicacion|fechaVencimiento|fechaMatriculacion|autorNombre|apellidos)\b/i)
  // Y la lectura arma la vista SIEMPRE con la pura.
  assert.match(leer(PUBLICO), /return \{ qrId: a\.qrId, vista: vistaPublicaVehiculo\(entrada, interruptores\) \}/)
})

test('🚨 la página pública NO abre sesión ni toca cookies (el token dice QUÉ vehículo, no quién eres)', () => {
  const src = leer(PAGINA)
  for (const p of ['crearSesion', 'cookies(', 'Set-Cookie', 'getIdentidad', 'requireIdentidad']) {
    assert.ok(!src.includes(p), `la página del QR no puede tocar la sesión (${p})`)
  }
  assert.match(src, /robots: \{ index: false, follow: false \}/)
  const conf = leer(`${APP}/next.config.ts`)
  const i = conf.indexOf("source: '/v/:path*'")
  assert.ok(i > conf.indexOf("source: '/:path*'"), 'la regla de /v va DESPUÉS de la general (gana la última)')
  assert.match(conf.slice(i), /'Referrer-Policy', value: 'no-referrer'/)
  assert.match(conf.slice(i), /'Cache-Control', value: 'no-store'/)
})

test('los teléfonos de la página: un WhatsApp nunca con `tel:`, sin «24 h», y sin dato → «pídenoslo»', () => {
  const src = leer(PAGINA)
  const rama = src.slice(src.indexOf("v.tipo === 'whatsapp' ?"), src.indexOf(') : (', src.indexOf("v.tipo === 'whatsapp' ?")))
  assert.ok(rama.length > 0, 'no encuentro la rama del WhatsApp')
  assert.doesNotMatch(rama, /href=\{?`?tel:/)
  assert.match(rama, /href=\{v\.enlace\}/)
  assert.doesNotMatch(src, /\b24\s*[hH](oras)?\b|todo el d[ií]a/)
  assert.match(src, /if \(t === null\)[\s\S]{0,200}Pídenoslo/)
  // «No lo sabemos» nunca en verde.
  assert.match(src, /no_sabemos: 'chip aviso'/)
})

// ─── §7-2: el token ──────────────────────────────────────────────────────────

test('🚨 §7-2: el token se normaliza ANTES de la BD, se busca HASHEADO y anulado/inexistente dan el MISMO 404', () => {
  const f = cuerpo(leer(TOKEN), 'vehiculoPorToken')
  const norm = f.indexOf('const token = normalizarTokenHoja(tokenCrudo)')
  const corte = f.indexOf('if (token === null) return null')
  const bd = f.indexOf('prisma.')
  assert.ok(norm >= 0 && corte > norm && bd > corte, 'mal formado → null SIN tocar la BD')
  assert.match(f, /where: \{ tokenHash: hashCanal\(token\) \}/)
  assert.doesNotMatch(leer(TOKEN), /tokenHash:\s*token\b/, 'una tabla de etiquetas legibles es una tabla de llaves')
  // Una sola consulta por el hash; el anulado se descarta en código, no con otra consulta distinta.
  assert.match(f, /if \(!q \|\| q\.anuladoEn !== null \|\| q\.bien\.tipo !== 'vehiculo'\) return null/)
  // La página: UN solo camino de salida para todos los casos.
  const pagina = leer(PAGINA)
  assert.match(pagina, /if \(r === null\) notFound\(\)/)
  assert.equal((pagina.match(/notFound\(\)/g) ?? []).length, 1, 'un solo 404, idéntico para todos los casos')
})

test('el token se crea con los mismos bytes que la hoja y se guarda hasheado; la etiqueta se anula con UPDATE', () => {
  const src = leer(QR)
  assert.match(src, /randomBytes\(BYTES_TOKEN_HOJA\)/)
  assert.match(src, /tokenHash: hashCanal\(token\)/)
  assert.doesNotMatch(src, /portalVehiculoQr\.delete|portalVehiculoPublico\.delete/, 'anular no borra')
  // Reimprimir anula la anterior en la MISMA transacción.
  const crear = cuerpo(src, 'crearQrVehiculo')
  assert.match(crear, /\$transaction\(async \(tx\) => \{\s*await tx\.portalVehiculoQr\.updateMany\(\{\s*where: \{ bienId: g\.bienId, anuladoEn: null \}/)
  assert.match(cuerpo(src, 'anularQrVehiculo'), /where: \{ id: qrId\.trim\(\), bienId: g\.bienId, anuladoEn: null \}/)
})

// ─── §7-6: aislamiento ───────────────────────────────────────────────────────

test('🚨 §7-6: `vehiculoPorToken` es la ÚNICA lectura sin identidad, y su fichero no hace nada más', () => {
  const guardian = crudo('test/regression-portal-aislamiento.test.ts')
  assert.match(guardian, /'apps\/asegura-portal\/lib\/vehiculo-token\.ts'/, 'vehiculo-token.ts tiene que estar en EXENTOS, como decisión explícita')
  const src = leer(TOKEN)
  const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1])
  assert.deepEqual(exportadas.sort(), ['sellarUsoVehiculo', 'vehiculoPorToken'], 'nada más puede vivir en el fichero exento')
  // Sin cartera: aquí no se lee nada de la persona.
  assert.doesNotMatch(src, /prisma\s*\.\s*(cliente|poliza|polizaRecibo|siniestro|portalVinculo|portalIdentidad)\b/)
  // Ningún otro fichero del portal llama a `vehiculoPorToken` salvo la lectura pública.
  const usos = execFileSync('git', ['grep', '-l', '--untracked', 'vehiculoPorToken(', '--', `${APP}/*.ts`, `${APP}/*.tsx`], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /vehiculoPorToken\(/.test(leer(f)))
    .sort()
  assert.deepEqual(usos, [TOKEN, PUBLICO].sort())
})

test('🚨 la lectura de la flota SIN sesión solo se usa desde la lectura pública, con la empresa del bien del token', () => {
  const usos = execFileSync('git', ['grep', '-n', '--untracked', 'vehiculoDeEmpresaParaQr(', '--', APP], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((l) => !l.startsWith(`${FLOTA}:`))
    // Solo código: una mención en un comentario no es una llamada.
    .filter((l) => !/^[^:]+:\d+:\s*(\/\/|\*)/.test(l))
  assert.equal(usos.length, 1, `vehiculoDeEmpresaParaQr solo se llama desde la lectura pública:\n${usos.join('\n')}`)
  assert.ok(usos[0]!.startsWith(`${PUBLICO}:`))
  const pub = leer(PUBLICO)
  assert.match(pub, /entradaDeEmpresa\(a, a\.bien\.clienteId, hoy\)/, 'la empresa sale del bien que abrió el token')
  assert.match(pub, /entradaDePersona\(a, a\.bien\.identidadId, hoy\)/, 'la persona, también')
  assert.doesNotMatch(pub, /prisma\s*\./, 'la lectura pública no hace consultas propias')
})

// ─── §7-4 (dueño) y §7-7: toda ruta pasa por la frontera ─────────────────────

test('🚨 §7-4: `puedeGestionarVehiculo` sale de la COOKIE y busca el bien con el dueño DENTRO del where', () => {
  const f = cuerpo(leer(ACCESO), 'puedeGestionarVehiculo')
  assert.match(f, /if \(!\(await esLaSesion\(identidadId\)\)\) return null/)
  assert.match(f, /if \(!esUuid\(bienId\)\) return null/)
  assert.match(f, /OR: \[\{ identidadId \}, \.\.\.\(empresas\.length > 0 \? \[\{ clienteId: \{ in: empresas \} \}\] : \[\]\)\]/)
  assert.match(f, /resolverGestionVehiculo\(/)
  assert.doesNotMatch(f, /findUnique/, 'un findUnique deja el dueño fuera del where')
  assert.match(leer(ACCESO), /async function esLaSesion[\s\S]{0,200}sesion\.id === identidadId/)
})

test('🚨 §7-4: el dueño de las filas nuevas sale del bien resuelto, NUNCA del cuerpo', () => {
  const src = leer(QR)
  assert.match(cuerpo(src, 'guardarPublicoVehiculo'), /guardarInterruptores\(identidadId, ambitoDe\(g\), g\.bienId, valores\)/)
  assert.match(src, /const dueno = columnasDueno\(ambito\)/)
  // Ninguna función de escritura recibe un `bienId` o un dueño sueltos: todas reciben la gestión resuelta.
  for (const n of ['crearQrVehiculo', 'anularQrVehiculo', 'guardarPublicoVehiculo']) {
    assert.match(cuerpo(src, n), new RegExp(`${n}\\(identidadId: string, g: GestionVehiculo`), `${n} recibe la gestión resuelta`)
  }
  assert.match(cuerpo(src, 'guardarPublicoDefecto'), /ambito: AmbitoDueno/)
})

test('🚨 §7-7: toda ruta de /api/vehiculos/* pasa por la frontera ANTES de tocar nada', () => {
  const rutas = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', `${APP}/app/api/vehiculos`], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('/route.ts'))
  assert.ok(rutas.length >= 6, `el cepo no ve las rutas (${rutas.length})`)
  const PUERTAS = /(puedeGestionarVehiculos?|puedeGestionarDefecto|accesoAVehiculo)\(identidad\.id,/
  for (const f of rutas) {
    const src = leer(f)
    assert.match(src, /await requireIdentidad\(\)/, `${f}: la identidad sale de la cookie`)
    assert.match(src, PUERTAS, `${f}: no pasa por puedeGestionarVehiculo / puedeGestionarDefecto`)
    assert.doesNotMatch(src, /prisma|@\/lib\/db/, `${f}: una ruta no consulta la BD por su cuenta`)
    // Cada acción del dueño va DESPUÉS de la frontera.
    const puerta = src.search(PUERTAS)
    for (const accion of ['crearQrVehiculo(', 'anularQrVehiculo(', 'guardarPublicoVehiculo(', 'guardarPublicoDefecto(']) {
      const i = src.indexOf(accion, src.indexOf('export async function'))
      if (i >= 0) assert.ok(i > puerta, `${f}: ${accion} antes de la frontera`)
    }
    // 404 directo, o el de la flota (`ESTADO_HTTP_FLOTA.no_encontrada` = 404, que cubre «no existe» y «no es tuya»).
    assert.match(src, /status: 404|ESTADO_HTTP_FLOTA\[r\.error\]/, `${f}: lo que no es tuyo es 404, nunca 403`)
  }
})

// ─── §7-6 y §7-9: la BD ──────────────────────────────────────────────────────

test('🚨 §7-6: GRANTs al rol del portal SIN DELETE y REVOKE al CRM en las tablas de F1', () => {
  const sql = leer(SQL).replace(/--.*$/gm, '')
  for (const t of ['portal_vehiculo_qr', 'portal_vehiculo_publico']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS seguros\\.${t}\\b`))
    assert.match(sql, new RegExp(`REVOKE ALL ON seguros\\.${t} FROM crm_seguros`, 'i'))
    assert.match(sql, new RegExp(`GRANT SELECT \\([^)]*\\)\\s*ON seguros\\.${t} TO prisma_asegura_portal`))
  }
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE[^;]*portal_vehiculo/i, 'anular y dar de baja son UPDATE: el rol no borra')
  assert.doesNotMatch(sql, /GRANT (SELECT, )?INSERT, UPDATE[^;(]*ON seguros\.portal_vehiculo/i, 'GRANT por columnas, no de tabla entera')
  // F2 no va aquí.
  assert.doesNotMatch(sql, /portal_vehiculo_acceso|portal_vehiculo_nota/)
})

test('🚨 §7-9: dueño persona XOR empresa (CHECK), cascada desde el bien y una etiqueta viva por vehículo', () => {
  const sql = leer(SQL).replace(/--.*$/gm, '')
  assert.match(sql, /CONSTRAINT portal_vehiculo_publico_un_dueno CHECK \(num_nonnulls\(dueno_identidad_id, cliente_id\) = 1\)/)
  // Suprimir a una persona (RGPD) no puede quedar bloqueado por su propio QR.
  assert.match(sql, /bien_id\s+uuid NOT NULL REFERENCES seguros\.portal_bien \(id\) ON DELETE CASCADE/)
  assert.match(sql, /dueno_identidad_id\s+uuid REFERENCES seguros\.portal_identidad \(id\) ON DELETE CASCADE/)
  assert.match(sql, /idx_portal_vehiculo_qr_un_vivo\s+ON seguros\.portal_vehiculo_qr \(bien_id\) WHERE anulado_en IS NULL/)
  assert.match(sql, /portal_bien_persona_vehiculo CHECK \(\s*identidad_id IS NULL OR tipo <> 'vehiculo' OR matricula IS NULL OR matricula ~ '\^\[A-Z0-9\]\{4,\}\$'/)
  assert.match(sql, /idx_portal_bien_persona_matricula\s+ON seguros\.portal_bien \(identidad_id, matricula\)/)
  // Y el schema declara la cascada igual que la BD.
  const schema = crudo(`${APP}/prisma/schema.prisma`)
  assert.match(schema, /model PortalVehiculoQr \{[\s\S]*?bien PortalBien @relation\(fields: \[bienId\], references: \[id\], onDelete: Cascade\)/)
})

test('🚨 §7-9: `asegurarVehiculoDePoliza` parte de las PROPIAS de la sesión, rechaza empresa y sin matrícula, y es idempotente', () => {
  const f = cuerpo(leer(ACCESO), 'asegurarVehiculoDePoliza')
  assert.match(f, /if \(!\(await esLaSesion\(identidadId\)\)\) return \{ ok: false, error: 'no_encontrada'/)
  assert.match(f, /polizaPropiaDePersona\(await carteraDeIdentidad\(identidadId\), datos\.polizaId\)/)
  assert.match(leer(ACCESO), /for \(const t of cartera\.propias\)/, 'solo las PROPIAS: ni autorizadas ni intervinientes')
  assert.doesNotMatch(leer(ACCESO), /cartera\.(autorizadas|intervinientes)/)
  assert.match(f, /error: 'es_de_empresa'/)
  assert.match(f, /if \(clave === null\) \{\s*return \{ ok: false, error: 'sin_matricula'/)
  // La matrícula de la póliza MANDA; la del cuerpo solo si la compañía no la informa.
  assert.match(f, /const clave = deLaPoliza \?\? claveVehiculo\(/)
  // Idempotente: se busca antes de crear y, si dos pestañas chocan, el índice decide y se relee.
  assert.ok(f.indexOf('const existente = await leer()') < f.indexOf('prisma.portalBien.create('))
  assert.match(f, /e\.code === 'P2002'\) \{\s*const otra = await leer\(\)/)
  assert.match(f, /where: \{ identidadId, tipo: 'vehiculo', matricula: clave \}/)
})

test('la flota: la ficha de empresa se crea por la empresa AUTORIZADA y el lote no inventa matrículas', () => {
  const f = cuerpo(leer(FLOTA), 'asegurarVehiculosDeFlota')
  assert.match(f, /const flota = await flotaDeEmpresa\(datos\.identidadId, datos\.empresaId\)/)
  assert.match(f, /if \(!puedeEditarVehiculo\(flota\.papel\)\)/)
  assert.match(f, /const empresaId = flota\.empresa\.id/)
  assert.match(f, /sinMatricula: elegidos\.length - conMatricula\.length/)
  // Reimprimir en lote anula las pegadas: solo con `reimprimir: true` explícito.
  const lote = leer(`${APP}/app/api/vehiculos/etiquetas/route.ts`)
  assert.match(lote, /const reimprimir = c\.reimprimir === true/)
  assert.match(lote, /reimprimir \|\| !estado\?\.porClave\.get\(v\.matricula\)\?\.qr/)
  assert.match(lote, /\.slice\(0, MAX_ETIQUETAS_LOTE\)/)
})

test('sin dominio https no se escribe ninguna etiqueta (503 ANTES de crear la fila)', () => {
  for (const f of [`${APP}/app/api/vehiculos/[bienId]/qr/route.ts`, `${APP}/app/api/vehiculos/etiquetas/route.ts`]) {
    const src = leer(f)
    const i = src.indexOf("if (enlaceDeVehiculo('x') === null) return NextResponse.json(SIN_ENLACE, { status: 503 })")
    assert.ok(i >= 0 && i < src.indexOf('crearQrVehiculo('), `${f}: el 503 va antes de crear`)
  }
  const enlace = leer(`${APP}/lib/enlace-hoja.ts`)
  assert.match(enlace, /export function enlaceDeVehiculo\(token: string\): string \| null \{\s*return enlacePublico\('v', token\)/)
})

// ─── La pantalla del dueño ───────────────────────────────────────────────────

test('la pantalla DICE que el QR se ve una vez, que reimprimir anula la pegada y qué ve quien escanea', () => {
  const src = leer(`${APP}/app/(portal)/QrVehiculo.tsx`)
  assert.match(src, /Este QR solo se ve esta vez/)
  assert.match(src, /la etiqueta pegada deja de valer/)
  assert.match(src, /Así lo ve quien escanee/)
  assert.match(src, /TEXTO_INTERRUPTOR\[k\]/, 'el texto de cada casilla sale del módulo puro (es una afirmación sobre la allow-list)')
  // Al imprimir solo sale el bloque marcado (allow-list de `@media print`).
  const css = crudo(`${APP}/app/globals.css`)
  assert.match(css, /body:has\(\[data-imprimir-etiquetas='si'\]\) \* \{ visibility: hidden !important; \}/)
  // La etiqueta: QR, matrícula y marca. Nada más.
  const etiqueta = src.slice(src.indexOf('export function EtiquetaVehiculo'), src.indexOf('function VistaPrevia'))
  assert.doesNotMatch(etiqueta, /compania|numeroPoliza|nombre|telefono/i)
})
