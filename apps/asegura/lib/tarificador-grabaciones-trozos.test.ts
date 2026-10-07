// Cepos del TROCEO de pantallas grandes del grabador (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerMapaGuardado, validarPantallaMapa, recortarHtmlParaIA, type PantallaMapa } from '@central/module-tarificacion'
import {
  PRESUPUESTO_SALIDA_TOKENS, MAX_OPCIONES_TROZO, adelgazarHtml, estimarSalidaTokens, fusionarTrozos, inyectarMarco, trocearHtmlIA, MAX_CHARS_ENTRADA_TROCEO, errorPantallaExcedeTope, esperarOla,
} from './tarificador-grabaciones-trozos.ts'
import { MAX_LLAMADAS_POR_DEFECTO, promptAnalisis, sistemaAnalisis } from './tarificador-grabaciones-reglas.ts'

/** Pantalla sintética tipo Allianz ePAC: 300 campos (un tercio selects de 80 opciones), hidden y botones, en un marco. */
function pantallaGrande(): string {
  const filas: string[] = []
  for (let i = 0; i < 300; i++) {
    if (i % 3 === 0) filas.push(`<tr><td><label for="s${i}">Campo ${i}</label></td><td><select id="s${i}" name="s${i}">${Array.from({ length: 80 }, (_, j) => `<option value="${j}">Opción número ${j}</option>`).join('')}</select></td></tr>`)
    else filas.push(`<tr><td><label for="t${i}">Campo ${i}</label></td><td><input type="text" id="t${i}" name="t${i}"><input type="hidden" name="h${i}" id="h${i}"></td></tr>`)
  }
  const botones = '<input type="button" id="b1" value="Calcular"><input type="button" id="b2" value="Emitir póliza"><button id="b3">Siguiente</button>'
  return `<html><body><div>cabecera</div><!-- tarificador:marco ruta="appArea" -->\n<form>${filas.join('')}${botones}</form></body></html>`
}

test('la pantalla grande se trocea: cada trozo cabe en el presupuesto de salida y no cruza marcos', () => {
  const html = recortarHtmlParaIA(pantallaGrande(), 400_000)
  const trozos = trocearHtmlIA(html)
  assert.ok(trozos.length >= 5 && trozos.length < MAX_LLAMADAS_POR_DEFECTO, `${trozos.length} trozos`)
  for (const t of trozos) {
    assert.ok(t.salidaEstimada <= PRESUPUESTO_SALIDA_TOKENS, `trozo de ${t.salidaEstimada} tokens estimados`)
    assert.ok(!/type="hidden"/.test(t.html), 'los hidden no llegan a la IA')
    assert.ok((t.html.match(/<option\b/g) ?? []).length <= 25 * 100, 'opciones acotadas')
    assert.ok(/^### (marco «appArea»|página principal)\n/.test(t.html))
  }
  // El HTML sin trocear pedía muchísima más salida que cualquier trozo.
  assert.ok(estimarSalidaTokens(adelgazarHtml(html)) > 3 * PRESUPUESTO_SALIDA_TOKENS)
  // Ningún control se pierde: 100 selects + 200 inputs de texto + 3 botones en total.
  const todo = trozos.map((t) => t.html).join('')
  assert.equal((todo.match(/<select\b/g) ?? []).length, 100)
  assert.equal((todo.match(/<input type="text"/g) ?? []).length, 200)
  // Y los trozos de un marco llevan su marco.
  assert.ok(trozos.some((t) => t.marco === 'appArea') && trozos.some((t) => t.marco === null))
})

test('un select no se parte y se queda en MAX_OPCIONES_TROZO opciones', () => {
  const sel = `<select id="x">${Array.from({ length: 80 }, (_, j) => `<option>O${j}</option>`).join('')}</select>`
  const r = adelgazarHtml(`<div>${sel}</div>`)
  assert.equal((r.match(/<option/g) ?? []).length, MAX_OPCIONES_TROZO)
  assert.ok(r.includes('</select>'))
  for (const t of trocearHtmlIA(`### página principal\n${sel.repeat(40)}`, 400)) {
    assert.equal((t.html.match(/<select/g) ?? []).length, (t.html.match(/<\/select>/g) ?? []).length)
  }
})

test('una pantalla pequeña sigue siendo UNA llamada', () => {
  const t = trocearHtmlIA('### página principal\n<form><input type="text" id="a"><button id="b">Siguiente</button></form>')
  assert.equal(t.length, 1)
})

test('el prompt ya no pide «marco» ni la salida larga; el servidor lo inyecta', () => {
  const s = sistemaAnalisis()
  assert.ok(!/"marco"/.test(s))
  assert.match(s, /NO incluyas «marco»/)
  assert.match(promptAnalisis({ compania: 'A', ramo: 'B', producto: null, pantalla: 1, total: 2, html: 'x', trozo: { n: 2, de: 4 } }), /Trozo 2 de 4/)
  const j = inyectarMarco({ titulo: 'x', campos: [{ etiqueta: 'a', marco: 'inventado' }], botones: [{ texto: 'b' }], primas: [] }, 'appArea') as { campos: { marco: string }[]; botones: { marco: string }[] }
  assert.equal(j.campos[0].marco, 'appArea')
  assert.equal(j.botones[0].marco, 'appArea')
})

function trozoIA(marco: string | null, botones: { texto: string; selector: string; clase: 'seguro' | 'prohibido' }[], campos = 1): PantallaMapa {
  const raw = inyectarMarco({
    titulo: 'Datos',
    campos: Array.from({ length: campos }, (_, i) => ({ etiqueta: `c${i}`, selector: `#c${i}`, tipo: 'texto', obligatorio: false, opciones: null })),
    botones: botones.map((b) => ({ ...b, funcion: null })), primas: [], notas: null,
  }, marco)
  const v = validarPantallaMapa(raw, 3)
  assert.ok(v.ok)
  return (v as { ok: true; pantalla: PantallaMapa }).pantalla
}

test('fusión: deduplica, conserva PROHIBIDOS y un trozo que lo da por seguro no lo desprohíbe', () => {
  const a = trozoIA('appArea', [{ texto: 'Emitir póliza', selector: '#b2', clase: 'prohibido' }, { texto: 'Siguiente', selector: '#b3', clase: 'seguro' }], 2)
  // El segundo trozo repite el botón de emitir como SEGURO (la IA se equivoca): el servidor lo sube de nuevo.
  const b = trozoIA('appArea', [{ texto: 'Emitir póliza', selector: '#b2', clase: 'seguro' }], 2)
  const r = fusionarTrozos(3, [a, b])
  assert.equal(r.pantalla.campos.length, 2, 'campos duplicados por marco+selector')
  const emitir = r.pantalla.botones.filter((x) => x.selector === '#b2')
  assert.equal(emitir.length, 1)
  assert.equal(emitir[0].clase, 'prohibido')
  assert.equal(r.pantalla.botones.find((x) => x.selector === '#b3')!.clase, 'seguro')
  // Aunque la fusión recibiera un botón «seguro» que casa con la regla de bloqueo, sale PROHIBIDO y forzado.
  const crudo: PantallaMapa = { ...a, botones: [{ texto: 'Contratar ahora', selector: '#z', clase: 'seguro', funcion: null, marco: null, forzado: false }] }
  const f = fusionarTrozos(3, [crudo])
  assert.equal(f.pantalla.botones[0].clase, 'prohibido')
  assert.equal(f.pantalla.botones[0].forzado, true)
  assert.equal(f.forzados, 1)
  // Cada marco es distinto: mismo selector en otro marco no se funde.
  const g = fusionarTrozos(3, [trozoIA('a', [], 1), trozoIA('b', [], 1)])
  assert.equal(g.pantalla.campos.length, 2)
})

test('la fusión de ~300 campos cabe en el mapa guardado (límites del esquema)', () => {
  const partes = Array.from({ length: 10 }, (_, k) => {
    const p = trozoIA('appArea', [], 30)
    return { ...p, campos: p.campos.map((c, i) => ({ ...c, selector: `#t${k}_${i}` })) }
  })
  const r = fusionarTrozos(3, partes)
  assert.equal(r.pantalla.campos.length, 300)
  const releido = leerMapaGuardado(JSON.parse(JSON.stringify({ version: 1, pantallas: [r.pantalla] })))
  assert.equal(releido?.pantallas[0]?.campos.length, 300)
})

test('pantalla grande: se trocea ENTERA (sin recortar a 60k antes) y el final no se pierde', () => {
  const html = recortarHtmlParaIA(pantallaGrande(), MAX_CHARS_ENTRADA_TROCEO)
  assert.ok(html.length > 60_000 && !html.includes('[recortado]'))
  assert.ok(trocearHtmlIA(html).map((t) => t.html).join('').includes('id="t299"'))
})

test('trozos > tope total: error claro y accionable; si cabe, null', () => {
  assert.match(errorPantallaExcedeTope(70, 60) ?? '', /70 trozos > tope de 60.*TARIFICADOR_GRABADOR_MAX_LLAMADAS/)
  assert.equal(errorPantallaExcedeTope(60, 60), null)
})

test('un trozo que lanza no aborta la ola: los hermanos se devuelven', async () => {
  const r = await esperarOla([Promise.resolve({ v: 1 }), Promise.reject(new Error('bd caída'))])
  assert.deepEqual(r[0], { v: 1 })
  assert.match((r[1] as { error: string }).error, /bd caída/)
})
