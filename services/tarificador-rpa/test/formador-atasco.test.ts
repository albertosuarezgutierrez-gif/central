// F2 del plan de robustez (14/10/2026): ATASCO (checkpoint para que elija Alberto) y aprendido con confianza en la capa
// común (formador.ts). `node --test`, sin navegador: la página es un doble con un solo marco.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright'
import {
  PRESUPUESTO_RESPALDO,
  aprendidoFallido,
  campoConRespaldo,
  candidatoElegibleAtasco,
  conRespaldoIA,
  ordenarAprendido,
  ordenarParaAtasco,
  prepararFormador,
  validarCampo,
  validarResolucion,
  type Candidato,
  type ContextoFormador,
  type DescripcionElemento,
  type UsoAprendido,
} from '../src/formador.ts'
import { ErrorTarificador } from '../src/errores.ts'

const cand = (o: Partial<Candidato>): Candidato => ({ tag: 'input', id: null, name: null, type: 'text', role: null, clases: null, texto: null, etiqueta: null, marco: 'principal', ...o })

test('candidatoElegibleAtasco: una ACCIÓN solo con un texto de su fila de la tabla cerrada; nunca emisión/pago', () => {
  const p = { clave: 'calcular', tipo: 'accion' as const, textoEsperado: 'Calcular' }
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'button', type: null, texto: 'Calcular' }), p), true)
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'button', type: null, texto: 'Calcular tarifa' }), p), false, 'texto que no es EXACTO')
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'button', type: null, texto: 'Calcular', id: 'btnEmitir' }), p), false, 'emisión en el id')
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'input', type: 'text', texto: 'Calcular' }), p), false, 'un input de texto no es una acción')
  // Una acción FUERA de la tabla cerrada no se atasca nunca (Alberto no puede abrir acciones nuevas).
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'button', type: null, texto: 'Firmar' }), { clave: 'firmar', tipo: 'accion', textoEsperado: null }), false)
})

test('candidatoElegibleAtasco: un CAMPO solo editable; sin casillas, botones ni enlaces', () => {
  const p = { clave: 'superficie', tipo: 'campo' as const, textoEsperado: null }
  assert.equal(candidatoElegibleAtasco(cand({ type: 'text' }), p), true)
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'select', type: null }), p), true)
  assert.equal(candidatoElegibleAtasco(cand({ type: 'checkbox' }), p), false)
  assert.equal(candidatoElegibleAtasco(cand({ tag: 'a', type: null }), p), false)
  assert.equal(candidatoElegibleAtasco(cand({ type: 'text', name: 'importe_pagar' }), p), false, 'palabra de pago en el name')
})

test('ordenarParaAtasco: primero los de etiqueta más parecida, estable', () => {
  const l = [cand({ id: 'a', etiqueta: 'Año de construcción' }), cand({ id: 'b', etiqueta: 'Superficie construida m2' }), cand({ id: 'c', etiqueta: 'Otro' })]
  assert.deepEqual(ordenarParaAtasco(l, 'Superficie construida').map((c) => c.id), ['b', 'a', 'c'])
  assert.deepEqual(ordenarParaAtasco(l, null).map((c) => c.id), ['a', 'b', 'c'])
})

const desc: DescripcionElemento = {
  coincidencias: 1, visible: true, tag: 'input', type: 'text', role: null, texto: null, valorBoton: null, title: null, ariaLabel: null,
  id: 'x1', name: null, href: null, onclick: null, onchange: null, formaction: null, etiquetaFila: 'Otra cosa distinta', deshabilitado: false, editableContenido: false,
}

test('elegido por Alberto (humano): un CAMPO pasa sin contraste de etiqueta, pero NO sin el resto de reglas', () => {
  assert.equal(validarCampo(desc, 'Superficie construida').ok, false, 'sin humano, el contraste manda')
  assert.deepEqual(validarCampo(desc, 'Superficie construida', { humano: true }), { ok: true })
  assert.equal(validarCampo({ ...desc, type: 'checkbox' }, 'Superficie', { humano: true }).ok, false, 'una casilla sigue fuera')
  assert.equal(validarCampo({ ...desc, id: 'emitirPoliza' }, 'Superficie', { humano: true }).ok, false, 'palabra de emisión sigue fuera')
  assert.equal(validarCampo({ ...desc, coincidencias: 2 }, 'Superficie', { humano: true }).ok, false, 'tiene que ser único')
  // Una ACCIÓN no se relaja nunca: humano solo toca validarCampo.
  const boton = { ...desc, tag: 'button', type: null, texto: 'Calcular tarifa' }
  assert.equal(validarResolucion({ tipo: 'accion', clave: 'calcular', textoEsperado: null }, boton, '', { humano: true }).ok, false)
})

test('aprendido: consolidado primero; falla lo rechazado sin confirmar y, si el trabajo cae, lo usado sin confirmar', () => {
  assert.deepEqual(ordenarAprendido([{ confirmaciones: 5 }, { confirmaciones: 1, consolidado: true }, { confirmaciones: 2 }]).map((x) => x.confirmaciones), [1, 5, 2])
  const u = (o: Partial<UsoAprendido>): UsoAprendido => ({ clave: 'k', tipo: 'campo', selector: '#a', marco: null, confirmado: false, rechazado: false, ...o })
  const usos = new Map<string, UsoAprendido>([
    ['1', u({ selector: '#rechazado', rechazado: true })],
    ['2', u({ selector: '#usado' })],
    ['3', u({ selector: '#bien', confirmado: true })],
    ['4', u({ selector: '#rechazado_luego_bien', rechazado: true, confirmado: true })],
  ])
  assert.deepEqual(aprendidoFallido(usos, 'ok').map((x) => x.selector), ['#rechazado'])
  assert.deepEqual(aprendidoFallido(usos, 'error').map((x) => x.selector), ['#rechazado', '#usado'])
  assert.deepEqual(aprendidoFallido(undefined, 'error'), [])
})

/** Página doble: un marco con estos candidatos crudos; los locators no encuentran nada. */
function paginaCon(crudos: Record<string, unknown>[]): Page {
  const marco = {
    isDetached: () => false,
    evaluate: async () => crudos,
    locator: () => ({ first: () => ({ count: async () => 0 }), count: async () => 0 }),
  }
  return { frames: () => [marco], mainFrame: () => marco } as unknown as Page
}

async function formadorActivo(): Promise<ContextoFormador> {
  const ctx = await prepararFormador({
    trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'allianz', ramo: 'comunidades', apiUrl: 'https://x', secreto: 'x'.repeat(20),
    redactar: (t) => t, log: () => undefined,
    fetchImpl: (async () => new Response(JSON.stringify({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }))) as unknown as typeof fetch,
  })
  ctx.usoIA = { consultas: PRESUPUESTO_RESPALDO.consultas, ms: 0 } // sin IA: el atasco es lo único que queda
  return ctx
}

test('conRespaldoIA sin respaldo: el error ORIGINAL y el checkpoint de ATASCO con los elegibles numerados', async () => {
  const ctx = await formadorActivo()
  const page = paginaCon([
    { tag: 'button', texto: 'Calcular', selector: '#calc' },
    { tag: 'button', texto: 'Emitir', selector: '#emi' },
    { tag: 'a', texto: 'Ayuda', selector: '#ayuda' },
  ])
  const hueco = new ErrorTarificador('portal', 'no aparece Calcular')
  await assert.rejects(() => conRespaldoIA(page, ctx, async () => { throw hueco }, { clave: 'calcular', tipo: 'accion', descripcion: 'botón Calcular', textoEsperado: 'Calcular' }), (e) => e === hueco)
  assert.equal(ctx.atasco?.clave, 'calcular')
  assert.deepEqual(ctx.atasco?.candidatos.map((c) => [c.n, c.selector]), [[1, '#calc']])
  // Un paso posterior que avanza borra el checkpoint (ya no es el que para el trabajo).
  await conRespaldoIA(page, ctx, async () => ({}) as never, { clave: 'calcular', tipo: 'accion', descripcion: '' })
  assert.equal(ctx.atasco, null)
})

test('campoConRespaldo sin respaldo: null y checkpoint; sin formador activo, ni checkpoint', async () => {
  const ctx = await formadorActivo()
  const page = paginaCon([{ tag: 'input', type: 'text', etiqueta: 'Superficie construida', selector: '#sup' }, { tag: 'input', type: 'checkbox', etiqueta: 'Sí', selector: '#chk' }])
  const raiz = { locator: () => ({ first: () => ({ count: async () => 0 }) }) } as never
  assert.equal(await campoConRespaldo(raiz, '#no', { page, formador: ctx, etiqueta: 'Superficie construida' }), null)
  assert.deepEqual(ctx.atasco?.candidatos.map((c) => c.selector), ['#sup'])
  assert.equal(ctx.atasco?.etiqueta, 'Superficie construida')
  ctx.activo = false
  ctx.atasco = null
  assert.equal(await campoConRespaldo(raiz, '#no', { page, formador: ctx, etiqueta: 'Superficie construida' }), null)
  assert.equal(ctx.atasco, null)
})

test('sin ningún candidato elegible no hay atasco (falla como antes)', async () => {
  const ctx = await formadorActivo()
  const page = paginaCon([{ tag: 'button', texto: 'Emitir', selector: '#emi' }])
  await assert.rejects(() => conRespaldoIA(page, ctx, async () => { throw new ErrorTarificador('portal', 'x') }, { clave: 'calcular', tipo: 'accion', descripcion: '' }))
  assert.equal(ctx.atasco ?? null, null)
})
