import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aportaAlgo, cuadroParaCorpus, revivirCuadroGuardado, tituloDeAportado, tituloDesdeTexto } from './docs-aportados-logica.ts'
import type { Carga, CuadroCargas } from '@central/module-subastas'

const carga = (extra: Partial<Carga> = {}): Carga => ({
  tipo: 'embargo',
  acreedor: 'AEAT',
  importe: 3600,
  fecha: null,
  rango: 'anterior',
  cancelada: false,
  literal: 'anotación letra C a favor de la AEAT',
  documento: null,
  ...extra,
})

const cuadro = (extra: Partial<CuadroCargas> = {}): CuadroCargas => ({
  cargas: [],
  procedimiento: 'desconocido',
  sinMasCargas: false,
  notas: [],
  fuente: 'ocr_ia',
  confianza: 0.8,
  ...extra,
})

// ── Título ──────────────────────────────────────────────────────────────────

test('el título dado manda; si no, se limpia el nombre del fichero', () => {
  assert.equal(tituloDeAportado('certificacion_cargas (2).pdf', 'Certificación de dominio y cargas'), 'Certificación de dominio y cargas')
  assert.equal(tituloDeAportado('certificacion-de-cargas.pdf'), 'certificacion de cargas')
  assert.equal(tituloDeAportado('EDICTO.PDF'), 'EDICTO')
})

test('sin nombre ni título no se inventa nada reconocible', () => {
  assert.equal(tituloDeAportado(null), 'Documento aportado')
  assert.equal(tituloDeAportado('   '), 'Documento aportado')
})

// Los fixtures son arranques de documentos REALES de SUB-JA-2026-264175
// (regla del repo: el fixture de un parser se copia del documento, no se
// escribe de memoria — el Portal los sirve como «documentoN.pdf»).
const CERTIFICACION_REAL =
  'C.S.V. : 241030258FE5E343 LUIS FRANCISCO MONREAL VIDAL, REGISTRADOR DE LA PROPIEDAD DEL DISTRITO NUMERO TRES DE SEVILLA C E R T I F I C O:'
const EDICTO_REAL =
  'Sección Civil del Tribunal de Instancia de Sevilla. Plaza nº 20 C\\ Energia Solar, 1, 41014, Sevilla. EDICTO'
const CATASTRO_REAL =
  'Consulta Domicilios Catastrales PLATAFORMA DE SERVICIOS DEL PUNTO NEUTRO JUDICIAL Datos Peticion Nº Procedimiento: 655/23 Referencia Catast'

test('el contenido identifica el documento cuando el fichero se llama «documentoN.pdf»', () => {
  // El Registro maqueta «C E R T I F I C O» con las letras separadas: el
  // fixture va LITERAL y es la regex la que lo entiende, no al revés.
  assert.equal(tituloDesdeTexto(CERTIFICACION_REAL), 'Certificación de dominio y cargas')
  assert.equal(tituloDesdeTexto(EDICTO_REAL), 'Edicto de subasta')
  assert.equal(tituloDesdeTexto(CATASTRO_REAL), 'Datos catastrales')
  assert.equal(tituloDesdeTexto('cualquier otra cosa'), null)
  assert.equal(tituloDesdeTexto(null), null)
})

test('en el título manda: dado > contenido > nombre de fichero', () => {
  assert.equal(tituloDeAportado('documento2_4.pdf', null, CERTIFICACION_REAL), 'Certificación de dominio y cargas')
  assert.equal(tituloDeAportado('documento2_4.pdf', 'Mi título', CERTIFICACION_REAL), 'Mi título')
  assert.equal(tituloDeAportado('documento2_4.pdf', null, 'texto sin señas'), 'documento2 4')
})

// ── ¿Aporta algo? ───────────────────────────────────────────────────────────

test('una lectura vacía NO aporta: se registra como ilegible, no como «sin cargas»', () => {
  assert.equal(aportaAlgo({ cuadro: cuadro(), notas: [] }), false)
})

test('cargas, procedimiento, valoración pactada o señales del edicto aportan', () => {
  assert.equal(aportaAlgo({ cuadro: cuadro({ cargas: [carga()] }), notas: [] }), true)
  assert.equal(aportaAlgo({ cuadro: cuadro({ procedimiento: 'embargo' }), notas: [] }), true)
  assert.equal(aportaAlgo({ cuadro: cuadro({ valoracionPactada: { importe: 47274.9, anio: 2009 } }), notas: [] }), true)
  assert.equal(aportaAlgo({ cuadro: cuadro(), notas: ['Vivienda habitual del demandado: no consta'] }), true)
})

// ── Cuadro combinado para el corpus ─────────────────────────────────────────

test('lecturas sin nada de cargas → null: el corpus no se toca', () => {
  assert.equal(cuadroParaCorpus(null, [cuadro()]), null)
  // Aunque hubiera corpus previo: rescribir lo viejo con lo viejo no es leer.
  assert.equal(cuadroParaCorpus(cuadro({ cargas: [carga()], procedimiento: 'embargo' }), [cuadro()]), null)
})

test('sin corpus previo, el cuadro es el de lo aportado', () => {
  const r = cuadroParaCorpus(null, [cuadro({ cargas: [carga()], procedimiento: 'embargo' })])
  assert.ok(r)
  assert.equal(r.cargas.length, 1)
  assert.equal(r.procedimiento, 'embargo')
})

test('el mismo asiento leído dos veces queda en UNA fila con el importe mayor', () => {
  // El caso real del cron (30/07/2026): certificación 3.600€ (responsabilidad
  // total) e informe 2.600€ (principal) eran la misma anotación letra C.
  const previo = cuadro({ cargas: [carga({ importe: 2600 })], procedimiento: 'embargo' })
  const r = cuadroParaCorpus(previo, [cuadro({ cargas: [carga({ importe: 3600 })] })])
  assert.ok(r)
  assert.equal(r.cargas.length, 1)
  assert.equal(r.cargas[0].importe, 3600)
})

test('en el rango manda la certificación aportada, no lo guardado sin procedencia', () => {
  const previo = cuadro({ cargas: [carga({ rango: 'anterior' })], procedimiento: 'embargo' })
  const aportada = cuadro({
    cargas: [carga({ rango: 'posterior', documento: 'Certificación de dominio y cargas' })],
  })
  const r = cuadroParaCorpus(previo, [aportada])
  assert.ok(r)
  assert.equal(r.cargas.length, 1)
  // `autoridadDocumental` da 2 a la certificación y 0 a lo sin documento: el
  // rango que fija el orden registral es el de la certificación.
  assert.equal(r.cargas[0].rango, 'posterior')
})

// ── Revivir lo guardado ─────────────────────────────────────────────────────

test('un cargas_detalle guardado revive con su fuente; la basura devuelve null', () => {
  const guardado = { cargas: [carga()], procedimiento: 'embargo', sinMasCargas: true, notas: [], fuente: 'texto_documento', confianza: 0.9 }
  const r = revivirCuadroGuardado(guardado)
  assert.ok(r)
  assert.equal(r.fuente, 'texto_documento')
  assert.equal(r.cargas.length, 1)

  assert.equal(revivirCuadroGuardado(null), null)
  assert.equal(revivirCuadroGuardado('x'), null)
  assert.equal(revivirCuadroGuardado({ cargas: [] }), null)
})
