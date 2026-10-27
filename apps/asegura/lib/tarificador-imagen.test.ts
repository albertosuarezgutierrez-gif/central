// Cepos de la imagen del bot desde la BD (27/10/2026): producción sin redespliegue (A), descarte de atascos fuera del corte (B)
// e imagen de rama para UN trabajo tras interruptor (C). `node --test`. Reglas puras con comportamiento real; el cableado (SQL,
// rutas, workflows) se lee del FUENTE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REGEX_IMAGEN_BOT,
  decidirPermisoPrueba,
  decidirPublicarProduccion,
  elegirImagenProduccion,
  imagenParaTrabajo,
  imagenValida,
  validarImagenPrueba,
} from './tarificador-imagen-reglas.ts'

const APP = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(APP, rel), 'utf8')
const leerRaiz = (rel: string) => readFileSync(join(APP, '../..', rel), 'utf8')
const PROD = 'registry.fly.io/asegura-tarificador:main-c5e69e6'
const RAMA = 'registry.fly.io/asegura-tarificador:rama-abc1234'
const ENV = { TARIFICADOR_FLY_IMAGE: 'registry.fly.io/asegura-tarificador:main-0000000' }

test('regex estricta: solo el registro de la app del worker y una etiqueta corta en minúsculas', () => {
  assert.equal(REGEX_IMAGEN_BOT.source, String.raw`^registry\.fly\.io\/asegura-tarificador:[a-z0-9][a-z0-9._-]{0,63}$`)
  for (const ok of [PROD, RAMA, 'registry.fly.io/asegura-tarificador:v20261019-allianz0615']) assert.ok(imagenValida(ok), ok)
  for (const malo of [
    'registry.fly.io/otra-app:main-1', 'docker.io/asegura-tarificador:main-1', 'registry.fly.io/asegura-tarificador:Main-1',
    'registry.fly.io/asegura-tarificador:-x', 'registry.fly.io/asegura-tarificador:', `registry.fly.io/asegura-tarificador:${'a'.repeat(65)}`,
    `${PROD}\n`, ` ${PROD}`, 'registry.fly.io/asegura-tarificador:main-1;rm', 'registry.fly.io/asegura-tarificador:main-1@sha256:00', null, 7,
  ]) assert.ok(!imagenValida(malo), String(malo))
})

test('A: la BD manda sobre la env; sin fila / valor raro / imagen de rama → la env de respaldo (con aviso)', () => {
  assert.deepEqual(elegirImagenProduccion(PROD, ENV), { imagen: PROD, origen: 'bd', aviso: null })
  assert.deepEqual(elegirImagenProduccion(null, ENV), { imagen: ENV.TARIFICADOR_FLY_IMAGE, origen: 'env', aviso: null })
  const raro = elegirImagenProduccion('registry.fly.io/otra:main-1', ENV)
  assert.equal(raro.imagen, ENV.TARIFICADOR_FLY_IMAGE)
  assert.ok(raro.aviso && !raro.aviso.includes('otra'), 'el aviso no repite un valor que no casa')
  const rama = elegirImagenProduccion(RAMA, ENV)
  assert.equal(rama.imagen, ENV.TARIFICADOR_FLY_IMAGE)
  assert.match(rama.aviso!, /rama/)
  assert.deepEqual(elegirImagenProduccion(null, {}), { imagen: null, origen: null, aviso: null })
})

test('A: publicar producción — nunca una anterior salvo forzar; misma = sin cambios; rama y formato raro → 400', () => {
  const ahora = new Date('2026-10-28T10:00:00Z')
  const actual = { imagen: PROD, commitAt: new Date('2026-10-27T17:06:46Z') }
  const nueva = 'registry.fly.io/asegura-tarificador:main-1234567'
  const ok = decidirPublicarProduccion({ actual, imagen: nueva, commitAt: '2026-10-28T09:00:00Z', forzar: undefined }, ahora)
  assert.ok(ok.ok && ok.cambia)
  const vieja = decidirPublicarProduccion({ actual, imagen: nueva, commitAt: '2026-10-26T09:00:00+02:00', forzar: false }, ahora)
  assert.ok(!vieja.ok && vieja.status === 409 && /imagen_anterior/.test(vieja.motivo))
  assert.ok(!decidirPublicarProduccion({ actual, imagen: nueva, commitAt: '2026-10-26T09:00:00Z', forzar: 'true' }, ahora).ok, 'forzar solo con true booleano')
  const forzada = decidirPublicarProduccion({ actual, imagen: nueva, commitAt: '2026-10-26T09:00:00Z', forzar: true }, ahora)
  assert.ok(forzada.ok && forzada.cambia)
  const misma = decidirPublicarProduccion({ actual, imagen: PROD, commitAt: '2026-10-27T17:06:46Z', forzar: false }, ahora)
  assert.ok(misma.ok && !misma.cambia)
  for (const [imagen, commitAt] of [[RAMA, '2026-10-28T09:00:00Z'], ['registry.fly.io/otra:main-1', '2026-10-28T09:00:00Z'], [nueva, ''], [nueva, 'ayer'], [nueva, '2026-11-30T00:00:00Z']] as const) {
    const d = decidirPublicarProduccion({ actual, imagen, commitAt, forzar: true }, ahora)
    assert.ok(!d.ok && d.status === 400, `${imagen} ${commitAt}`)
  }
  // La vigente sin fecha («no se sabe») no bloquea; sin fila tampoco.
  assert.ok(decidirPublicarProduccion({ actual: { imagen: PROD, commitAt: null }, imagen: nueva, commitAt: '2020-01-01T00:00:00Z', forzar: false }, ahora).ok)
  assert.ok(decidirPublicarProduccion({ actual: null, imagen: nueva, commitAt: '2026-10-28T09:00:00Z', forzar: false }, ahora).ok)
})

test('C: imagen de prueba — solo rama-*, nunca main-* (producción) ni otra forma', () => {
  assert.deepEqual(validarImagenPrueba(RAMA), { ok: true, imagen: RAMA })
  assert.deepEqual(validarImagenPrueba(`  ${RAMA} `), { ok: true, imagen: RAMA })
  const main = validarImagenPrueba(PROD)
  assert.ok(!main.ok && /producción/.test(main.motivo))
  assert.ok(!validarImagenPrueba('registry.fly.io/asegura-tarificador:v20261019').ok, 'solo rama-*')
  assert.ok(!validarImagenPrueba('registry.fly.io/otra-app:rama-abc1234').ok)
  assert.ok(!validarImagenPrueba(['x']).ok)
})

test('C: interruptor apagado o sin tabla → 403 claro; encendido → vale', () => {
  const sinTabla = decidirPermisoPrueba(null)
  assert.ok(!sinTabla.ok && sinTabla.status === 403 && /imagen_prueba_no_permitida/.test(sinTabla.motivo))
  const apagado = decidirPermisoPrueba({ imagen: PROD, commitAt: null, permitirPrueba: false })
  assert.ok(!apagado.ok && apagado.status === 403 && /permitir_imagen_prueba/.test(apagado.motivo))
  assert.deepEqual(decidirPermisoPrueba({ imagen: PROD, commitAt: null, permitirPrueba: true }), { ok: true })
})

test('C: al lanzar, la de prueba solo para SU trabajo y con el interruptor AHORA; si no, falla (nunca cae a producción)', () => {
  assert.deepEqual(imagenParaTrabajo({ imagenPrueba: null, permitirPrueba: true, produccion: PROD }), { ok: true, imagen: PROD, prueba: false })
  assert.deepEqual(imagenParaTrabajo({ imagenPrueba: RAMA, permitirPrueba: true, produccion: PROD }), { ok: true, imagen: RAMA, prueba: true })
  const apagado = imagenParaTrabajo({ imagenPrueba: RAMA, permitirPrueba: false, produccion: PROD })
  assert.ok(!apagado.ok && /no_permitida/.test(apagado.motivo))
  assert.ok(!imagenParaTrabajo({ imagenPrueba: PROD, permitirPrueba: true, produccion: PROD }).ok, 'una main-* guardada como prueba no se lanza')
  assert.ok(!imagenParaTrabajo({ imagenPrueba: null, permitirPrueba: false, produccion: null }).ok)
})

test('cableado: lanzarPendientes lee la BD, decide por trabajo, registra imagen_bot y no lanza si la decisión es no', () => {
  const src = leer('lib/tarificador.ts')
  const l = src.slice(src.indexOf('export async function lanzarPendientes'), src.indexOf('async function crearMaquina'))
  assert.match(l, /leerFilaImagen\(\)/)
  assert.match(l, /elegirImagenProduccion\(filaImagen\?\.imagen \?\? null, deps\.env\)/)
  assert.match(l, /configFly\(deps\.env, produccion\.origen === 'bd' \? produccion\.imagen : null\)/)
  assert.match(l, /imagenParaTrabajo\(\{ imagenPrueba: t\.imagen_prueba \?\? null, permitirPrueba: filaImagen\?\.permitirPrueba === true/)
  assert.match(l, /if \(!im\.ok\) \{[\s\S]*?marcarFallo\([\s\S]*?continue\s*\}/, 'sin imagen válida el trabajo falla y NO se crea máquina')
  assert.ok(l.indexOf('if (!im.ok)') < l.indexOf('crearMaquina('), 'la decisión va ANTES de crear la máquina')
  assert.match(l, /crearMaquina\(\{ \.\.\.c\.cfg, imagen: im\.imagen \}/)
  assert.match(l, /imagen_bot = \$\{im\.imagen\}/)
  assert.match(src, /returning t\.id::text as id, t\.intentos, to_jsonb\(t\)->>'imagen_prueba' as imagen_prueba`/)
  // encolar: la imagen de prueba va en el MISMO insert y un duplicado vivo no la hereda.
  const e = src.slice(src.indexOf('export async function encolarTrabajo'), src.indexOf('export async function leerTomadorFicha') > 0 ? src.indexOf('export async function leerTomadorFicha') : undefined)
  assert.match(e, /if \(vivo && e\.imagenPrueba\) return \{ estado: 'rechazado' as const, status: 409/)
  assert.match(e, /solicitado_por, imagen_prueba\)/)
})

test('cableado: probar valida la imagen y exige el interruptor ANTES de encolar; la registra en el trabajo', () => {
  const src = leer('app/api/operador/tarificador/probar/route.ts')
  const i = src.indexOf('validarImagenPrueba(body.imagen)')
  assert.ok(i > 0 && i < src.indexOf('encolarTrabajo({'), 'la validación va antes de encolar')
  assert.ok(src.indexOf('decidirPermisoPrueba(') < src.indexOf('encolarTrabajo({'))
  assert.match(src, /status: permiso\.status/)
  assert.match(src, /solicitadoPor, imagenPrueba \}\)/)
  assert.match(src, /campo: 'imagen_prueba'/)
  assert.match(leer('lib/cambios.ts'), /'trabajo_tarificador\.imagen_prueba'/)
})

test('cableado: endpoint de imagen — Bearer, auditado, sin SQL suelto, cambio anotado', () => {
  const src = leer('app/api/operador/tarificador/imagen/route.ts')
  assert.match(src, /export const POST = auditado\(/)
  assert.equal((src.match(/if \(!operadorAutorizado\(req\)\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 401 \}\)/g) ?? []).length, 2, 'GET y POST con Bearer')
  assert.match(src, /publicarImagenProduccion\(/)
  assert.ok(!/\$queryRaw|\$executeRaw/.test(src))
  assert.match(src, /entidad: 'tarificador_imagen'/)
  const bd = leer('lib/tarificador-imagen.ts')
  assert.match(bd, /for update`/, 'sin cerrojo dos publicaciones se saltarían «nunca una anterior»')
  assert.match(bd, /decidirPublicarProduccion\(/)
})

test('B: evaluarCorte lee la marca de cierre por atasco y deja fuera los trabajos con imagen de prueba', () => {
  const src = leer('lib/tarificador-robustez.ts')
  const c = src.slice(src.indexOf('export async function evaluarCorte'), src.indexOf('export type PausaVisible'))
  assert.match(c, /w\.error->>'atasco' as cierre_atasco/)
  assert.match(c, /cierreAtasco: u\.cierre_atasco/)
  assert.match(c, /to_jsonb\(w\)->>'imagen_prueba' is null/)
  // Las dos vías que cierran un trabajo por su atasco dejan la marca que el corte lee.
  assert.match(src, /'atasco', 'huerfano'/)
  assert.match(src, /'atasco', 'caducado'/)
})

test('workflows: solo main publica producción (por el puerto); fuera de main rama-*; relanzar acepta imagen solo en probar', () => {
  const img = leerRaiz('.github/workflows/tarificador-rpa-imagen.yml')
  assert.match(img, /if: github\.ref == 'refs\/heads\/main'\n/)
  assert.match(img, /\/api\/operador\/tarificador\/imagen/)
  assert.match(img, /ASEGURA_OPERADOR_SECRET: \$\{\{ secrets\.ASEGURA_OPERADOR_SECRET \}\}/)
  assert.match(img, /printf 'header = "Authorization: Bearer %s"\\n' "\$ASEGURA_OPERADOR_SECRET" \| curl -sS --config -/, 'el Bearer por stdin')
  assert.match(img, /etiqueta="\$\{ETIQUETA_PEDIDA:-rama-\$\{sha7\}\}"/)
  assert.match(img, /case "\$etiqueta" in rama-\*\) ;; \*\) echo "::error::fuera de main/)
  assert.ok(!/psql|DATABASE_URL|supabase/i.test(img), 'nunca SQL directo desde Actions')
  const rel = leerRaiz('.github/workflows/tarificador-relanzar.yml')
  assert.match(rel, /IMAGEN: \$\{\{ inputs\.imagen \}\}/)
  assert.match(rel, /imagen_rama='\^registry\\\.fly\\\.io\/asegura-tarificador:rama-\[a-z0-9\._-\]\{1,59\}\$'/)
  assert.match(rel, /imagen solo vale con accion=probar/)
})

test('SQL: idempotente, fila inicial con la imagen de producción vigente e interruptor apagado', () => {
  const sql = leer('prisma/sql/2026-10-27_tarificador_imagen.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seguros\.tarificador_imagen/)
  assert.match(sql, /permitir_imagen_prueba boolean NOT NULL DEFAULT false/)
  assert.match(sql, /'produccion', 'registry\.fly\.io\/asegura-tarificador:main-c5e69e6', '[^']+', false,/)
  assert.match(sql, /ON CONFLICT \(clave\) DO NOTHING/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS imagen_prueba/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS imagen_bot/)
  assert.match(sql, /REVOKE ALL ON seguros\.tarificador_imagen FROM PUBLIC, anon, authenticated, crm_seguros/)
})

test('configFly: con la imagen de la BD la env TARIFICADOR_FLY_IMAGE no hace falta; sin ella se exige como antes', async () => {
  const { configFly } = await import('./tarificador-reglas.ts')
  const base = { FLY_API_TOKEN: 't', TARIFICADOR_FLY_APP: 'a', TARIFICADOR_API_URL: 'https://x' }
  const c = configFly(base, PROD)
  assert.ok(c.ok && c.cfg.imagen === PROD)
  const sin = configFly(base)
  assert.ok(!sin.ok && sin.faltan.includes('TARIFICADOR_FLY_IMAGE'))
  const ambas = configFly({ ...base, ...ENV }, PROD)
  assert.ok(ambas.ok && ambas.cfg.imagen === PROD, 'la BD manda sobre la env')
})
