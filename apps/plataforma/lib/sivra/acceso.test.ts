import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESO, bloqueAcceso, codigosQueFaltan,
  fotosDeAcceso, pasosQuePrometenFotoSinTenerla, HOST_FOTOS_ACCESO,
} from './acceso.ts'

const PISOS = ['prop_duplex_center', 'prop_house_sevillana', 'prop_luxury_busto', 'prop_busto_reform']

test('los cuatro pisos están definidos con dirección, mapa y pasos', () => {
  for (const p of PISOS) {
    const a = ACCESO[p]
    assert.ok(a, p)
    assert.ok(a.direccion.length > 10, `${p}: dirección`)
    assert.ok(a.mapaPiso.startsWith('https://'), `${p}: mapa`)
    assert.ok(a.pasos.length >= 3, `${p}: pasos`)
    for (const f of a.fotos) assert.ok(f.startsWith('https://'), `${p}: foto ${f}`)
  }
})

test('sin códigos: el bloque de 7 días no contiene marcadores sin rellenar ni códigos reales', () => {
  for (const p of PISOS) {
    const b = bloqueAcceso(p, { portal: '1111', caja: '2222' }, { conCodigos: false })
    assert.ok(!b.includes('{PORTAL}') && !b.includes('{CAJA}'), p)
    // Aunque los códigos vengan, la versión de 7 días NO los enseña (dos tiempos).
    assert.ok(!b.includes('1111') && !b.includes('2222'), p)
    assert.ok(b.includes('víspera'), `${p}: anuncia cuándo llegan los códigos`)
  }
})

test('con códigos: el bloque de víspera los contiene, y un NULL se declara sin inventar', () => {
  const con = bloqueAcceso('prop_luxury_busto', { portal: '2022#', caja: '2232', wifiSsid: 'red-x', wifiPass: 'pw' }, { conCodigos: true })
  assert.ok(con.includes('2022#') && con.includes('2232'))
  assert.ok(con.includes('red-x') && con.includes('pw'))
  const sinCaja = bloqueAcceso('prop_luxury_busto', { portal: '2022#', caja: null }, { conCodigos: true })
  assert.ok(sinCaja.includes('te lo confirmamos hoy mismo'))
  assert.ok(!sinCaja.includes('{CAJA}'))
})

test('el Dúplex avisa de que las llaves están FUERA, antes de la dirección de entrada', () => {
  const b = bloqueAcceso('prop_duplex_center', { caja: '0000' }, { conCodigos: true })
  assert.ok(b.includes('Javier Lasso de la Vega'))
  assert.ok(b.includes('NO están en el apartamento'))
  assert.ok(b.indexOf('MUY IMPORTANTE') < b.indexOf('CÓMO ENTRAR'))
})

test('codigosQueFaltan declara exactamente lo que el piso necesita y no tiene', () => {
  assert.deepEqual(codigosQueFaltan('prop_luxury_busto', { portal: null, caja: '2232' }), ['código del portal'])
  assert.deepEqual(codigosQueFaltan('prop_duplex_center', { caja: null }), ['código de la caja de llaves'])
  // House no usa {CAJA}: solo teclado del portal.
  assert.deepEqual(codigosQueFaltan('prop_house_sevillana', { portal: '987654#' }), [])
  assert.deepEqual(codigosQueFaltan('piso_inexistente', {}), [])
})

// ── La atadura a Smoobu que NO se ve (04/09/2026) ────────────────────────────────────────────────
// Alberto preguntó si se pueden quitar las plantillas de Smoobu en los dos pisos de Bustos Tavera.
// Los PASOS ya no dependen de Smoobu (texto plano), pero las FOTOS sí: viven en su CDN. Y el fallo
// del día que se apague es silencioso — el mensaje sale con el enlace roto y el huésped se planta
// ante las DOS cajas idénticas del portal sin saber cuál es la suya.

test('toda foto de las indicaciones sale del host declarado, y ninguna es http a pelo', () => {
  const fotos = fotosDeAcceso()
  assert.ok(fotos.length > 0, 'sin fotos el inventario no vigila nada: el extractor está roto')
  for (const f of fotos) {
    assert.ok(f.url.startsWith('https://'), `${f.propertyId} paso ${f.paso}: ${f.url} no es https`)
    assert.ok(
      new URL(f.url).host === HOST_FOTOS_ACCESO,
      `${f.propertyId} paso ${f.paso}: host ${new URL(f.url).host} ≠ ${HOST_FOTOS_ACCESO}. ` +
        'Si se han migrado a un almacén propio, actualiza HOST_FOTOS_ACCESO — que sea un cambio consciente.',
    )
  }
})

test('los dos pisos de Bustos Tavera enseñan la foto que desambigua SU caja', () => {
  // Las dos cajas GRIFEMA del portal son idénticas y están una encima de otra: sin la foto con el
  // círculo rojo, «la de arriba» / «la de abajo» es una instrucción que el huésped no puede
  // verificar en la puerta. Cada piso debe llevar SU propia foto, no la del vecino.
  // Se compara por el ID de la imagen, no por la URL entera: el CDN sirve la MISMA foto desde
  // rutas distintas (`/summernote/4/4/0/.../x.jpeg` y `/summernote/7/b/d/.../x.jpeg`), así que
  // comparar rutas daría por «propia» una foto que es la del vecino con otro camino. Es el fallo
  // de agrupar por la etiqueta en vez de por la identidad, aplicado a un archivo.
  const idFoto = (u: string) => (u.split('/').pop() || u)
  const porPiso = (id: string) => fotosDeAcceso().filter(f => f.propertyId === id).map(f => idFoto(f.url))
  const luxury = porPiso('prop_luxury_busto')
  const reform = porPiso('prop_busto_reform')
  assert.ok(luxury.length >= 2, 'Luxury Busto: faltan fotos en sus pasos')
  assert.ok(reform.length >= 2, 'Busto Reform: faltan fotos en sus pasos')
  const soloDeUno = (a: string[], b: string[]) => a.filter(u => !b.includes(u))
  assert.ok(soloDeUno(luxury, reform).length > 0, 'Luxury no tiene ninguna foto propia: usaría la de Reform')
  assert.ok(soloDeUno(reform, luxury).length > 0, 'Busto Reform no tiene ninguna foto propia: usaría la de Luxury')
})

test('ningún paso manda mirar una foto que no está', () => {
  const rotos = pasosQuePrometenFotoSinTenerla()
  assert.deepEqual(
    rotos, [],
    'estos pasos dicen «en esta foto» / «la señalada en rojo» sin llevar imagen: ' +
      rotos.map(r => `${r.propertyId}#${r.paso}`).join(', '),
  )
})
