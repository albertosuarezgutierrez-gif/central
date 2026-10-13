import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * «Hoy» + «Vencimientos» se unificaron en «Mi mesa» + «Gestión» + «Prospección» (13/10/2026, Alberto).
 * Lo que se vigila es estructura (lee el fuente): que lo movido sigue protegido y que lo quitado no vuelve a
 * pintarse dos veces.
 */
const DIR = join(import.meta.dirname, '..', 'apps', 'plataforma', 'app', '(usuario)', 'correduria')
const leer = (rel: string) => readFileSync(join(DIR, rel), 'utf8')

const gestion = () => {
  const src = leer('CorreduriaClient.tsx')
  const ini = src.indexOf('aria-label="Gestión"')
  const fin = src.indexOf('aria-label="Clientes"', ini)
  assert.ok(ini >= 0 && fin > ini, 'no se encontró el panel «Gestión»')
  return src.slice(ini, fin)
}

test('«Gestión» sigue montando las colas administrativas con plazo (los avisos de la mesa enlazan aquí)', () => {
  const g = gestion()
  for (const c of ['<PartesPortal', '<Supresiones', '<CambiosCuenta', '<Quejas', '<Retencion', '<Sustituciones', '<DiferenciasCima', '<DescuadresComisiones', '<AvisoIngesta', '<HoyCockpit']) {
    assert.ok(g.includes(c), `«Gestión» ya no monta ${c}`)
  }
  // Anulaciones, cartas, bajas PUE y aprobaciones cuelgan del cockpit.
  const cockpit = leer('HoyCockpit.tsx')
  for (const c of ['<Anulaciones', '<CartasMediador', '<BajasPue', '<Aprobaciones']) assert.ok(cockpit.includes(c), `el cockpit ya no monta ${c}`)
})

test('lo que ya vive en «Mi mesa» NO se pinta también en «Gestión» (ni en su cockpit)', () => {
  const g = gestion()
  for (const c of ['<Renovaciones', '<DeclaradasVencer', '<LeadsPortal', '<PerdidasCartera', 'vencimientos/llamada']) {
    assert.ok(!g.includes(c), `«Gestión» vuelve a pintar ${c}, que ya está en «Mi mesa»/«Prospección»`)
  }
  const cockpit = leer('HoyCockpit.tsx')
  for (const c of ['tareas-hoy', 'PerdidasCartera', 'llamadas hoy', 'onContadorTareas']) {
    assert.ok(!cockpit.includes(c), `el cockpit vuelve a llevar ${c} (franja/tareas de hoy viven en «Mi mesa»)`)
  }
})

test('la barra: Mi mesa primero, Prospección enlaza a /vencimientos, y /correduria sin ?s= va a la mesa', () => {
  const barra = leer('Secciones.tsx')
  assert.match(barra, /BARRA_CORREDURIA\.map/)
  assert.ok(!barra.includes('href="/correduria/mesa"'), 'la barra vuelve a tener la mesa a mano en vez de BARRA_CORREDURIA')
  const sec = leer('secciones.ts')
  assert.match(sec, /clave: 'prospeccion', href: '\/correduria\/vencimientos'/)
  assert.match(sec, /clave: 'mesa', href: '\/correduria\/mesa'/)
  const page = leer('page.tsx')
  assert.match(page, /if \(iniciaEnLaMesa\(s\)\) redirect\('\/correduria\/mesa'\)/)
})

test('«Mi mesa» monta la banda, las tareas sueltas y las pérdidas por revisar, y la banda no oculta un «no se pudo comprobar»', () => {
  const mesa = leer('mesa/MesaClient.tsx')
  for (const c of ['<BandaAvisos />', '<TareasSueltas', '<PerdidasPorRevisar', '<Secciones activa="mesa"']) assert.ok(mesa.includes(c), `«Mi mesa» ya no monta ${c}`)
  const banda = leer('mesa/BandaAvisos.tsx')
  assert.match(banda, /banda\.estado === 'error'/, 'la banda no distingue «no se pudo comprobar» de «no hay avisos»')
  assert.match(banda, /No se han podido comprobar los avisos/)
  // Tres estados en lo no-expediente: `null` del puerto se dice, no se pinta como vacío.
  const extra = leer('mesa/BloquesSueltos.tsx')
  assert.equal((extra.match(/lectura\.estado === 'no_leido'/g) ?? []).length, 2, 'cada bloque debe decir «no se ha podido leer»')
})

test('«Mi mesa»: sin window.confirm, y las listas largas paginan (≤50 + «Ver más»)', () => {
  for (const f of ['mesa/MesaClient.tsx', 'mesa/BandaAvisos.tsx', 'mesa/BloquesSueltos.tsx']) {
    const s = leer(f)
    assert.ok(!/window\.confirm|\bconfirm\(/.test(s), `${f} usa confirm()`)
  }
  assert.match(leer('mesa/BloquesSueltos.tsx'), /const PAGINA = 50/)
  assert.equal((leer('mesa/BloquesSueltos.tsx').match(/\.slice\(0, limite\)/g) ?? []).length, 2)
})
