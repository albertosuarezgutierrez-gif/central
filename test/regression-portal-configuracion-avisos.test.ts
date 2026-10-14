// «Configuración → Avisos» y la bienvenida de avisos del portal (13/10/2026, fase A).
//
// Lo que estos cepos fijan, y por qué cada uno:
//  1. El diálogo del navegador (`Notification.requestPermission`) solo se abre al PULSAR: si saliera
//     al cargar y la persona dijera «Bloquear», ya no habría forma de volver a preguntar.
//  2. Toda pantalla que activa las notificaciones enseña `TEXTO_CONSENTIMIENTO_AVISOS`, y la ruta de
//     suscripción exige su versión: una fila `avisos` sin texto enseñado es una prueba fabricada.
//  3. El «Ahora no» va a la BD (por identidad), no solo al navegador.
//  4. Los dos crons de push leen las preferencias (antelación, canal, «no molestar»).
//  5. Las listas del SQL son las del módulo (un CHECK más corto revienta el guardado en producción).
//  6. La campana ya no lleva el interruptor: enlaza a Configuración.
//  7. La antelación elegida llega TAMBIÉN al correo de vencimiento, al digest y a la campana, por el
//     helper (`diasEfectivosDeFicha` → `diasVentanaVencimiento`: max(7, la mayor), 14/10/2026).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { CANALES_AVISO, DIAS_ANTELACION_OPCIONES, diasVentanaVencimiento } from '../packages/module-seguros-portal/src/preferencias-avisos.ts'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura-portal'
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

function ficherosTsx(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(join(ROOT, dir))) {
    const ruta = `${dir}/${nombre}`
    if (nombre === 'node_modules' || nombre === '.next') continue
    if (statSync(join(ROOT, ruta)).isDirectory()) salida.push(...ficherosTsx(ruta))
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

test('🚨 el permiso del navegador solo se pide al pulsar: nunca desde un efecto de carga', () => {
  const app = ficherosTsx(`${APP}/app`)
  const piden = app.filter((f) => /Notification\.requestPermission\(/.test(sinComentarios(leer(f))))
  assert.deepEqual(piden, [`${APP}/app/push-cliente.ts`], 'requestPermission vive en UN sitio: activarEnEsteDispositivo')
  const pc = sinComentarios(leer(`${APP}/app/push-cliente.ts`))
  const cuerpo = pc.slice(pc.indexOf('export async function activarEnEsteDispositivo'), pc.indexOf('export async function desactivarEnEsteDispositivo'))
  assert.match(cuerpo, /Notification\.requestPermission\(/, 'requestPermission fuera de activarEnEsteDispositivo')

  const b = sinComentarios(leer(`${APP}/app/(portal)/BienvenidaAvisos.tsx`))
  const i = b.indexOf('useEffect(')
  const efecto = b.slice(i, b.indexOf('}, [instalacion])', i))
  assert.ok(i !== -1 && efecto.length > 0, 'no encuentro el efecto de carga de la bienvenida')
  assert.doesNotMatch(efecto, /activarEnEsteDispositivo|requestPermission/, 'la bienvenida pide permiso al cargar')
  assert.match(b, /const si = async \(\) => \{[\s\S]*?activarEnEsteDispositivo\(\)/, '«Sí, avisarme» es lo que activa')
})

test('🚨 toda pantalla que activa las notificaciones enseña el texto de consentimiento', () => {
  const app = ficherosTsx(`${APP}/app`).filter((f) => f.endsWith('.tsx'))
  const activan = app.filter((f) => /activarEnEsteDispositivo\(\)/.test(sinComentarios(leer(f))))
  assert.ok(activan.length >= 2, `esperaba la bienvenida y Configuración, encuentro: ${activan.join(', ')}`)
  for (const f of activan) {
    assert.match(sinComentarios(leer(f)), /\{TEXTO_CONSENTIMIENTO_AVISOS\}/, `${f} activa sin enseñar el texto que se sella`)
  }
})

test('🚨 la suscripción exige la versión del texto y sella el consentimiento append-only', () => {
  const pc = sinComentarios(leer(`${APP}/app/push-cliente.ts`))
  assert.match(pc, /consentimiento: VERSION_TEXTO_AVISOS/, 'el navegador no manda la versión del texto que enseñó')
  const ruta = sinComentarios(leer(`${APP}/app/api/push/suscribir/route.ts`))
  assert.match(ruta, /consentimiento: z\.literal\(VERSION_TEXTO_AVISOS\)/, 'la ruta acepta suscribir sin el texto enseñado')
  const lib = sinComentarios(leer(`${APP}/lib/push-suscripcion.ts`))
  assert.match(lib, /portalConsentimiento\.create\(/)
  assert.doesNotMatch(lib, /portalConsentimiento\.(update|upsert|delete)/, 'portal_consentimiento es append-only')
  assert.match(lib, /tipo: 'avisos'/)
  assert.match(lib, /decidirRegistroAvisos\(\{\s*accion: 'activar'/)
  assert.match(lib, /decidirRegistroAvisos\(\{\s*accion: 'desactivar'/, 'desactivar no registra la revocación')
})

test('🚨 «Ahora no» se guarda en la BD por identidad (no solo en el navegador)', () => {
  const b = sinComentarios(leer(`${APP}/app/(portal)/BienvenidaAvisos.tsx`))
  assert.match(b, /decidirBienvenidaAvisos\(/)
  assert.match(b, /'\/api\/configuracion\/bienvenida'/)
  assert.doesNotMatch(b, /localStorage/, 'el «Ahora no» en localStorage no vale en otro dispositivo')
  const lib = sinComentarios(leer(`${APP}/lib/avisos-preferencias.ts`))
  assert.match(lib, /bienvenidaPospuestaEn: new Date\(\)/)
  const layout = sinComentarios(leer(`${APP}/app/(portal)/layout.tsx`))
  assert.match(layout, /<BienvenidaAvisos \/>/, 'la bienvenida no está montada en el armazón del portal')
})

for (const cron of ['avisos-push', 'avisos-cima']) {
  test(`🚨 ${cron}: respeta canal y «no molestar» de Configuración`, () => {
    const c = sinComentarios(leer(`${APP}/app/api/cron/${cron}/route.ts`))
    assert.match(c, /portalPreferenciasAvisos\.findMany\(/)
    assert.match(c, /resolverPreferenciasAvisos\(/)
    assert.match(c, /motivoSinPush\(/)
    assert.match(c, /preferencias_no_leidas/, 'si no se leen las preferencias, se manda con valores supuestos')
  })
}

test('🚨 avisos-push: la antelación elegida decide la ventana y la criba llega a la mayor opción', () => {
  const c = sinComentarios(leer(`${APP}/app/api/cron/avisos-push/route.ts`))
  assert.match(c, /DIAS_ANTELACION_MAX \* MS_DIA/)
  assert.doesNotMatch(c, /DIAS_VENTANA_AVISO/, 'la criba sigue fija en 7 días')
  assert.match(c, /debeAvisarPush\([^)]*\}, hoy, p\.diasAntelacion\)/)
})

test('🚨 la regla de la antelación del correo: max(7, la mayor elegida); sin leer, 7', () => {
  assert.equal(diasVentanaVencimiento([15, 30]), 30)
  assert.equal(diasVentanaVencimiento([3]), 7, 'el correo nunca baja de 7')
  assert.equal(diasVentanaVencimiento(null), 7)
})

test('🚨 el correo de vencimiento usa la antelación de la ficha (vía el helper), no los 7 fijos', () => {
  const canal = sinComentarios(leer('apps/asegura/lib/avisos-vencimiento-canal.ts'))
  assert.match(canal, /export function diasEfectivosDeFicha\([\s\S]*?diasVentanaVencimiento\(/, 'el helper no delega en la regla del módulo')
  const venc = sinComentarios(leer('apps/asegura/lib/avisos-vencimiento.ts'))
  assert.match(venc, /entraEnVentana\(\{[^}]*dias: diasEfectivosDeFicha\(canalesDeFicha, /, 'el correo no aplica la antelación de la ficha')
  assert.doesNotMatch(venc, /lte: new Date\(hoy\.getTime\(\) \+ DIAS_VENTANA_AVISO \* MS_DIA\)/, 'la criba del correo sigue fija en 7 días')
})

test('🚨 el digest de la intranet y la campana usan la antelación (vía el helper)', () => {
  const intra = sinComentarios(leer('apps/asegura/lib/avisos-intranet.ts'))
  assert.match(intra, /diasEfectivosDeFicha\(canales, p\.clienteId\)/, 'el digest no aplica la antelación de la ficha')
  const reglas = sinComentarios(leer('apps/asegura/lib/avisos-intranet-reglas.ts'))
  assert.match(reglas, /diasAntelacion: p\.diasAntelacion/, 'el digest no pasa la antelación a avisosDe()')
  const catalogo = sinComentarios(leer('packages/module-seguros-portal/src/avisos.ts'))
  assert.match(catalogo, /diasVentanaVencimiento\(x\.diasAntelacion/, 'avisosDe() ignora la antelación')
  const ruta = sinComentarios(leer(`${APP}/app/api/avisos/route.ts`))
  assert.match(ruta, /diasAntelacionDeIdentidad\(identidad\.id\)/, 'la campana no lee la antelación de SU identidad')
  assert.match(ruta, /diasAntelacion: antelacion\.status === 'fulfilled' \? antelacion\.value : null/)
})

test('avisos-cima: «solo por correo» sella como silenciado; «no molestar» ni envía ni sella', () => {
  const c = sinComentarios(leer(`${APP}/app/api/cron/avisos-cima/route.ts`))
  assert.match(c, /motivo === 'canal_correo' \? new Set<string>\(TIPOS_AVISO_CIMA\)/)
  const i = c.indexOf("if (motivo === 'no_molestar')")
  assert.ok(i !== -1 && i < c.indexOf('planificarAvisos('), '«no molestar» tiene que cortar antes de planificar (y sellar)')
})

test('el SQL acepta exactamente los canales y antelaciones del módulo, y no da DELETE', () => {
  const sql = leer(`${APP}/prisma/sql/2026-10-13_configuracion_avisos.sql`)
  const canales = /canal\s+text CHECK \(canal IN \(([^)]*)\)\)/.exec(sql)?.[1]
  assert.ok(canales, 'no encuentro el CHECK de canal')
  assert.deepEqual(canales.split(',').map((x) => x.trim().replace(/'/g, '')), [...CANALES_AVISO])
  const dias = /dias_antelacion IN \(([^)]*)\)/.exec(sql)?.[1]
  assert.ok(dias, 'no encuentro el CHECK de antelación')
  assert.deepEqual(dias.split(',').map((x) => Number(x.trim())), [...DIAS_ANTELACION_OPCIONES])
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON seguros\.portal_preferencias_avisos TO prisma_asegura_portal;/)
  assert.match(sql, /DISABLE ROW LEVEL SECURITY/)
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/)
})

test('la campana ya no lleva el interruptor de push: enlaza a Configuración', () => {
  const c = sinComentarios(leer(`${APP}/app/Campana.tsx`))
  assert.doesNotMatch(c, /<ActivarPush/)
  assert.match(c, /href="\/configuracion#avisos"/)
  const pagina = sinComentarios(leer(`${APP}/app/(portal)/configuracion/page.tsx`))
  assert.match(pagina, /<ActivarPush \/>/)
  assert.match(pagina, /<PreferenciasAvisos \/>/)
  assert.match(pagina, /id="avisos"/)
})

// Fase B: el selector de canal ofrece SOLO `ambos` y `movil`. «Solo por correo» dejaría a la persona sin
// recibos, siniestros ni recordatorios por ningún canal (solo existen como push).
const UI_AVISOS = `${APP}/app/(portal)/configuracion/AjustesAvisos.tsx`
const opcionesDelCanal = () => {
  const ui = sinComentarios(leer(UI_AVISOS))
  const i = ui.indexOf('Cómo quiero recibir los avisos')
  assert.ok(i !== -1, 'no encuentro el selector de canal')
  return ui.slice(i, ui.indexOf('</label>', i))
}

test('🚨 fase B: el selector de canal guarda el canal elegido', () => {
  assert.match(sinComentarios(leer(UI_AVISOS)), /guardar\(\{\s*canal/)
})

test('🚨 fase B: el selector de canal ofrece «ambos» (En el móvil y por correo)', () => {
  assert.match(opcionesDelCanal(), /<option value="ambos">En el móvil y por correo<\/option>/)
})

test('🚨 fase B: el selector de canal ofrece «movil» (Solo en el móvil)', () => {
  assert.match(opcionesDelCanal(), /<option value="movil">Solo en el móvil<\/option>/)
})

test('🚨 fase B: la pantalla NO ofrece «correo» como canal', () => {
  const sel = opcionesDelCanal()
  assert.doesNotMatch(sel, /value="correo"/, 'el selector ofrece «correo»')
  assert.doesNotMatch(sel, /Solo por correo/, 'el selector dice «Solo por correo»')
  assert.doesNotMatch(sinComentarios(leer(UI_AVISOS)), /Solo por correo|CANALES_AVISO|guardar\(\{\s*canal:\s*'correo'/)
})

test('🚨 fase B: la nota de «Solo en el móvil» avisa de que, si no llega, se manda por correo', () => {
  assert.match(sinComentarios(leer(UI_AVISOS)), /Si el aviso no te llega al móvil, te lo mandamos igualmente por correo\./)
})

test('🚨 fase B: la ruta del portal rechaza canal «correo» con 400', () => {
  const r = sinComentarios(leer(`${APP}/app/api/configuracion/avisos/route.ts`))
  const i = r.indexOf("cuerpo.canal === 'correo'")
  assert.ok(i !== -1, 'la ruta no corta «correo»')
  assert.match(r.slice(i, i + 120), /status: 400/)
  assert.ok(i < r.indexOf('validarCambioPreferencias('), 'el corte tiene que ir antes de validar/guardar')
})
