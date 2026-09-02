import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// GUARDIÁN: ninguna pantalla del panel puede quedarse sin un solo enlace que lleve a ella.
//
// Una página viva a la que solo se llega escribiendo la URL es, en la práctica, una página que
// no existe — y encima sigue costando mantenimiento y typecheck. No es teórico: se han
// encontrado tres en dos días.
//
//   · `/sivra/partes/establecimientos` — el cron `ses-latido` avisaba por Telegram de que «no
//     hay ningún establecimiento dado de alta» en una pantalla que no se podía abrir.
//   · `/apartamentos` — se quedó sin entrada al fusionar Resumen+Banca (16/07/2026) y estuvo
//     mes y medio invisible.
//   · `/finanzas/tarjeta-credito` — cargos del mes de la tarjeta de Kutxabank, sin un solo
//     enlace en TODO el repo (02/09/2026). Ella sí enlazaba a `/finanzas/gastos`; el camino de
//     vuelta no existía.
//
// Es la misma regla que «¿en qué pantalla lo va a ver?» del CLAUDE.md, aplicada al propio panel.

const PANEL = 'apps/plataforma/app/(usuario)'
const FUENTES = ['apps/plataforma/app', 'apps/plataforma/lib', 'apps/plataforma/components']

/**
 * Pantallas que a propósito NO se enlazan desde ninguna parte. Vacía a posta: añadir una entrada
 * aquí tiene que ser una decisión consciente y con motivo escrito, no la salida fácil para que
 * el guardián se calle. Si la pantalla sirve para algo, lo que falta es el enlace.
 */
const SIN_ENLACE_A_PROPOSITO: Record<string, string> = {}

function archivosTs(dir: string): string[] {
  const salida: string[] = []
  const walk = (d: string) => {
    let entradas: string[]
    try { entradas = readdirSync(d) } catch { return }
    for (const e of entradas) {
      if (e === 'node_modules' || e === '.next' || e === 'generated') continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) salida.push(p)
    }
  }
  walk(dir)
  return salida
}

/** Un redirect puro no es una pantalla: es un marcador viejo que se salva. No se le exige enlace. */
function esRedirectPuro(txt: string): boolean {
  return /redirect\(/.test(txt) && !/<[A-Z]/.test(txt)
}

test('ninguna pantalla del panel se queda sin un enlace que lleve a ella', () => {
  const paginas: { ruta: string; dir: string }[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e === 'page.tsx') {
        const segmentos = relative(PANEL, d).split('/').filter(s => !(s.startsWith('(') && s.endsWith(')')))
        paginas.push({ ruta: ('/' + segmentos.join('/')).replace(/\/$/, '') || '/', dir: d })
      }
    }
  }
  walk(PANEL)
  assert.ok(paginas.length > 50, `se esperaban decenas de pantallas, se encontraron ${paginas.length}`)

  const fuentes = FUENTES.flatMap(archivosTs).map(f => ({ f, txt: readFileSync(f, 'utf8') }))

  const huerfanas: string[] = []
  for (const { ruta, dir } of paginas) {
    if (ruta === '/') continue
    if (ruta.includes('[')) continue // las dinámicas se enlazan con template strings, no literales
    if (ruta in SIN_ENLACE_A_PROPOSITO) continue
    if (esRedirectPuro(readFileSync(join(dir, 'page.tsx'), 'utf8'))) continue
    // El enlace tiene que venir de FUERA de la propia carpeta: enlazarse a sí misma no cuenta.
    const patron = new RegExp(`['"\`]${ruta.replace(/[/\-]/g, m => '\\' + m)}(?:[?'"\`/])`)
    const enlazada = fuentes.some(({ f, txt }) => !f.startsWith(dir + '/') && patron.test(txt))
    if (!enlazada) huerfanas.push(ruta)
  }

  assert.deepEqual(huerfanas, [],
    'Estas pantallas del panel no las enlaza NADIE: solo se llega escribiendo la URL.\n' +
    'Ponles una entrada de menú, un enlace desde la pantalla hermana o una entrada en la paleta\n' +
    'de comandos. Si de verdad no debe enlazarlas nadie, decláralo en SIN_ENLACE_A_PROPOSITO\n' +
    'con el motivo:\n  ' + huerfanas.join('\n  '))
})
