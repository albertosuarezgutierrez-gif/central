// Cepos del bloque legal del portal del asegurado.
//
// Ninguna de estas cosas falla sola. Un pie legal que se cae del layout, una
// página de cookies que sigue diciendo «no hay analítica» el día que alguien
// enchufa PostHog, o una clave DGSFP copiada a mano que se queda vieja: los
// tres se ven exactamente igual que la versión correcta, y el primero que se
// entera es un inspector o un cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Se importa el FUENTE por ruta y no por el nombre del paquete: la raíz del
// monorepo no declara `@central/*` en sus dependencias.
import { MEDIADOR, lineaIdentificacion } from '../packages/module-seguros/src/mediador.ts'

const ROOT = join(import.meta.dirname, '..')
const PORTAL = join(ROOT, 'apps/asegura-portal')
const leer = (rel: string) => readFileSync(join(PORTAL, rel), 'utf8')

const PAGINAS = ['mediador', 'privacidad', 'cookies', 'condiciones'] as const

test('las cuatro paginas legales existen', () => {
  for (const pagina of PAGINAS) {
    assert.ok(
      existsSync(join(PORTAL, 'app/legal', pagina, 'page.tsx')),
      `falta /legal/${pagina}: el enlace del pie llevaría a un 404`,
    )
  }
})

test('el pie legal esta montado en el layout RAIZ, no en el del portal', () => {
  // Si se monta en `app/(portal)/layout.tsx`, desaparece justo de la única
  // pantalla que ve quien todavía no ha entrado — que es donde el art. 19 LDS
  // lo exige, porque es donde se le pide el correo.
  const layout = leer('app/layout.tsx')
  assert.match(layout, /<PieLegal\s*\/>/, 'el pie legal no está en el layout raíz')
  assert.match(layout, /from '\.\/PieLegal'/)
})

test('el pie enlaza a las cuatro paginas y ninguna sobra', () => {
  const pie = leer('app/PieLegal.tsx')
  for (const pagina of PAGINAS) {
    assert.match(pie, new RegExp(`href="/legal/${pagina}"`), `el pie no enlaza a /legal/${pagina}`)
  }
  const enlaces = [...pie.matchAll(/href="\/legal\/([a-z-]+)"/g)].map((m) => m[1])
  for (const enlace of enlaces) {
    assert.ok(
      existsSync(join(PORTAL, 'app/legal', enlace, 'page.tsx')),
      `el pie enlaza a /legal/${enlace}, que no existe`,
    )
  }
})

test('el pie ensena la identificacion del mediador sin tener que pulsar nada', () => {
  // El art. 19 no se cumple con un enlace: la identificación tiene que verse.
  const pie = leer('app/PieLegal.tsx')
  assert.match(pie, /lineaIdentificacion\(\)/)
  assert.ok(lineaIdentificacion().includes(MEDIADOR.identidad.claveDgsfp))
})

test('ninguna pagina legal copia a mano la clave DGSFP ni el NIF', () => {
  // Dos copias del mismo registro es una copia de más: el día que cambie una,
  // la otra miente y nada falla.
  for (const pagina of PAGINAS) {
    const src = leer(`app/legal/${pagina}/page.tsx`)
    assert.ok(
      !src.includes(MEDIADOR.identidad.claveDgsfp),
      `/legal/${pagina} lleva la clave DGSFP escrita a mano en vez de leerla de @central/module-seguros`,
    )
    assert.ok(!src.includes(MEDIADOR.identidad.nif), `/legal/${pagina} lleva el NIF escrito a mano`)
    assert.match(src, /@central\/module-seguros/, `/legal/${pagina} no lee la fuente única`)
  }
})

test('las paginas legales se leen SIN sesion', () => {
  // Si una pide sesión, el cliente no puede leer la política de privacidad
  // antes de darnos su correo, que es justo cuando la necesita.
  for (const pagina of PAGINAS) {
    const src = leer(`app/legal/${pagina}/page.tsx`)
    assert.ok(!/getIdentidad|exigirIdentidad|from '@\/lib\/session'/.test(src), `/legal/${pagina} exige sesión`)
  }
  const layout = leer('app/legal/layout.tsx')
  assert.ok(!/from '@\/lib\/session'/.test(layout), 'el layout legal exige sesión')
})

test('el aviso de cookies sigue siendo cierto: una cookie y ningun tercero', () => {
  // La página de cookies AFIRMA que no hay analítica ni scripts de terceros, y
  // por eso no lleva banner (art. 22.2 LSSI exime solo a las necesarias).
  // Encender cualquier cosa de esas convierte ese texto en una infracción
  // documentada, así que se rompe aquí antes de llegar a producción.
  const fuentes: string[] = []
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(join(PORTAL, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entrada.name}`
      if (entrada.isDirectory()) recorrer(rel)
      else if (/\.tsx?$/.test(entrada.name) && !entrada.name.endsWith('.test.ts')) fuentes.push(rel)
    }
  }
  recorrer('app')
  recorrer('lib')

  // Las propias páginas legales quedan fuera del barrido: nombran a PostHog y a
  // Google Analytics justamente para decir que NO están, y prohibirles la
  // palabra obligaría a escribir el aviso en vago.
  for (const rel of fuentes.filter((r) => !r.startsWith('app/legal/'))) {
    const src = leer(rel)
    assert.ok(
      !/posthog|googletagmanager|gtag\(|google-analytics|hotjar|clarity\.ms|facebook\.net/i.test(src),
      `${rel} mete analítica o un tercero, pero /legal/cookies dice que no hay ninguno`,
    )
  }

  // Y una sola cookie propia: la de sesión.
  const nombres = new Set<string>()
  for (const rel of fuentes) {
    for (const m of leer(rel).matchAll(/cookies\(\)\s*\.\s*set\(\s*['"]([^'"]+)['"]/g)) nombres.add(m[1])
    for (const m of leer(rel).matchAll(/cookies\.set\(\s*['"]([^'"]+)['"]/g)) nombres.add(m[1])
  }
  for (const nombre of nombres) {
    assert.equal(nombre, 'asegura_portal_session', `cookie ${nombre} no declarada en /legal/cookies`)
  }
})

test('las condiciones avisan de que el parte NO es la comunicacion a la compania', () => {
  // El único daño grave que esta app puede causar sola: que alguien crea haber
  // dado el parte y se le pase el plazo del art. 16 LCS.
  const src = leer('app/legal/condiciones/page.tsx')
  assert.match(src, /art\. 16/, 'falta la referencia al plazo del art. 16 LCS')
  assert.match(src, /siete días/, 'no se dice el plazo en días')
  assert.match(src, /legal-destacado/, 'el aviso del plazo no está destacado: se lee como un párrafo más')
})

test('la politica de privacidad declara la salida del documento a un tercero', () => {
  // Los PDFs que sube el asegurado los lee un modelo de lenguaje vía OpenRouter,
  // que puede estar fuera del EEE. Es el tratamiento más sensible de la app: si
  // desaparece del texto, deja de estar informado.
  const src = leer('app/legal/privacidad/page.tsx')
  assert.match(src, /OpenRouter/)
  assert.match(src, /Espacio Económico Europeo/)
  // Y la alternativa real, porque informar sin dar salida no sirve de nada.
  assert.match(src, /a mano/, 'no se dice que se puede declarar la póliza sin subir el documento')
})
