import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hrefDeVista,
  pestanasPortal,
  VISTAS_BOVEDA,
  VISTA_BOVEDA_POR_DEFECTO,
  vistaDeBoveda,
} from './vista-portal.ts'

test('sin parámetro, la vista es la de por defecto', () => {
  assert.equal(vistaDeBoveda(undefined), 'seguros')
  assert.equal(vistaDeBoveda(''), 'seguros')
})

test('cada vista declarada se reconoce', () => {
  for (const v of VISTAS_BOVEDA) assert.equal(vistaDeBoveda(v), v)
})

test('un valor desconocido cae a la vista por defecto, NO a un error', () => {
  // Un enlace viejo, un correo reenviado o una letra de menos tienen que
  // enseñar los seguros. Aquí no hay nada que proteger: lo que decide qué
  // datos se leen es la sesión, no este parámetro.
  for (const basura of ['siniestros', 'SEGUROS!', '../../etc/passwd', '<script>', '0']) {
    assert.equal(vistaDeBoveda(basura), VISTA_BOVEDA_POR_DEFECTO)
  }
})

test('tolera espacios y mayúsculas', () => {
  assert.equal(vistaDeBoveda('  SINIESTRO '), 'siniestro')
  assert.equal(vistaDeBoveda('Polizas'), 'polizas')
})

test('un parámetro repetido se queda con el primero en vez de caerse', () => {
  // Next entrega un array cuando la URL trae `?vista=a&vista=b`. Sin esto,
  // `.trim()` sobre un array lanzaría y la página entera daría error 500.
  assert.equal(vistaDeBoveda(['siniestro', 'polizas']), 'siniestro')
  assert.equal(vistaDeBoveda([]), VISTA_BOVEDA_POR_DEFECTO)
})

test('la vista por defecto se enlaza SIN parámetro', () => {
  // Si no, `/boveda` y `/boveda?vista=seguros` serían la misma pantalla con dos
  // direcciones, y la de la barra nunca casaría con la que la gente guarda.
  assert.equal(hrefDeVista('seguros'), '/boveda')
  assert.equal(hrefDeVista('siniestro'), '/boveda?vista=siniestro')
})

test('las pestañas son cuatro, en orden, y la última es otra ruta', () => {
  const p = pestanasPortal()
  assert.equal(p.length, 4)
  assert.deepEqual(
    p.map((x) => x.etiqueta),
    ['Mis seguros', 'Un siniestro', 'Mis pólizas', 'Quién me ve'],
  )
  assert.equal(p[3].vista, null)
  assert.equal(p[3].href, '/autorizaciones')
})

test('todo panel declarado tiene su pestaña, y toda pestaña de panel su vista', () => {
  // El cepo que importa: añadir una vista a `VISTAS_BOVEDA` sin ponerla en la
  // barra deja una pantalla a la que no se llega desde ningún sitio, y quitar
  // una pestaña sin quitar la vista deja una pantalla huérfana. Los dos fallos
  // son mudos.
  const conPanel = pestanasPortal().filter((p) => p.vista !== null).map((p) => p.vista)
  assert.deepEqual([...conPanel].sort(), [...VISTAS_BOVEDA].sort())
})

test('el href de cada pestaña con panel coincide con hrefDeVista', () => {
  // Si divergen, la pestaña activa no se marcaría como activa: se vería la
  // barra sin ninguna resaltada, que es peor que no tener barra.
  for (const p of pestanasPortal()) {
    if (p.vista !== null) assert.equal(p.href, hrefDeVista(p.vista))
  }
})
