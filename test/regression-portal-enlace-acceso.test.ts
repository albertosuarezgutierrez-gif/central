// Guardián del enlace de un clic del correo de acceso al portal del cliente.
//
// El enlace es una COMODIDAD sobre el código de un solo uso, nunca un segundo
// mecanismo de identidad. Las tres formas de romperlo, que es lo que se vigila:
//
//  1. Que el enlace CANJEE con un GET. Los escáneres antivirus del correo y el
//     prefetch de los clientes visitan los enlaces antes que la persona: el
//     código saldría `ya_usado` y parecería culpa del usuario.
//  2. Que se invente un dominio cuando no hay ninguno configurado. El correo
//     saldría igual y el usuario aterrizaría en ningún sitio.
//  3. Que el enlace vaya por `http`, con el código de acceso en claro por la red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { enlaceDeAcceso } from '../apps/asegura-portal/lib/enlace-acceso.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const conEnv = <T,>(valor: string | undefined, fn: () => T): T => {
  const antes = process.env.PORTAL_PUBLIC_URL
  if (valor === undefined) delete process.env.PORTAL_PUBLIC_URL
  else process.env.PORTAL_PUBLIC_URL = valor
  try {
    return fn()
  } finally {
    if (antes === undefined) delete process.env.PORTAL_PUBLIC_URL
    else process.env.PORTAL_PUBLIC_URL = antes
  }
}

test('sin dominio configurado NO se inventa un enlace', () => {
  assert.equal(conEnv(undefined, () => enlaceDeAcceso('a@b.com', '123456')), null)
  assert.equal(conEnv('   ', () => enlaceDeAcceso('a@b.com', '123456')), null)
})

test('un dominio que no es una URL valida no produce enlace', () => {
  assert.equal(conEnv('no-es-una-url', () => enlaceDeAcceso('a@b.com', '123456')), null)
})

test('http NO vale: el codigo de acceso no viaja en claro', () => {
  assert.equal(conEnv('http://portal.example', () => enlaceDeAcceso('a@b.com', '123456')), null)
})

test('con https se construye el enlace con destino y codigo escapados', () => {
  const url = conEnv('https://portal.example', () => enlaceDeAcceso('a+b@ejemplo.com', '123456'))
  assert.ok(url)
  const u = new URL(url)
  assert.equal(u.origin, 'https://portal.example')
  assert.equal(u.pathname, '/')
  assert.equal(u.searchParams.get('d'), 'a+b@ejemplo.com')
  assert.equal(u.searchParams.get('c'), '123456')
})

test('el enlace NO canjea el codigo: no hay ruta GET que abra sesion', () => {
  const src = leer('apps/asegura-portal/app/page.tsx')
  // La pantalla lee los parámetros y los pre-rellena, pero el canje sigue
  // siendo el POST que dispara la persona.
  assert.match(src, /searchParams|URLSearchParams/, 'la pantalla lee el enlace')
  assert.match(src, /replaceState/, 'el código no se queda en la barra ni en el historial')
  assert.doesNotMatch(
    src,
    /useEffect\([^)]*\)\s*=>\s*\{[^}]*verificar\(\)/s,
    'el enlace no puede canjear solo al abrirse',
  )
})

test('el correo manda el codigo aunque no haya enlace', () => {
  // El enlace es opcional; el código es el mecanismo. Nunca al revés.
  const src = leer('apps/asegura-portal/lib/canal-email.ts')
  assert.match(src, /Tu código para entrar/, 'el texto del correo lleva siempre el código')
})
