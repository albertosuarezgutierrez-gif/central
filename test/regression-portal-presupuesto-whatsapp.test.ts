// Guardián de la SEGUNDA PUERTA del presupuesto en el portal: el código de acceso que Alberto manda
// a mano por WhatsApp (07/10/2026). Hermano de `regression-portal-presupuesto.test.ts`.
//
// Las reglas del código (otro presupuesto, caducado, regenerado, bloqueo) tienen su cepo PURO en
// `packages/module-seguros-portal/src/codigo-whatsapp.test.ts`, y el gasto del intento en asegura en
// `apps/asegura/lib/presupuesto-codigo-whatsapp.test.ts`. Este vigila el PORTAL: que la cookie de
// acceso no abra más que su presupuesto, que sin código no se vea nada, y que no sea una sesión.
//
// Lee el FUENTE sin comentarios (no importa Prisma: el job corre sin `prisma generate`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PORTAL = join(ROOT, 'apps/asegura-portal')

function codigo(rel: string): string {
  return readFileSync(join(PORTAL, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

const LIB = codigo('lib/presupuesto.ts')
const AUTH = codigo('lib/auth.ts')
const RUTA = codigo('app/api/presupuesto/whatsapp/route.ts')
const CARATULA = codigo('app/presupuesto/[token]/page.tsx')
const FIRMA = codigo('app/api/presupuesto/firma/route.ts')
const DATOS = codigo('app/api/presupuesto/datos/route.ts')

test('🪤 sin código no se ve nada: la cookie de acceso SOLO se pone con un `valido` del puente', () => {
  const pone = RUTA.indexOf('res.cookies.set(COOKIE_ACCESO_WHATSAPP')
  const valido = RUTA.indexOf("if (r.estado === 'valido') {")
  assert.ok(valido > 0 && pone > valido, 'la cookie va DENTRO del acierto')
  assert.equal(RUTA.split('cookies.set(').length - 1, 1, 'una sola escritura de cookie')
  // Y la forma se valida antes de llamar al puente.
  assert.ok(RUTA.indexOf('formatoCodigoWhatsapp(codigo)') < RUTA.indexOf('comprobarCodigoWhatsapp('))
  assert.match(RUTA, /rateLimit\(`presupuesto-whatsapp:\$\{getIp\(req\)\}`/)
})

test('🪤 sin código no se ve nada: sin sesión NI acceso por WhatsApp, la pantalla de dentro corta', () => {
  assert.match(LIB, /const porWhatsapp = \(await accesoWhatsappDe\(id\)\) !== null/)
  assert.match(LIB, /if \(!identidad && !porWhatsapp\) return \{ estado: 'sin_sesion' \}/)
  // Sin acceso por WhatsApp, las dos ramas de siempre y fallando CERRADO.
  assert.match(LIB, /if \(!porWhatsapp\) \{\s*if \(identidad === null\) return \{ estado: 'sin_sesion' \}/)
  // La carátula solo deja pasar con la cookie de ESTE presupuesto o con sesión: el token solo no abre.
  assert.match(CARATULA, /if \(\(await accesoWhatsappDe\(caratula\.id\)\) !== null\) redirect/)
})

test('🪤 el código de otro presupuesto no abre este: la cookie vale para SU id y con el token vigente', () => {
  const f = LIB.slice(LIB.indexOf('export async function accesoWhatsappDe'), LIB.indexOf('export async function accesoPuenteDe'))
  assert.match(f, /a\.presupuestoId !== id/)
  // Regenerado o avisado por correo = token rotado: la cookie deja de abrir. Retirado o vencido, tampoco.
  assert.match(f, /where: \{ id, tokenHash: await hashTokenVista\(a\.token\), retiradoAt: null, venceEl: \{ gt: new Date\(\) \} \}/)
  // Un fallo de BD no abre.
  assert.match(f, /catch \(e\) \{\s*registrar\('accesoWhatsappDe', e\)\s*return null/)
})

test('🪤 la cookie de acceso NO es una sesión, y la sesión no vale como acceso por WhatsApp', () => {
  assert.match(AUTH, /if \(typeof payload\.identidadId !== 'string' \|\| payload\.identidadId === ''\) return null/)
  const v = AUTH.slice(AUTH.indexOf('export async function verificarAccesoWhatsapp'))
  assert.match(v, /if \(!payload \|\| payload\.identidadId !== undefined\) return null/)
  assert.notEqual(AUTH.match(/COOKIE_ACCESO_WHATSAPP = '([^']+)'/)?.[1], 'asegura_portal_session')
})

test('🪤 firmar y avisar de un dato: quién sale de la sesión o de la cookie de ESTE presupuesto, nunca del cuerpo', () => {
  for (const src of [FIRMA, DATOS]) {
    assert.match(src, /const puerta = await accesoPuenteDe\(presupuestoId\)/)
    assert.match(src, /if \(!puerta\) return NextResponse\.json\(\{ estado: 'sin_sesion' \}, \{ status: 401 \}\)/)
    assert.doesNotMatch(src, /b\.(identidadId|tokenWhatsapp|token)\b/)
  }
  // El código del WhatsApp solo con el acceso por WhatsApp.
  assert.match(FIRMA, /via: b\.via === 'whatsapp' && 'tokenWhatsapp' in acceso \? 'whatsapp' : 'correo'/)
})
