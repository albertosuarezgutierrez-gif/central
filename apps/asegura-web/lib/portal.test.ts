// Guardián del ÚNICO acceso que ofrece esta web: la intranet del cliente.
//
// Decisión de Alberto (05/09/2026): la web es 100 % venta. Un botón lleva al
// portal del asegurado (`apps/asegura-portal`) y **no hay ningún acceso a la
// intranet de la correduría** — él entra por su panel de plataforma. Las dos
// cosas se rompen en silencio: un botón que alguien quita al rediseñar la
// cabecera no falla en ningún build, y un «Acceso corredor» que alguien copia
// de la web antigua tampoco. Este test lee el FUENTE, porque ni tsc ni next
// build miran el texto de un <a>.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PORTAL_URL } from './sitio.ts'

const RAIZ = join(import.meta.dirname, '..')

function fuentesTsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) fuentesTsx(p, acc)
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p)
  }
  return acc
}

const FUENTES = [...fuentesTsx(join(RAIZ, 'app')), ...fuentesTsx(join(RAIZ, 'components')), ...fuentesTsx(join(RAIZ, 'lib'))]

/** Quita comentarios (`//…`, `/* … *\/`, `{/* … *\/}`) para mirar solo lo que se RENDERIZA. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

test('PORTAL_URL es https y sin barra final', () => {
  assert.match(PORTAL_URL, /^https:\/\/[^/]+$/, `PORTAL_URL con forma rara: ${PORTAL_URL}`)
})

// El botón vive en `components/Cabecera.tsx` desde el rediseño del 05/09/2026
// (la cabecera pasó a ser cliente para poder encogerse al hacer scroll). Se
// comprueba ahí, y además que el layout SIGA montando la cabecera: si alguien
// la quitase del layout, el botón estaría en un fichero que no renderiza nadie
// y este guardián seguiría en verde mirando al sitio equivocado.
test('la cabecera MONTA el botón al portal del cliente', () => {
  const cab = sinComentarios(readFileSync(join(RAIZ, 'components', 'Cabecera.tsx'), 'utf8'))
  assert.match(cab, /href=\{PORTAL_URL\}/, 'components/Cabecera.tsx ya no enlaza a PORTAL_URL: el cliente no tiene cómo entrar a su intranet desde la web')
  // 🚨 «Mis seguros», NO «Área de clientes». El rótulo viejo era una puerta
  // cerrada: decía «clientes» a una intranet en la que entra cualquiera con un
  // correo verificado, y ese es el argumento de venta de toda la portada
  // (Alberto, 07/09/2026). Si alguien lo revierte, el 99 % de los visitantes
  // vuelve a leer que eso no es para ellos — y nada falla.
  assert.match(cab, /Mis seguros/, 'el botón perdió su rótulo')
  // La prohibición de «Área de clientes» NO vive aquí: está en PROHIBIDO, que
  // se aplica a TODO el fuente. Ver la nota del 07/09/2026 en ese test.

  const layout = sinComentarios(readFileSync(join(RAIZ, 'app', 'layout.tsx'), 'utf8'))
  assert.match(layout, /<Cabecera\b/, 'el layout ya no monta <Cabecera>: el botón existiría en un fichero que no renderiza nadie')
})

test('la home ofrece el portal junto al CTA de venta', () => {
  const home = sinComentarios(readFileSync(join(RAIZ, 'app', 'page.tsx'), 'utf8'))
  assert.match(home, /href=\{PORTAL_URL\}/, 'app/page.tsx ya no enlaza a PORTAL_URL')
})

test('NINGÚN enlace de la web lleva a la intranet de la correduría ni a plataforma', () => {
  // Patrones de la trastienda: el CRM de Manuel, el panel de Alberto y el
  // vocabulario de la web antigua (alta de usuarios que Alberto descartó).
  const PROHIBIDO = [
    /app\.grupoasegura\.com/,
    /plataforma[-a-z0-9]*\.vercel\.app/,
    /\/correduria\b/,
    /\/operador\b/,
    /\/login\b/,
    /ya\s+soy\s+cliente/i,
    // 🚨 Este patrón estaba SOLO en el test de la cabecera, y por eso no cazó
    // nada: al rediseñar la portada el 07/09/2026 el rótulo viejo sobrevivió en
    // `components/PanelDemo.tsx` —el simulador de navegador decía «Área de
    // clientes · Mis seguros»—, se corrigió a mano y ningún cepo lo vigilaba.
    // Lo vio Alberto en una captura, que es exactamente el modo de fallo que
    // este fichero existe para evitar: un guardián que mira a UN fichero da
    // verde sobre los otros veinte. El vocabulario de la puerta se prohíbe en
    // todo el fuente o no se prohíbe.
    /área de clientes/i,
    /acceso\s+corredur/i,
    /acceso\s+corredor/i,
    /únete gratis/i,
    /ya tengo cuenta/i,
  ]
  for (const f of FUENTES) {
    const src = sinComentarios(readFileSync(f, 'utf8'))
    // Solo lo que se PINTA: valores de href y texto visible; los comentarios ya se quitaron.
    const hrefs = [...src.matchAll(/href=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{'([^']*)'\})/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
    for (const h of hrefs) {
      for (const re of PROHIBIDO) assert.doesNotMatch(h, re, `${f}: enlace a la trastienda "${h}"`)
    }
    for (const re of PROHIBIDO.slice(5)) assert.doesNotMatch(src, re, `${f}: texto de acceso de corredor / alta de usuario (${re})`)
  }
})
