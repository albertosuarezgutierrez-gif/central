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
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { CANALES_AVISO, DIAS_ANTELACION_OPCIONES } from '../packages/module-seguros-portal/src/preferencias-avisos.ts'

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

test('🚨 TODO fase B: el selector de canal NO se enseña mientras no exista el envío por correo', () => {
  // «Solo por correo» dejaría a la persona sin recibos, siniestros ni recordatorios por ningún canal.
  // La columna y la lógica de los crons se quedan (NULL = push); lo que no puede existir es el control.
  const ui = sinComentarios(leer(`${APP}/app/(portal)/configuracion/AjustesAvisos.tsx`))
  assert.doesNotMatch(ui, /guardar\(\{\s*canal/, 'la pantalla vuelve a guardar el canal')
  assert.doesNotMatch(ui, /Solo por correo|name="canal-avisos"/, 'la pantalla vuelve a ofrecer el canal')
  assert.match(leer(`${APP}/app/(portal)/configuracion/AjustesAvisos.tsx`), /TODO fase B/)
})
