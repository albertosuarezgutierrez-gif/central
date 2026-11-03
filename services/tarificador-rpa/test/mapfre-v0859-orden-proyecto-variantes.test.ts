// Mapfre auto v0.8.59 · ORDEN: primero el flujo base completo (proyecto → PDF → garantías) y DESPUÉS las variantes «BASICar».
// Run real c380133b (0.8.58): la variante no terminó su recálculo, las tarjetas quedaron SIN importe → «Proyecto NO guardado» → 0 garantías.
// Portal SIMULADO y sintético (sin PII): el proyecto solo se guarda con las primas a la vista; una variante que falla deja las tarjetas sin importe.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  AVISO_VARIANTE_SIN_GARANTIAS_MAPFRE,
  AVISO_VARIANTE_SIN_PROYECTO_MAPFRE,
  baseYLuegoVariantesMapfre,
  mapfreAuto,
  ofertasFinalesMapfre,
  type ResultadoVariantesMapfre,
} from '../src/adapters/mapfre/auto.ts'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import type { CoberturasPorProducto } from '../src/adapters/mapfre/garantias.ts'

test('v0.8.59 · versión', () => assert.equal(mapfreAuto.version, '0.8.60'))

const cob = (literal: string) => ({ clave: literal.toLowerCase(), literal, estado: 'incluida' as const, capital: null, limite: null, franquicia: null })
const PRIMAS = [
  { producto: 'TERCEROS', periodicidad: 'anual' as const, primaTotalEur: 238.37, requiereVerificacionVehiculo: false },
  { producto: 'TERCEROS AMPLIADO', periodicidad: 'anual' as const, primaTotalEur: 355.07, requiereVerificacionVehiculo: false },
]

/** Portal simulado: «Generar Proyecto» solo guarda con importes a la vista; sin proyecto no hay PDF ni garantías. */
function portalSimulado() {
  const pasos: string[] = []
  const estado = { importesALaVista: true }
  const base = async () => {
    pasos.push('proyecto')
    const generado = estado.importesALaVista
    const proyecto = generado ? { estado: 'generado' as const, numero: 'P-0001' } : { estado: 'no_generado' as const, motivo: 'no hay primas a la vista' }
    pasos.push('pdf')
    const garantiasPdf: CoberturasPorProducto = generado
      ? new Map([['terceros', { coberturas: [cob('Responsabilidad civil'), cob('Defensa jurídica')], franquicias: [] }], ['terceros ampliado', { coberturas: [cob('Responsabilidad civil'), cob('Lunas'), cob('Robo')], franquicias: [] }]])
      : new Map()
    pasos.push('garantias')
    return { proyecto, pdfProyecto: { pdf: generado ? { nombre: 'proyecto-mapfre-auto.pdf' } as never : null, aviso: generado ? null : 'PDF del proyecto no descargado' }, garantiasPdf, lineasTextoPdf: generado ? ['TERCEROS'] : [], pdfBytes: generado ? 1234 : null }
  }
  /** Variante que no termina su recálculo y deja las tarjetas sin importe (lo que pasó en c380133b). */
  const variantesQueFallan = async (): Promise<ResultadoVariantesMapfre> => {
    pasos.push('variantes')
    estado.importesALaVista = false
    throw new Error('el recálculo de la tarjeta no terminó a tiempo')
  }
  return { pasos, base, variantesQueFallan }
}

const finales = (r: Awaited<ReturnType<typeof baseYLuegoVariantesMapfre<Awaited<ReturnType<ReturnType<typeof portalSimulado>['base']>>>>>) =>
  ofertasFinalesMapfre({ primas: PRIMAS, variantes: r.variantes, avisosExtra: [], supuestos: null, diagnosticoPoliza: null, usados: { codigoPostal: null, localidad: null, vehiculo: { marca: null, modelo: null, version: null, denominacion: null } }, garantiasPantalla: new Map(), ...r.base })

test('ORDEN: proyecto → PDF → garantías ANTES de las variantes', async () => {
  const p = portalSimulado()
  await baseYLuegoVariantesMapfre(p.base, p.variantesQueFallan)
  assert.deepEqual(p.pasos, ['proyecto', 'pdf', 'garantias', 'variantes'])
})

test('CEPO c380133b: una variante que falla y deja las tarjetas sin importe NO deja 0 garantías ni el proyecto sin guardar', async () => {
  const p = portalSimulado()
  const r = await baseYLuegoVariantesMapfre(p.base, p.variantesQueFallan)
  const ofertas = finales(r)
  assert.equal(ofertas.length, 2)
  assert.ok(ofertas.every((o) => o.coberturas.length > 0), 'cada oferta base conserva sus garantías del PDF')
  assert.ok(ofertas.every((o) => o.referenciaPortal === 'P-0001'), 'proyecto guardado')
  assert.ok(ofertas.every((o) => !o.avisos.some((a) => /Proyecto NO guardado/.test(a))))
  assert.ok(r.variantes.notas.some((n) => /variantes comerciales no leídas.*no terminó a tiempo/.test(n)), 'aviso de la variante no leída')
})

test('una violación del guard en las variantes se relanza (fail-closed)', async () => {
  const p = portalSimulado()
  await assert.rejects(() => baseYLuegoVariantesMapfre(p.base, async () => { throw new EmisionBloqueadaError('fase', 'prueba') }), (e) => e instanceof EmisionBloqueadaError)
})

test('variante leída: oferta propia con su prima, SIN proyecto ni PDF del base y sin copiar las garantías del producto base', async () => {
  const p = portalSimulado()
  const r = await baseYLuegoVariantesMapfre(p.base, async () => ({ primas: [{ producto: 'BASICar TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 299.5, requiereVerificacionVehiculo: false, variante: { tarjeta: 'TERCEROS AMPLIADO' } }], garantias: new Map(), restaurado: false, notas: [] }))
  const ofertas = finales(r)
  assert.equal(ofertas.length, 3)
  const v = ofertas[2]!
  assert.equal(v.producto, 'Auto · BASICar TERCEROS AMPLIADO')
  assert.equal(v.primaAnualEur, 299.5)
  assert.equal(v.coberturas.length, 0, 'no se copian las del base')
  assert.ok(v.avisos.includes(AVISO_VARIANTE_SIN_GARANTIAS_MAPFRE))
  assert.ok(v.avisos.includes(AVISO_VARIANTE_SIN_PROYECTO_MAPFRE))
  assert.notEqual(v.referenciaPortal, 'P-0001')
  assert.ok(!v.pdf, 'el PDF del proyecto es de los productos base')
  assert.ok(ofertas.slice(0, 2).every((o) => o.coberturas.length > 0 && o.referenciaPortal === 'P-0001'), 'restaurado=false no invalida las ofertas base')
})

test('cableado: el adaptador usa baseYLuegoVariantesMapfre(flujoBase, probarVariantes) sin recuperación del estado base', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/adapters/mapfre/auto.ts'), 'utf8')
  const cuerpo = src.slice(src.indexOf('export async function precioDesdeObjetoAsegurado'), src.indexOf('export const mapfreAuto'))
  assert.match(cuerpo, /await baseYLuegoVariantesMapfre\(flujoBase, probarVariantes\)/)
  assert.match(cuerpo, /\{ recuperarBase: false \}/)
  const fn = src.slice(src.indexOf('export async function baseYLuegoVariantesMapfre'), src.indexOf('export function ofertasFinalesMapfre'))
  assert.ok(fn.indexOf('await base()') > -1 && fn.indexOf('await base()') < fn.indexOf('await variantes()'), 'base antes que variantes')
  const guard = readFileSync(join(import.meta.dirname, '../src/guard.ts'), 'utf8')
  assert.match(guard, /export const ESPERA_RECALCULO_VARIANTE_MS = 30_000/)
  assert.match(guard, /const ESPERA_RECALCULO_COMERCIAL_MS = 15_000/, 'la restauración del producto base sigue con 15 s')
})
