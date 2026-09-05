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
  // 📌 El formulario se movió de `app/page.tsx` a `app/Entrada.tsx` el
  // 05/09/2026, cuando la raíz pasó a ser un componente de SERVIDOR que mira si
  // ya hay sesión. El cepo sigue al fichero; si un día vuelve a `page.tsx`, el
  // `leer()` falla y se entera alguien.
  const src = leer('apps/asegura-portal/app/Entrada.tsx')
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

test('la RAIZ mira si ya hay sesion antes de pedir nada', () => {
  // 🚨 El cepo del 05/09/2026. `/` era el formulario de cliente y no miraba la
  // cookie: quien ya había entrado veía otra vez «Enviarme un código» con su
  // sesión de 30 días viva, y la conclusión razonable era «me lo pide cada
  // vez». No fallaba nada — la puerta no preguntaba quién eras. Es además lo
  // que hace innecesario un enlace mágico que canjee solo.
  const src = leer('apps/asegura-portal/app/page.tsx')
  assert.doesNotMatch(src, /^'use client'/m, 'la raíz tiene que resolverse en el servidor para leer la cookie')
  assert.match(src, /getIdentidad\(\)/, 'la raíz resuelve la sesión por la puerta única')
  assert.match(src, /redirect\(['"]\/boveda['"]\)/, 'con sesión viva se entra directo, sin pedir código')
})

test('el correo manda el codigo aunque no haya enlace', () => {
  // El enlace es opcional; el código es el mecanismo. Nunca al revés.
  const src = leer('apps/asegura-portal/lib/canal-email.ts')
  assert.match(src, /Tu código para entrar/, 'el texto del correo lleva siempre el código')
})
