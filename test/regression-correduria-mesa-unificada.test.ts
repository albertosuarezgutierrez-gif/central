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
  // Anulaciones, bajas PUE y aprobaciones (TRABAJO) cuelgan del cockpit.
  const cockpit = leer('HoyCockpit.tsx')
  for (const c of ['<Anulaciones', '<BajasPue', '<Aprobaciones']) assert.ok(cockpit.includes(c), `el cockpit ya no monta ${c}`)
})

test('campana (26/10/2026): lo que es aviso puntual sale de «Gestión» y de «Mi mesa» y vive en la campana de la cabecera', () => {
  const cockpit = leer('HoyCockpit.tsx')
  for (const c of ['<CartasMediador', '<SolicitudesPortal', '<OportunidadesPatrimonio', '/api/correduria/actividad']) {
    assert.ok(!cockpit.includes(c), `el cockpit vuelve a pintar ${c}, que ya está en la campana`)
  }
  // La ingesta en el cockpit solo si está en ROJO.
  assert.match(cockpit, /estado\.tono === 'malo' && \(/)
  const cabecera = leer('AccionesCabecera.tsx')
  assert.ok(cabecera.includes('<CampanaAvisos />'), 'la cabecera (Mi mesa y Gestión) ya no monta la campana')
  const campana = leer('CampanaAvisos.tsx')
  for (const c of ['<SolicitudesPortal />', '<OportunidadesPatrimonio />', '<CartasMediador />']) assert.ok(campana.includes(c), `la campana ya no ofrece la cola completa ${c}`)
  // Error ≠ 0: la campana distingue «no se pudo comprobar» de «no hay nada», y refresca solo con la pestaña visible.
  assert.match(campana, /lectura\.estado === 'error'/)
  assert.match(campana, /No se han podido comprobar las notificaciones/)
  assert.match(campana, /document\.visibilityState === 'visible'/)
  // Quejas, supresiones y partes con plazo legal: en la campana Y siguen en «Gestión» (los vigila el test de arriba).
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

test('«Mi mesa» monta las tareas sueltas y las pérdidas por revisar (la banda pasó a la campana), y la banda no oculta un «no se pudo comprobar»', () => {
  const mesa = leer('mesa/MesaClient.tsx')
  for (const c of ['<AccionesCabecera />', '<TareasSueltas', '<PerdidasPorRevisar', '<Secciones activa="mesa"']) assert.ok(mesa.includes(c), `«Mi mesa» ya no monta ${c}`)
  assert.ok(!mesa.includes('<BandaAvisos'), '«Mi mesa» vuelve a pintar la banda de avisos, que ya está en la campana')
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
