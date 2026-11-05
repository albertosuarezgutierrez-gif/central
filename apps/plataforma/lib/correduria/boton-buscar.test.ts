import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 🚨 GUARDIÁN (05/11/2026). Botón de búsqueda de la correduría en la barra superior móvil (y lateral).
// Tres cosas que tsc no ve y que se romperían en silencio:
//  1. el botón solo se monta con el flag de acceso (si no, lo vería quien no es de la casa);
//  2. el flag lo calcula el SERVIDOR con `resolverAccesoCorreduria` y solo `autorizado` lo enciende;
//  3. el buscador reutilizado, con `sincronizarUrl={false}`, NO toca `?q=` de la página en la que esté.
const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')

test('la barra móvil monta BotonBuscarCorreduria condicionado al flag de acceso', () => {
  const s = leer('../../app/(usuario)/UserSidebar.tsx')
  assert.match(s, /import BotonBuscarCorreduria from '\.\/BotonBuscarCorreduria'/)
  assert.match(s, /accesoCorreduria && <BotonBuscarCorreduria \/>/, 'barra móvil: sin el flag no se monta')
  assert.match(s, /accesoCorreduria && <BotonBuscarCorreduria variante="lateral" \/>/, 'lateral: sin el flag no se monta')
  assert.equal(s.match(/<BotonBuscarCorreduria/g)?.length, 2, 'solo dos montajes, ambos condicionados')
  assert.match(s, /accesoCorreduria = false/, 'por defecto el flag es false')
})

test('el layout calcula el flag en el servidor y solo "autorizado" lo enciende', () => {
  const l = leer('../../app/(usuario)/layout.tsx')
  assert.match(l, /resolverAccesoCorreduria\(session\)/)
  assert.match(l, /estado === 'autorizado'/)
  assert.match(l, /\.catch\(\(\) => false\)/, 'un fallo es false (conservador)')
  assert.match(l, /accesoCorreduria=\{accesoCorreduria\}/)
})

test('BuscadorCartera con sincronizarUrl=false no lee ni escribe la URL', () => {
  const b = leer('../../app/(usuario)/correduria/BuscadorCartera.tsx')
  assert.match(b, /sincronizarUrl = true/, 'por defecto /correduria sigue sincronizando')
  const f = b.slice(b.indexOf('function recordarEnUrl'))
  assert.match(f.slice(0, f.indexOf('replaceState')), /if \(!sincronizarUrl\) return/, 'recordarEnUrl sale antes de replaceState')
  const i = b.indexOf('new URLSearchParams(window.location.search)')
  assert.match(b.slice(b.lastIndexOf('useEffect', i), i), /if \(!sincronizarUrl\) return/, 'el efecto que relee ?q= tampoco corre')
  assert.equal(b.match(/history\.replaceState\(/g)?.length, 1, 'un único replaceState, el protegido')
})

test('el panel monta el buscador sin sincronizar URL y con autofoco, con import estático (teclado iOS)', () => {
  const p = leer('../../app/(usuario)/BotonBuscarCorreduria.tsx')
  assert.match(p, /<BuscadorCartera sincronizarUrl=\{false\} autoFocus onNavegar=\{cerrar\} \/>/)
  assert.match(p, /^import BuscadorCartera from '\.\/correduria\/BuscadorCartera'/m, 'import estático: el foco debe ocurrir dentro del gesto (iOS)')
  assert.doesNotMatch(p, /from 'next\/dynamic'/, 'con dynamic el input aparece fuera del gesto y iOS no abre el teclado')
  assert.match(p, /abierto && createPortal/, 'el panel solo se monta abierto')
})
