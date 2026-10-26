import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hrefDeVista,
  pestanasPortal,
  seccionActiva,
  SUBVISTAS_SEGUROS,
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

test('el menú son CINCO entradas, en orden, y solo «Seguros» apunta a una vista de la bóveda', () => {
  // Eran 9 en el módulo (y 12 en pantalla) hasta el 26/10/2026: Alberto decidió Inicio · Seguros · Herramientas ·
  // Contactos · Cuenta. Mi QR, Recibos y Siniestros pasan DENTRO de Seguros (`SUBVISTAS_SEGUROS`); Recordatorios a
  // Herramientas (el calendario); Datos y Configuración a Cuenta.
  const p = pestanasPortal()
  assert.equal(p.length, 5)
  assert.deepEqual(p.map((x) => x.etiqueta), ['Inicio', 'Seguros', 'Herramientas', 'Contactos', 'Cuenta'])
  assert.deepEqual(p.map((x) => x.href), ['/inicio', '/boveda', '/herramientas', '/autorizaciones', '/cuenta'])
  assert.deepEqual(p.map((x) => x.vista), [null, 'seguros', null, null, null])
  assert.equal(vistaDeBoveda('datos'), 'datos')
  assert.equal(vistaDeBoveda('hoja'), 'hoja')
})

test('las sub-vistas de Seguros son Seguros, Recibos, Siniestros y Mi QR, y todas pertenecen a esa entrada', () => {
  assert.deepEqual(SUBVISTAS_SEGUROS.map((s) => s.etiqueta), ['Seguros', 'Recibos', 'Siniestros', 'Mi QR'])
  const seguros = pestanasPortal().find((x) => x.id === 'seguros')!
  for (const s of SUBVISTAS_SEGUROS) assert.ok(seguros.vistas.includes(s.vista), s.vista)
})

test('🚨 el id de la vista de siniestros NO cambia al cambiar su etiqueta', () => {
  // La etiqueta pasó de «Un siniestro» a «Siniestros» el 07/09/2026 porque la
  // pestaña dejó de ser solo el formulario. Si de paso hubiera cambiado el id,
  // los `?vista=siniestro` que ya existen —un correo, un marcador— caerían en
  // `seguros` por el comportamiento de `vistaDeBoveda()`: sin error, sin aviso
  // y sin que nadie se entere.
  assert.equal(vistaDeBoveda('siniestro'), 'siniestro')
  const s = SUBVISTAS_SEGUROS.find((x) => x.etiqueta === 'Siniestros')
  assert.equal(s?.vista, 'siniestro')
  assert.equal(hrefDeVista('siniestro'), '/boveda?vista=siniestro')
})

test('no hay dos pestañas que se lean como la misma cosa', () => {
  // 🚨 El cepo que nace del 05/09/2026. Alberto, mirando su portal: «mis seguros
  // y mis pólizas es lo mismo». Y lo era —de leerlas—: en castellano «seguros» y
  // «pólizas» son sinónimos, así que la barra ofrecía dos puertas que prometían
  // lo mismo. No basta con que las etiquetas sean distintas como cadenas: no
  // pueden competir por la misma palabra.
  const etiquetas = pestanasPortal().map((p) => p.etiqueta.toLowerCase())
  assert.equal(new Set(etiquetas).size, etiquetas.length, 'dos pestañas con la misma etiqueta')
  // 24/10/2026: «Inicio» no puede leerse como «Mi resumen» (el resumen anual para la renta, fuera de esta lista).
  assert.ok(!etiquetas.some((e) => e.includes('resumen')), '«Inicio» no es «Mi resumen»: no se llaman igual')
  for (const sinonimos of [['seguro', 'póliza'], ['siniestro', 'parte'], ['inicio', 'portada', 'principal']]) {
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

test('todo panel declarado cuelga de UNA entrada del menú, y ninguna entrada reclama un panel que no existe', () => {
  // El cepo que importa: añadir una vista a `VISTAS_BOVEDA` sin colgarla de una entrada deja una pantalla a la que
  // no se llega desde ningún sitio, y quitar la vista sin quitarla de la entrada deja una referencia muerta. Los dos
  // fallos son mudos. Y una vista en DOS entradas marcaría dos secciones activas a la vez.
  const reclamadas = pestanasPortal().flatMap((p) => [...p.vistas])
  assert.deepEqual([...reclamadas].sort(), [...VISTAS_BOVEDA].sort())
})

test('el href de la entrada que apunta a una vista coincide con hrefDeVista', () => {
  // Si divergen, la entrada activa no se marcaría como activa.
  for (const p of pestanasPortal()) {
    if (p.vista !== null) assert.equal(p.href, hrefDeVista(p.vista))
  }
})

test('seccionActiva: cada ruta y cada vista caen en UNA entrada del menú', () => {
  assert.equal(seccionActiva('/inicio'), 'inicio')
  assert.equal(seccionActiva('/boveda'), 'seguros')
  assert.equal(seccionActiva('/boveda', 'recibos'), 'seguros')
  assert.equal(seccionActiva('/boveda', 'siniestro'), 'seguros')
  assert.equal(seccionActiva('/boveda', 'hoja'), 'seguros')
  assert.equal(seccionActiva('/boveda', 'recordatorios'), 'herramientas')
  assert.equal(seccionActiva('/boveda', 'datos'), 'cuenta')
  assert.equal(seccionActiva('/boveda', 'basura'), 'seguros')
  assert.equal(seccionActiva('/boveda/poliza/abc'), 'seguros')
  assert.equal(seccionActiva('/herramientas'), 'herramientas')
  assert.equal(seccionActiva('/patrimonio/inmueble/1'), 'herramientas')
  assert.equal(seccionActiva('/flota'), 'herramientas')
  assert.equal(seccionActiva('/resumen'), 'herramientas')
  assert.equal(seccionActiva('/autorizaciones'), 'contactos')
  assert.equal(seccionActiva('/configuracion'), 'cuenta')
  assert.equal(seccionActiva('/cuenta'), 'cuenta')
  assert.equal(seccionActiva('/legal/privacidad'), null)
  // Un prefijo parecido no cuenta: `/flotante` no es `/flota`.
  assert.equal(seccionActiva('/flotante'), null)
})
