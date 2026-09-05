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
  assert.equal(vistaDeBoveda('Siniestro'), 'siniestro')
})

test('un parámetro repetido se queda con el primero en vez de caerse', () => {
  // Next entrega un array cuando la URL trae `?vista=a&vista=b`. Sin esto,
  // `.trim()` sobre un array lanzaría y la página entera daría error 500.
  assert.equal(vistaDeBoveda(['siniestro', 'seguros']), 'siniestro')
  assert.equal(vistaDeBoveda([]), VISTA_BOVEDA_POR_DEFECTO)
})

test('la vista por defecto se enlaza SIN parámetro', () => {
  // Si no, `/boveda` y `/boveda?vista=seguros` serían la misma pantalla con dos
  // direcciones, y la de la barra nunca casaría con la que la gente guarda.
  assert.equal(hrefDeVista('seguros'), '/boveda')
  assert.equal(hrefDeVista('siniestro'), '/boveda?vista=siniestro')
})

test('las pestañas son tres, en orden, y la última es otra ruta', () => {
  const p = pestanasPortal()
  assert.equal(p.length, 3)
  assert.deepEqual(
    p.map((x) => x.etiqueta),
    ['Mis seguros', 'Un siniestro', 'Quién me ve'],
  )
  assert.equal(p[2].vista, null)
  assert.equal(p[2].href, '/autorizaciones')
})

test('no hay dos pestañas que se lean como la misma cosa', () => {
  // 🚨 El cepo que nace del 05/09/2026. Alberto, mirando su portal: «mis seguros
  // y mis pólizas es lo mismo». Y lo era —de leerlas—: en castellano «seguros» y
  // «pólizas» son sinónimos, así que la barra ofrecía dos puertas que prometían
  // lo mismo. No basta con que las etiquetas sean distintas como cadenas: no
  // pueden competir por la misma palabra.
  const etiquetas = pestanasPortal().map((p) => p.etiqueta.toLowerCase())
  assert.equal(new Set(etiquetas).size, etiquetas.length, 'dos pestañas con la misma etiqueta')
  for (const sinonimos of [['seguro', 'póliza'], ['siniestro', 'parte']]) {
    const usadas = sinonimos.filter((raiz) => etiquetas.some((e) => e.includes(raiz)))
    assert.ok(
      usadas.length <= 1,
      `la barra usa a la vez ${usadas.join(' y ')}, que para un cliente son la misma palabra`,
    )
  }
})

test('un enlace viejo a la pestaña que ya no existe cae donde vive su contenido', () => {
  // Los `?vista=polizas` que anden por correos o guardados no pueden acabar en
  // una pantalla de fallo: las pólizas aportadas viven ahora en `seguros`, así
  // que ahí es exactamente donde tienen que aterrizar.
  assert.equal(vistaDeBoveda('polizas'), 'seguros')
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
