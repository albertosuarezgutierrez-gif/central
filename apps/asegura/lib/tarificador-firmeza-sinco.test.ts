// SINCO al tarificar (30/10/2026, regla de Alberto): firmeza del precio RPA al GUARDARLO (`guardarTarificacionRpa` de tarificador.ts).
// Fixtures SINTÉTICAS: los números de póliza son de prueba.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ofertasConFirmezaRpa, type OfertaNormalizada } from '@central/module-tarificacion'
import { aplicarPolizaAnteriorUltimos5 } from './tarificador-compania-actual.ts'

const oferta = (tecleada: boolean): OfertaNormalizada => ({
  compania: 'Compañía', producto: 'Todo riesgo', primaAnualEur: 400, primaNetaEur: null, fraccionamiento: null, importeReciboEur: null,
  coberturas: [], franquicias: [], validaHasta: null, referenciaPortal: null, pdf: null, avisos: [], ...(tecleada ? { polizaAnteriorTecleada: true as const } : {}),
})

/** Lo mismo que hace `guardarTarificacionRpa`: el riesgo ENTREGADO (Allianz auto recibe los 5 dígitos solo en la entrega). */
const firmezaAlGuardar = (compania: string, ramo: string, riesgoBd: Record<string, unknown>, numeroOportunidad: string | null, tecleada: boolean) =>
  ofertasConFirmezaRpa(compania, ramo, compania === 'allianz' && ramo === 'auto' ? aplicarPolizaAnteriorUltimos5(compania, ramo, riesgoBd, numeroOportunidad) : riesgoBd, [oferta(tecleada)])[0]!

test('🪤 Allianz auto: el nº que llegó solo en la entrega (no en BD) cuenta para la firmeza', () => {
  assert.equal(firmezaAlGuardar('allianz', 'auto', { ramo: 'auto' }, 'TEST-0000054321', true).firmeza, 'firme')
  assert.equal(firmezaAlGuardar('allianz', 'auto', { ramo: 'auto' }, null, true).firmeza, 'estimado', 'sin número en ningún sitio')
  assert.equal(firmezaAlGuardar('allianz', 'auto', { ramo: 'auto' }, 'TEST-0000054321', false).firmeza, 'estimado', 'el bot no lo tecleó')
})

test('🪤 Mapfre auto: el nº va en el riesgo de BD; Occident nunca; la señal se quita al guardar si no es firme', () => {
  assert.equal(firmezaAlGuardar('mapfre', 'auto', { ramo: 'auto', polizaAnteriorUltimos5: '00000' }, null, true).firmeza, 'firme')
  assert.equal(firmezaAlGuardar('mapfre', 'auto', { ramo: 'auto' }, 'TEST-0000054321', true).firmeza, 'estimado', 'el nº de la oportunidad solo se reconstruye para Allianz (como la entrega)')
  const occ = firmezaAlGuardar('occident', 'auto', { ramo: 'auto', polizaAnteriorUltimos5: '00000' }, null, true)
  assert.equal(occ.firmeza, 'estimado')
  assert.equal('polizaAnteriorTecleada' in occ.oferta, false)
})

test('🪤 tarificador.ts guarda la firmeza calculada (no el literal «estimado») y con el riesgo ENTREGADO', () => {
  const src = readFileSync(new URL('./tarificador.ts', import.meta.url), 'utf8')
  const tramo = src.slice(src.indexOf('async function guardarTarificacionRpa'), src.indexOf('async function guardarAdjunto'))
  assert.ok(tramo.length > 0)
  // 01/11/2026: las ofertas llevan antes el supuesto del vehículo de referencia (si lo hubo); la firmeza sigue con el riesgo ENTREGADO.
  assert.match(tramo, /ofertasConFirmezaRpa\(t\.compania, t\.ramo, riesgoEntregado, ofertasConSupuestoReferencia\(ofertas, rg\)\)/)
  assert.match(tramo, /aplicarPolizaAnteriorUltimos5\(t\.compania, t\.ramo, rg, numeroPolizaActual\)/)
  // La lectura del nº va ANTES de abrir la transacción y sin `tx` (un fallo suyo no puede abortar la tx del resultado).
  assert.doesNotMatch(tramo, /leerNumeroPolizaActual/)
  const reg = src.slice(src.indexOf('export async function registrarResultado'), src.indexOf('async function guardarTarificacionRpa'))
  const iLectura = reg.indexOf('leerNumeroPolizaActual(')
  assert.ok(iLectura > 0 && iLectura < reg.indexOf('prisma.$transaction('), 'leerNumeroPolizaActual antes de $transaction')
  assert.doesNotMatch(reg.slice(iLectura, reg.indexOf(')', iLectura)), /\btx\b|prisma as/)
  assert.match(tramo, /\$\{firmeza\}, false, \$\{o\.referenciaPortal\}/)
  assert.doesNotMatch(tramo, /'estimado', false, \$\{o\.referenciaPortal\}/)
  // Lo guardado en `respuesta.ofertas` es lo SANEADO (sin la señal si no era firme), no lo crudo del worker.
  assert.match(tramo, /const conDocs = conFirmeza\.map/)
})

test('🪤 presupuesto-rpa.ts: la opción del borrador usa la firmeza de la oferta guardada', () => {
  const src = readFileSync(new URL('./presupuesto-rpa.ts', import.meta.url), 'utf8')
  assert.match(src, /firmeza: firmezaOfertaRpaGuardada\(trabajoDe\.get\(l\.trabajoId\)\?\.compania, trabajoDe\.get\(l\.trabajoId\)\?\.ramo, l\.oferta\)/)
  assert.doesNotMatch(src, /firmeza: 'estimado'/)
})
