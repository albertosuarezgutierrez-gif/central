/* eslint-disable @typescript-eslint/no-explicit-any */
// Marca editable por el dueño: colores con contraste AA, defaults de MARCA_TALLERES_G2 y sello «con Grupo ASegura» FIJO.
// Cepo visto fallar el 04/11/2026: en resolverMarca pasar `sello: personalizada.sello` (o leer cualquier otro campo): rojo en
// 'el sello no es editable'. Restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARCA_TALLERES_G2 } from '@central/brand'
import { AA_TEXTO, contraste, evaluarMarca, inkSobreClaro, normalizarHex, textoSobre } from '../lib/contraste.ts'
import { coloresPorDefecto, fondosMarca, resolverMarca, selloFijo } from '../lib/marca.ts'
import { ErrorMarca, guardarColores, guardarLogoRuta, leerMarcaGuardada } from '../lib/marca-repo.ts'
import { montar, T } from './_escenario.ts'

test('contraste: blanco/negro = 21:1 y el cálculo coincide con WCAG', () => {
  assert.equal(Math.round(contraste('#000000', '#ffffff')), 21)
  assert.ok(contraste('#8ffa09', '#0a0a0a') > 13, 'lima sobre negro (G2) ≈ 14')
  assert.ok(contraste('#8ffa09', '#ffffff') < 1.5, 'lima sobre blanco no sirve de texto')
})

test('hex: solo #rrggbb; se normaliza; basura → null', () => {
  assert.equal(normalizarHex('  #3364EE '), '#3364ee')
  assert.equal(normalizarHex('3364ee'), '#3364ee')
  for (const mal of ['#fff', 'rojo', '#12345', '#gggggg', '', null, 42]) assert.equal(normalizarHex(mal), null, String(mal))
})

test('el color principal que NO cumple AA como texto avisa, y se deriva una variante legible', () => {
  const ev = evaluarMarca({ primario: '#8ffa09', secundario: '#0a0a0a' }, fondosMarca())
  assert.equal(ev.ok, false)
  assert.ok(ev.avisos.some((a) => a.includes('color principal') && a.includes('AA')), ev.avisos.join('|'))
  const ink = inkSobreClaro('#8ffa09', MARCA_TALLERES_G2.paleta.fondo)
  assert.ok(contraste(ink, MARCA_TALLERES_G2.paleta.fondo) >= AA_TEXTO)
  assert.equal(textoSobre('#8ffa09'), '#0a0a0a')
})

test('un par que sí cumple no avisa de nada', () => {
  const ev = evaluarMarca({ primario: '#3364ee', secundario: '#3364ee' }, fondosMarca())
  assert.deepEqual(ev, { ok: true, avisos: [] })
})

test('sin personalizar → exactamente los valores por defecto de MARCA_TALLERES_G2', () => {
  const m = resolverMarca(T)
  assert.equal(m.marca, MARCA_TALLERES_G2)
  assert.equal(m.logoUrl, MARCA_TALLERES_G2.logos.lockup)
  assert.deepEqual(coloresPorDefecto(), { primario: MARCA_TALLERES_G2.paleta.primario, secundario: MARCA_TALLERES_G2.paleta.acento })
})

test('personalizada: colores y logo del taller, con tokens legibles; el resto de la marca no cambia', () => {
  const m = resolverMarca(T, { primario: '#1d3fa8', secundario: '#c0392f', logoUrl: 'https://x/logo.png' })
  assert.equal(m.marca.paleta.primario, '#1d3fa8')
  assert.equal(m.marca.paleta.acento, '#c0392f')
  assert.equal(m.marca.paleta.sobrePrimario, textoSobre('#1d3fa8'))
  assert.ok(contraste(m.marca.paleta.primarioInk, m.marca.paleta.fondo) >= AA_TEXTO)
  assert.ok(contraste(m.marca.paletaOscura!.primarioInk ?? '#000000', m.marca.paletaOscura!.fondo ?? '#000000') >= AA_TEXTO)
  assert.equal(m.logoUrl, 'https://x/logo.png')
  assert.equal(m.nombre, MARCA_TALLERES_G2.nombre)
  assert.deepEqual(m.marca.tipografia, MARCA_TALLERES_G2.tipografia)
})

test('el sello «con Grupo ASegura» no es editable: ni por la marca personalizada ni por Ajustes', () => {
  const fijo = selloFijo()
  assert.equal(fijo?.texto, 'con Grupo ASegura')
  assert.deepEqual(fijo, { texto: MARCA_TALLERES_G2.coMarca!.texto, color: MARCA_TALLERES_G2.coMarca!.color, colorOscuro: MARCA_TALLERES_G2.coMarca!.colorOscuro, fuente: MARCA_TALLERES_G2.coMarca!.fuente, fontsHref: MARCA_TALLERES_G2.coMarca!.googleFontsHref })
  // Aunque alguien cuele campos extra (JSON del navegador, BD manipulada), el sello sale idéntico.
  const hack = { primario: '#1d3fa8', secundario: null, logoUrl: null, sello: { texto: 'otro' }, coMarca: { texto: 'otro' }, nombre: 'Otro' } as any
  const m = resolverMarca(T, hack)
  assert.deepEqual(m.sello, fijo)
  assert.equal(m.nombre, MARCA_TALLERES_G2.nombre)
  assert.deepEqual(m.marca.coMarca, MARCA_TALLERES_G2.coMarca)
  // Código: las acciones de Ajustes no aceptan nada del sello, y la cabecera lo toma de selloFijo().
  const acc = readFileSync(join(import.meta.dirname, '..', 'app', 'ajustes', 'acciones.ts'), 'utf8')
  assert.ok(!/sello|coMarca/i.test(acc), 'Ajustes no puede tocar el sello')
  assert.ok(!/sello|coMarca/i.test(readFileSync(join(import.meta.dirname, '..', 'lib', 'marca-repo.ts'), 'utf8')))
  assert.match(readFileSync(join(import.meta.dirname, '..', 'app', '_sello.tsx'), 'utf8'), /selloFijo\(\)/)
})

test('guardar colores: se normalizan, se auditan antes/después y devuelven los avisos de contraste', async () => {
  const m = montar()
  m.bd.sembrar('configuracion', { tallerId: T })
  const ev = await m.conTaller(T, (tx: any) => guardarColores(tx, { tallerId: T, usuarioId: m.dueno.id, primario: '#8FFA09', secundario: null }))
  assert.ok(ev.avisos.length > 0, 'el lima no cumple AA como texto: avisa')
  const g = await m.conTaller(T, (tx: any) => leerMarcaGuardada(tx, T))
  assert.deepEqual(g, { primario: '#8ffa09', secundario: null, logoRuta: null })
  const a = m.bd.filas('auditoria').find((x) => x.accion === 'ajustes:marca_colores')
  assert.deepEqual(a.antes, { primario: null, secundario: null })
  assert.deepEqual(a.despues, { primario: '#8ffa09', secundario: null })
})

test('color inválido: error y NO se guarda nada', async () => {
  const m = montar()
  m.bd.sembrar('configuracion', { tallerId: T, marcaColorPrimario: '#111111' })
  await assert.rejects(m.conTaller(T, (tx: any) => guardarColores(tx, { tallerId: T, usuarioId: m.dueno.id, primario: 'azul', secundario: null })), ErrorMarca)
  assert.equal(m.bd.filas('configuracion')[0].marcaColorPrimario, '#111111')
})

test('logo: la ruta se guarda y se audita; null vuelve al logo por defecto; un taller no lee la marca de otro', async () => {
  const m = montar()
  m.bd.sembrar('configuracion', { tallerId: T })
  await m.conTaller(T, (tx: any) => guardarLogoRuta(tx, { tallerId: T, usuarioId: m.dueno.id, ruta: `${T}/marca/logo-abc.png` }))
  assert.equal((await m.conTaller(T, (tx: any) => leerMarcaGuardada(tx, T))).logoRuta, `${T}/marca/logo-abc.png`)
  assert.equal((await m.conTaller('00000000-0000-4000-8000-000000000002', (tx: any) => leerMarcaGuardada(tx, T))).logoRuta, null, 'RLS')
  await m.conTaller(T, (tx: any) => guardarLogoRuta(tx, { tallerId: T, usuarioId: m.dueno.id, ruta: null }))
  assert.equal((await m.conTaller(T, (tx: any) => leerMarcaGuardada(tx, T))).logoRuta, null)
})

test('Ajustes → marca: solo el dueño (comoDueno) y el logo se valida por sus bytes', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'app', 'ajustes', 'acciones.ts'), 'utf8')
  for (const f of ['guardarMarcaColores', 'subirLogo', 'quitarLogo']) {
    assert.match(src, new RegExp(`export async function ${f}[\\s\\S]*?comoDueno\\(`), f)
  }
  assert.match(src, /mimeReal\(bytes\)/)
})
