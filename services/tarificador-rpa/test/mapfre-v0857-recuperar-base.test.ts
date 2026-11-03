// Mapfre auto v0.8.57 · diálogo inesperado al elegir una variante BASICar + recuperación del estado base antes del proyecto.
// Fixtures SINTÉTICAS (sin PII): nada de datos reales.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { avisoDialogoVarianteMapfre, clasificarDialogoVarianteMapfre, mapfreAuto, tarificarVariantesComercialesMapfre, type ProductoVistoMapfre, type TarjetaLeidaMapfre } from '../src/adapters/mapfre/auto.ts'
import { ErrorSelectorComercialAlteradoMapfre } from '../src/guard.ts'

test('v0.8.57 · versión', () => assert.equal(mapfreAuto.version, '0.8.60'))

const OPC = ['TERCEROS', 'TERCEROS AMPLIADO', 'BASICar TERCEROS AMPLIADO']
const vistos = (): ProductoVistoMapfre[] => [
  { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: OPC, seleccionada: 'TERCEROS' } },
  { producto: 'TERCEROS AMPLIADO', prima: 355.07, deshabilitado: false, texto: '', comercial: { opciones: OPC, seleccionada: 'TERCEROS AMPLIADO' } },
]
const base = (): TarjetaLeidaMapfre[] => [{ valor: 'TERCEROS', prima: 'PRIMA TOTAL: 238,37 €' }, { valor: 'TERCEROS AMPLIADO', prima: 'PRIMA TOTAL: 355,07 €' }]
const sinImporte = (): TarjetaLeidaMapfre[] => [{ valor: 'TERCEROS', prima: '' }, { valor: 'TERCEROS AMPLIADO', prima: '' }]
const ok = { valor: '', textoPrima: 'PRIMA TOTAL: 355,07 €', textoTarjeta: 'ANUAL', bloqueada: false, recalculo: 'auto' as const }
const dlg = (titulo: string, texto: string) => ({ titulo, texto, botones: ['Cerrar', 'Aceptar'] })

test('diálogo desconocido tras elegir: el aviso lleva título, texto y botones (≤200, sin PII) y las variantes se abortan', async () => {
  const v = vistos()
  let elecciones = 0
  const r = await tarificarVariantesComercialesMapfre({} as never, v, [], async (_p, _i, o) => {
    elecciones++
    if (o.startsWith('BASICar')) throw new ErrorSelectorComercialAlteradoMapfre('apareció un diálogo desconocido tras elegir la variante')
    return { ...ok, valor: o }
  }, Date.now, async () => base(), { leer: async () => [dlg('Atención', 'Revise el vehículo 1234BCD con titular a@b.es')] })
  const aviso = r.notas.find((n) => /diálogo tras elegir variante/.test(n))!
  assert.ok(aviso && aviso.length <= 200)
  assert.match(aviso, /Atención/)
  assert.match(aviso, /Cerrar\|Aceptar/)
  assert.doesNotMatch(aviso, /1234BCD|a@b\.es/)
  assert.ok(r.notas.some((n) => /ABORTADAS/.test(n)))
  assert.ok(elecciones >= 2)
  assert.equal(r.restaurado, true)
})

test('diálogo de controles técnicos tras elegir: se cierra por la puerta autorizada y la variante queda «no disponible: controles técnicos»', async () => {
  const v = vistos()
  let cerrados = 0
  const r = await tarificarVariantesComercialesMapfre({} as never, v, [], async (_p, _i, o) => {
    if (o.startsWith('BASICar')) throw new ErrorSelectorComercialAlteradoMapfre('apareció un diálogo desconocido tras elegir la variante')
    return { ...ok, valor: o, textoPrima: 'PRIMA TOTAL: 238,37 €' }
  }, Date.now, async () => base(), { leer: async () => [dlg('Resultado', 'Código 232 Controles técnicos rechazo')], cerrarControlesTecnicos: async () => { cerrados++; return '' } })
  assert.equal(cerrados, 1)
  assert.ok(!r.notas.some((n) => /ABORTADAS/.test(n)))
  assert.ok(v.some((p) => (p.variantes ?? []).some((x) => x.estado === 'bloqueada' && /controles técnicos/.test(x.motivo ?? ''))))
})

test('clasificación pura: controles técnicos, verificación de vehículo, información y desconocido', () => {
  assert.equal(clasificarDialogoVarianteMapfre(dlg('Resultado', 'Código 12 Controles técnicos')), 'controles_tecnicos')
  assert.equal(clasificarDialogoVarianteMapfre(dlg('Aviso', 'Requiere verificación de vehículo')), 'verificacion_vehiculo')
  assert.equal(clasificarDialogoVarianteMapfre(dlg('Información', 'Texto')), 'informacion')
  assert.equal(clasificarDialogoVarianteMapfre(dlg('Contratar', 'Texto')), 'desconocido')
  assert.ok(avisoDialogoVarianteMapfre([dlg('x'.repeat(300), 'y'.repeat(300))]).length <= 200)
})

test('RECUPERACIÓN: tarjetas sin importe tras restaurar → se pide el original de nuevo y, con importes de vuelta, se permite generar el proyecto', async () => {
  const v = vistos()
  let lecturas = 0
  let originalesPedidos = 0
  const r = await tarificarVariantesComercialesMapfre({} as never, v, [], async (_p, _i, o) => {
    if (o.startsWith('BASICar')) throw new ErrorSelectorComercialAlteradoMapfre('apareció un diálogo desconocido tras elegir la variante')
    originalesPedidos++
    return { ...ok, valor: o, textoPrima: '' } // la restauración no confirma (sin importe)
  }, Date.now, async () => (++lecturas <= 2 ? sinImporte() : base()), { leer: async () => [dlg('Otro', 'texto')] })
  assert.ok(originalesPedidos >= 2)
  assert.equal(r.restaurado, true)
  assert.ok(r.notas.some((n) => /estado base recuperado: productos e importes originales/.test(n)))
})

test('RECUPERACIÓN: productos originales pero sin importes → se genera igualmente (nunca peor que la 0.8.55) con aviso', async () => {
  const r = await tarificarVariantesComercialesMapfre({} as never, vistos(), [], async (_p, _i, o) => {
    if (o.startsWith('BASICar')) throw new ErrorSelectorComercialAlteradoMapfre('apareció un diálogo desconocido tras elegir la variante')
    return { ...ok, valor: o, textoPrima: '' }
  }, Date.now, async () => sinImporte())
  assert.equal(r.restaurado, true)
  assert.ok(r.notas.some((n) => /NO en importes/.test(n)))
})

test('CEPO: sin productos originales a la vista NO se recupera ni se genera el proyecto', async () => {
  const r = await tarificarVariantesComercialesMapfre({} as never, vistos(), [], async (_p, _i, o) => {
    if (o.startsWith('BASICar')) throw new ErrorSelectorComercialAlteradoMapfre('apareció un diálogo desconocido tras elegir la variante')
    return { ...ok, valor: 'BASICar TERCEROS AMPLIADO', textoPrima: '' }
  }, Date.now, async () => [{ valor: 'BASICar TERCEROS AMPLIADO', prima: '' }, { valor: 'TERCEROS AMPLIADO', prima: '' }])
  assert.equal(r.restaurado, false)
})

test('guardián: mapfre/auto.ts no pulsa ni nombra «Continuar» fuera de strings/comentarios', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/adapters/mapfre/auto.ts'), 'utf8')
  const codigo = src.split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')).join('\n')
  assert.doesNotMatch(codigo.replace(/\/\*[\s\S]*?\*\//g, ''), /Continuar/)
})
