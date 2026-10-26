// CEPO del VOCABULARIO COMÚN (src/vocabulario.ts, 26/10/2026). Sin Playwright ni red.
//   (a) ningún término de ACCIÓN casa la lista de BLOQUEO (ni con los términos que solo puede nombrar guard.ts);
//   (b) «Descargar propuesta» → acción de descarga; «Contratar propuesta» → bloqueado (el bloqueo siempre gana);
//   (c) lo MIGRADO sale del vocabulario: los rótulos de un concepto en un adaptador/guard vienen de ahí (y el guard consume cada término nuevo);
//   + caracterización: el comportamiento del guard y de los lectores es EXACTAMENTE el de antes de migrar (regexes antiguos congelados aquí).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import {
  BLOQUEO,
  alternativa,
  CONCEPTOS_ACCION,
  CONCEPTOS_LECTURA,
  GRUPOS_BLOQUEO_ROTULO,
  casaBloqueo,
  clasificarRotulo,
  normalizarRotulo,
  regexBloqueoRotulo,
  regexEtiquetaExacta,
  regexPalabras,
  terminosDe,
  type Concepto,
  type Termino,
} from '../src/vocabulario.ts'
import {
  TERMINOS_BLOQUEO_SOLO_GUARD,
  TEXTO_GENERAR_PROYECTO_MAPFRE,
  TEXTO_GUARDAR_PROYECTO_MAPFRE,
  TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE,
  casaEmisionGenerali,
  esTextoSiguienteGenerali,
  puntuarBotonDescargaProyecto,
  rechazoOcultoDescargaProyecto,
} from '../src/guard.ts'
import { ETIQUETAS_RIESGO_GENERALI } from '../src/adapters/generali/reglas.ts'
import { ACCIONES_PERMITIDAS } from '../src/formador.ts'

const SRC = join(import.meta.dirname, '..', 'src')
const todosConceptos = (): Concepto[] => [...Object.values(CONCEPTOS_LECTURA), ...Object.values(CONCEPTOS_ACCION)] as Concepto[]
const terminosAccion = (): Termino[] => (Object.values(CONCEPTOS_ACCION) as Concepto[]).flatMap((c) => terminosDe(c).filter((x) => !(c.grupos.excluir ?? []).includes(x)))
const extraGuard = TERMINOS_BLOQUEO_SOLO_GUARD

// ───────────────────────── estructura ─────────────────────────

test('todo término lleva origen (compañía + fecha dd/mm/aaaa) y ramo válido', () => {
  const todos: Termino[] = [...todosConceptos().flatMap((c) => terminosDe(c)), ...Object.values(BLOQUEO).flat(), ...extraGuard]
  assert.ok(todos.length > 100)
  for (const x of todos) {
    assert.match(x.origen.compania, /^[a-z+]+$/, `origen sin compañía: ${x.texto}`)
    assert.match(x.origen.fecha, /^\d{2}\/\d{2}\/2026$/, `origen sin fecha: ${x.texto}`)
    assert.equal(x.texto, x.texto.trim(), `espacios sobrantes: «${x.texto}»`)
  }
  // Las dos clases están separadas y no comparten id.
  const ids = [...Object.keys(CONCEPTOS_LECTURA), ...Object.keys(CONCEPTOS_ACCION)]
  assert.equal(new Set(ids).size, ids.length, 'un id de concepto está en lectura y en acción')
  for (const c of Object.values(CONCEPTOS_LECTURA) as Concepto[]) assert.equal(c.clase, 'lectura')
  for (const c of Object.values(CONCEPTOS_ACCION) as Concepto[]) assert.equal(c.clase, 'accion')
})

test('el vocabulario nombra los ramos y los conceptos de lectura con ramo no se cuelan en otro', () => {
  assert.deepEqual(terminosDe(CONCEPTOS_LECTURA.recibo_anual, { ramo: 'hogar' }), [])
  assert.equal(terminosDe(CONCEPTOS_LECTURA.recibo_anual, { ramo: 'auto' }).length, 1)
  assert.ok(terminosDe(CONCEPTOS_LECTURA.codigo_postal, { ramo: 'hogar' }).length > 0, 'el código postal es común')
})

// ───────────────────────── (a) acción ∩ bloqueo = ∅ ─────────────────────────

test('(a) ningún término de ACCIÓN casa la lista de bloqueo', () => {
  const acc = terminosAccion()
  assert.ok(acc.length >= 15)
  for (const x of acc) {
    assert.equal(casaBloqueo(x.texto, { extra: extraGuard }), null, `la acción «${x.texto}» casa la lista de bloqueo`)
    // Tampoco un rótulo completo hecho con ese término (verbo + objeto de descarga).
    assert.equal(casaBloqueo(`${x.texto} presupuesto`, { extra: extraGuard }), null, `«${x.texto} presupuesto» casa la lista de bloqueo`)
  }
})

test('(a) y al revés: ningún término de bloqueo es un término de acción', () => {
  const acciones = new Set(terminosAccion().map((x) => normalizarRotulo(x.texto)))
  for (const x of [...Object.values(BLOQUEO).flat(), ...extraGuard]) assert.ok(!acciones.has(normalizarRotulo(x.texto)), `«${x.texto}» está a la vez en acción y en bloqueo`)
})

test('la lista de bloqueo nombra lo que tiene que nombrar (cepo: quitar un verbo de emisión lo tumba)', () => {
  const emision = BLOQUEO.emision.map((x) => x.texto)
  for (const p of ['emit', 'contrat', 'grabar', 'pagar', 'firm', 'formaliz', 'poliza']) assert.ok(emision.includes(p), `falta «${p}» en el bloqueo de emisión`)
  for (const frase of ['Emitir póliza', 'Contratar', 'Pagar ahora', 'Firmar', 'Formalizar', 'Grabar póliza', 'Enviar al cliente', 'Domiciliar recibo', 'Aceptar']) {
    assert.ok(casaBloqueo(frase, { extra: extraGuard }) !== null, `«${frase}» tiene que estar bloqueado`)
  }
  // Los grupos de rótulo cubren los cuatro, y atributo_interno/emision_pagina se miran aparte.
  assert.deepEqual([...GRUPOS_BLOQUEO_ROTULO], ['emision', 'envio_externo', 'destructivo', 'economico_ajeno'])
})

// ───────────────────────── (b) clasificación ─────────────────────────

test('(b) «Descargar propuesta» → acción de descarga; «Contratar propuesta» → bloqueado', () => {
  assert.deepEqual(clasificarRotulo('Descargar propuesta', { extraBloqueo: extraGuard }), { clase: 'accion', concepto: 'descargar_documento' })
  const c = clasificarRotulo('Contratar propuesta', { extraBloqueo: extraGuard })
  assert.equal(c?.clase, 'bloqueado')
  // El guard real coincide con el vocabulario.
  assert.equal(puntuarBotonDescargaProyecto(['Descargar propuesta'], 'allianz', true), 2)
  assert.equal(puntuarBotonDescargaProyecto(['Contratar propuesta'], 'allianz', true), 0)
  assert.equal(puntuarBotonDescargaProyecto(['Descargar propuesta y contratar'], 'allianz', true), 0)
  // «propuesta» sola, o con «documento», no basta.
  assert.equal(puntuarBotonDescargaProyecto(['Ver propuesta'], 'allianz', true), 0)
  assert.equal(puntuarBotonDescargaProyecto(['Documento propuesta'], 'allianz', true), 0)
})

test('(b) el bloqueo gana aunque el rótulo parezca una acción conocida', () => {
  for (const r of ['Descargar presupuesto y emitir', 'Siguiente y pagar', 'Continuar a pago', 'Guardar proyecto y firmar', 'Imprimir póliza', 'Enviar presupuesto por email']) {
    assert.equal(clasificarRotulo(r, { extraBloqueo: extraGuard })?.clase, 'bloqueado', r)
  }
  for (const r of ['Siguiente ›', 'Continuar', 'Calcular', 'Generar Proyecto', 'Ir a generar proyecto', 'Guardar proyecto', 'Imprimir presupuesto', 'Descargar oferta PDF']) {
    assert.equal(clasificarRotulo(r, { extraBloqueo: extraGuard })?.clase, 'accion', r)
  }
})

test('(b) lectura: «Recibo Anual» es una cabecera (no se bloquea por «recibo»); como botón de descarga sí se rechaza', () => {
  assert.deepEqual(clasificarRotulo('Recibo Anual'), { clase: 'lectura', concepto: 'recibo_anual' })
  assert.deepEqual(clasificarRotulo('Prima Anualidad'), { clase: 'lectura', concepto: 'prima_anualidad' })
  assert.deepEqual(clasificarRotulo('Compañia *'), { clase: 'lectura', concepto: 'compania_anterior' })
  assert.deepEqual(clasificarRotulo('Fecha de nacimiento'), { clase: 'lectura', concepto: 'fecha_nacimiento' })
  assert.equal(puntuarBotonDescargaProyecto(['Descargar recibo del presupuesto'], 'allianz', true), 0)
  assert.equal(clasificarRotulo('Rótulo desconocido cualquiera'), null)
})

// ───────────────────────── caracterización: el guard y los lectores NO cambian ─────────────────────────

const LEGACY = {
  prohibidoRotulo: /\b(emit\w*|contrat\w*|grabar\w*|pagar|pagos?|firm\w*|formaliz\w*|enviar|envio|envia\w*|e-?mail|mail|correo|sms|whatsapp|send|share|compartir|cliente|anular|elimin\w*|borrar|cancelar|aceptar|confirmar|recibos?|domicili\w*|poliza|solicitud)\b/,
  prohibidoOculto: /(emit|contrat|grabar|pagar|pago|firm|formaliz|enviar|email|mail|sms|anul|elimin|borrar)/,
  ajeno: /\b(condicion\w*|condicionado|clausulad\w*|manual\w*|ayuda|aplicacion|app|tarifa\w*|bases|politica\w*|privacidad|protocolo|precontractual\w*|ipid|informativ\w*|informacion|extracto|cuestionario|licencia|factura\w*|carta|mandato|catalogo|folleto)\b/,
  verboSuelto: /\b(imprim\w*|descarg\w*|print\w*|download\w*|pdf)\b/,
  verboConObjeto: /\b(imprim\w*|descarg\w*|print\w*|download\w*|pdf|documento)\b/,
  objeto: /\b(proyecto|presupuesto|oferta)s?\b/,
  propuesta: /\bpropuestas?\b/,
  emisionGenerali: /\b(emitir|contratar|grabar (la )?poliza|pagar|firmar|formalizar)\b/,
  siguiente: /^SIGUIENTE[\s ›>»]*$/,
  precio: /\b(PRIMA|PRIMAS|PRECIO|IMPORTE|TOTAL|A PAGAR|RECIBO|COSTE|CONTADO|ANUAL)\b/,
  total: /\bTOTAL\b/,
  noPrecio: /\b(FRANQUICIA|CAPITAL|SUMA ASEGURADA|LIMITE|VALOR|ACCESORIOS|INDEMNIZACION|KM|KILOMETROS)\b/,
  cuota: /\b(CUOTA|CUOTAS)\b/,
  totalAnual: /\b(TOTAL ANUAL|ANUAL TOTAL|PRIMA ANUAL|CUOTA ANUAL)\b/,
  dineroDiagnostico: /\b(PRIMA|PRIMAS|CUOTA|CUOTAS|RECIBO|RECIBOS|TOTAL|NETA|NETO|ANUAL|ANUALES|SEMESTRAL|TRIMESTRAL|MENSUAL|CONTADO|FRACCIONADO|PAGAR|IMPORTE|PRECIO|IMPUESTO|IMPUESTOS|RECARGO|RECARGOS|CONSORCIO|TASA|TASAS|DESCUENTO|BONIFICACION|BONUS|MALUS|COMISION|FRANQUICIA|CAPITAL|CAPITALES|GARANTIA|GARANTIAS|COBERTURA|COBERTURAS|MODALIDAD|OPCION|CONCEPTO|DESCRIPCION|TODO RIESGO|TERCEROS|AMPLIADO|BASICO|COMPLETO|LUNAS|ROTURA|ROBO|INCENDIO|ASISTENCIA|DEFENSA|OCUPANTES|ACCIDENTES|SEGURO|SEGUROS|COLISION|COLISIONES|AVERIAS)\b/,
  // Cabeceras de columna de precio del lector en página (subcadena, sin distinguir mayúsculas).
  cabecera: /prima|precio|importe|total|recibo|anual|contado|pagar/i,
  cabeceraGarantias: /prima|precio|importe|total|recibo|anual|contado|pagar|cuota/i,
}

/** Corpus: cada término de todo el vocabulario solo y rodeado, variantes con sufijos/plurales y frases reales de los portales. */
function corpus(): string[] {
  const base = [
    ...todosConceptos().flatMap((c) => terminosDe(c).map((x) => x.texto)),
    ...Object.values(BLOQUEO).flat().map((x) => x.texto),
    'aceptar', 'cancelar', 'confirmar',
    'Descargar propuesta', 'Descargar presupuesto', 'Imprimir proyecto', 'Descargar PDF', 'Imprimir', 'Descargar', 'Ver oferta', 'Documento del presupuesto',
    'Descargar condiciones generales', 'Descargar manual de la aplicación', 'Enviar presupuesto por email', 'Descargar y enviar al cliente', 'Descargar recibo',
    'Siguiente ›', 'Siguiente >', 'Siguiente »', 'Siguiente', 'SIGUIENTE ›  ', '› Siguiente', 'Siguiente paso', 'Continuar', 'Emitir póliza', 'Contratar propuesta',
    'Prima total anual', 'Recibo Anual', 'Prima Anualidad', 'Cuota anual', 'Franquicia 300 €', 'Capital asegurado', 'Valor del vehículo', 'Precio a pagar', 'Importe total',
    'Pagos fraccionados', 'Primas', 'Cuotas', 'Total', 'Recibos pendientes', 'Grabar la póliza', 'grabar poliza', 'Firmar', 'Formalizar solicitud',
    'Compañía', 'Compañia', 'Compañia *', 'Compañía anterior', 'Compania', 'COMPAÑÍA', 'compañía*', 'Compañias',
    '',
  ]
  const out = new Set<string>()
  for (const b of base) {
    for (const v of [b, b.toUpperCase(), `${b} xyz`, `xyz ${b}`, `${b}s`, `${b}ar`, `¿${b}?`, `${b}_${b}`]) out.add(v)
    out.add(normalizarRotulo(b))
    out.add(normalizarRotulo(b).toUpperCase())
  }
  return [...out]
}

test('caracterización: regexes de bloqueo, ajenos, verbos y objetos son los de antes sobre todo el corpus', () => {
  const nuevo = {
    prohibidoRotulo: regexBloqueoRotulo(extraGuard),
    prohibidoOculto: regexPalabras(BLOQUEO.atributo_interno, { limites: false }),
    emisionGenerali: regexPalabras(BLOQUEO.emision_pagina),
  }
  const n = corpus().map(normalizarRotulo)
  assert.ok(n.length > 1000)
  for (const s of n) {
    assert.equal(nuevo.prohibidoRotulo.test(s), LEGACY.prohibidoRotulo.test(s), `bloqueo de rótulo difiere en «${s}»`)
    assert.equal(nuevo.prohibidoOculto.test(s), LEGACY.prohibidoOculto.test(s), `bloqueo oculto difiere en «${s}»`)
    assert.equal(nuevo.emisionGenerali.test(s), LEGACY.emisionGenerali.test(s), `emisión Generali difiere en «${s}»`)
    assert.equal(casaEmisionGenerali(s) !== null, LEGACY.emisionGenerali.test(s), `casaEmisionGenerali difiere en «${s}»`)
  }
  const descarga = CONCEPTOS_ACCION.descargar_documento as Concepto
  const g = (...grupos: string[]) => regexPalabras(terminosDe(descarga, { grupos }))
  for (const s of n) {
    assert.equal(g('excluir').test(s), LEGACY.ajeno.test(s), `documento ajeno difiere en «${s}»`)
    assert.equal(g('verbo').test(s), LEGACY.verboSuelto.test(s), `verbo suelto difiere en «${s}»`)
    assert.equal(g('verbo', 'verbo_con_objeto').test(s), LEGACY.verboConObjeto.test(s), `verbo con objeto difiere en «${s}»`)
    assert.equal(g('objeto').test(s), LEGACY.objeto.test(s), `objeto difiere en «${s}»`)
    assert.equal(g('objeto_propuesta').test(s), LEGACY.propuesta.test(s), `propuesta difiere en «${s}»`)
  }
})

/** La puntuación de ANTES (guard.ts, 26/10/2026), con los regexes congelados de arriba. */
function puntuarAntes(desc: readonly (string | null | undefined)[], soloConObjeto: boolean, guardado: boolean): 0 | 1 | 2 {
  const sin = (x: string | null | undefined) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const rotulos = [desc[0], desc[1], desc[2], desc[3], desc[11]].map(sin).filter((x) => x !== '' && x.length <= 120)
  if (rotulos.length === 0) return 0
  const junto = rotulos.join(' | ')
  if (LEGACY.prohibidoRotulo.test(junto) || LEGACY.ajeno.test(junto)) return 0
  const ocultos = desc.slice(4).map((x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()).join(' | ')
  if (LEGACY.prohibidoOculto.test(ocultos)) return 0
  if (LEGACY.verboConObjeto.test(junto) && LEGACY.objeto.test(junto)) return 2
  if (LEGACY.verboSuelto.test(junto) && LEGACY.propuesta.test(junto)) return 2
  if (guardado && !soloConObjeto && LEGACY.verboSuelto.test(junto)) return 1
  return 0
}

test('caracterización: puntuarBotonDescargaProyecto da lo mismo que antes de migrar (3 compañías × guardado × corpus × atributos ocultos)', () => {
  const ocultos: (string | null)[][] = [[], [null, 'btn_descargar'], [null, 'emitir_proj'], ['x', 'ng-click="enviarMail()"'], [null, null, null, null, null, null, 'href=/pdf/presupuesto.pdf']]
  let n = 0
  for (const s of corpus()) {
    for (const [compania, soloObjeto] of [['allianz', false], ['mapfre', false], ['generali', true]] as const) {
      for (const guardado of [true, false]) {
        for (const oc of ocultos) {
          const desc = [s, null, null, null, ...oc]
          assert.equal(puntuarBotonDescargaProyecto(desc, compania, guardado), puntuarAntes(desc, soloObjeto, guardado), `${compania}/${guardado}: «${s}» + ${JSON.stringify(oc)}`)
          n++
        }
      }
    }
  }
  assert.ok(n > 10_000)
})

test('caracterización: esTextoSiguienteGenerali, textos de proyecto de Mapfre y etiquetas de Generali/Mapfre no cambian', () => {
  const siguiente = (s: string) => LEGACY.siguiente.test(s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es'))
  for (const s of corpus().concat(['Siguiente ›', 'siguiente  »', '  Siguiente >  ', 'Siguiente ›› ', 'Siguiente (2)'])) {
    assert.equal(esTextoSiguienteGenerali(s), siguiente(s.replace(/\u00a0/g, ' ')), `«Siguiente» difiere en «${s}»`)
  }
  assert.equal(esTextoSiguienteGenerali('Siguiente ›'), true)
  assert.equal(esTextoSiguienteGenerali('Siguiente paso'), false)
  assert.equal(TEXTO_GENERAR_PROYECTO_MAPFRE, 'GENERAR PROYECTO')
  assert.equal(TEXTO_GUARDAR_PROYECTO_MAPFRE, 'GUARDAR PROYECTO')
  assert.equal(TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE, 'IR A GENERAR PROYECTO')
  // «Compañia» de Mapfre: mismo patrón exacto que antes.
  const comp = regexEtiquetaExacta(CONCEPTOS_LECTURA.compania_anterior.grupos.etiqueta_exacta[0])
  const antes = /^\s*compa(?:ñ|n)(?:í|i)a\s*\*?\s*$/i
  assert.equal(comp.source, antes.source)
  assert.equal(comp.flags, antes.flags)
  // Etiquetas de «Datos de Valoración» de Generali: las mismas listas, en el mismo orden.
  assert.deepEqual(
    { ...ETIQUETAS_RIESGO_GENERALI },
    {
      fechaNacimiento: ['FECHA DE NACIMIENTO', 'FECHA NACIMIENTO', 'F NACIMIENTO'],
      fechaCarne: ['FECHA DE CARNE', 'FECHA CARNE', 'FECHA DE CARNET', 'FECHA CARNET', 'FECHA EXPEDICION CARNE', 'FECHA EXPEDICION CARNET', 'FECHA DE EXPEDICION DEL CARNE', 'FECHA DE EXPEDICION DEL CARNET', 'FECHA EXPEDICION PERMISO', 'FECHA DE EXPEDICION DEL PERMISO'],
      codigoPostal: ['CODIGO POSTAL', 'C P', 'CP'],
      aniosAsegurado: ['ANOS ASEGURADO', 'ANOS ASEGURADOS', 'ANOS DE ASEGURAMIENTO', 'ANOS ASEGURADO ANTERIOR', 'ANOS EN LA COMPANIA ANTERIOR'],
      siniestros: ['SINIESTROS ULTIMOS 5 ANOS', 'N SINIESTROS ULTIMOS 5 ANOS', 'NUMERO DE SINIESTROS', 'SINIESTROS CON CULPA ULTIMOS 5 ANOS'],
    },
  )
  // Etiquetas de precio de Generali: mismos patrones sobre texto en MAYÚSCULAS.
  const M = { mayus: true } as const
  const mayus = corpus().map((s) => normalizarRotulo(s).toUpperCase())
  const pares: [RegExp, RegExp][] = [
    [regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio as Concepto), M), LEGACY.precio],
    [regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_total as Concepto), M), LEGACY.total],
    [regexPalabras(terminosDe(CONCEPTOS_LECTURA.importe_ajeno as Concepto), M), LEGACY.noPrecio],
    [regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_cuota as Concepto), M), LEGACY.cuota],
    [regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_total_anual as Concepto), M), LEGACY.totalAnual],
    [regexPalabras(terminosDe(CONCEPTOS_LECTURA.dinero_diagnostico as Concepto), M), LEGACY.dineroDiagnostico],
  ]
  // Cabeceras de columna (lector en página): mismas coincidencias que antes, con y sin «cuota».
  const cab = new RegExp(alternativa(terminosDe(CONCEPTOS_LECTURA.precio_cabecera_tabla as Concepto)), 'i')
  const cabGar = new RegExp(`${alternativa(terminosDe(CONCEPTOS_LECTURA.precio_cabecera_tabla as Concepto))}|${alternativa(terminosDe(CONCEPTOS_LECTURA.precio_cuota as Concepto))}`, 'i')
  for (const s of corpus()) {
    assert.equal(cab.test(s), LEGACY.cabecera.test(s), `cabecera difiere en «${s}»`)
    assert.equal(cabGar.test(s), LEGACY.cabeceraGarantias.test(s), `cabecera de garantías difiere en «${s}»`)
  }
  for (const [nuevo, antes2] of pares) {
    for (const s of mayus) assert.equal(nuevo.test(s), antes2.test(s), `${antes2.source} difiere en «${s}»`)
  }
})

test('caracterización: rechazoOcultoDescargaProyecto sigue nombrando solo la palabra de la lista negra', () => {
  assert.equal(rechazoOcultoDescargaProyecto(['Descargar presupuesto', null, null, null, 'btn_emitir'], 'allianz', true), 'emit')
  assert.equal(rechazoOcultoDescargaProyecto(['Descargar presupuesto', null, null, null, 'btn_descargar'], 'allianz', true), null)
})

// ───────────────────────── (c) lo migrado sale del vocabulario ─────────────────────────

test('(c) el guard consume CADA término del vocabulario: un verbo, objeto, documento ajeno o término de bloqueo nuevo hace efecto sin tocar guard.ts', () => {
  const d = CONCEPTOS_ACCION.descargar_documento as Concepto
  for (const x of terminosDe(d, { grupos: ['verbo'] })) assert.equal(puntuarBotonDescargaProyecto([`${x.texto} presupuesto`], 'allianz', false), 2, `verbo «${x.texto}»`)
  for (const x of terminosDe(d, { grupos: ['objeto'] })) assert.equal(puntuarBotonDescargaProyecto([`Descargar ${x.texto}`], 'allianz', false), 2, `objeto «${x.texto}»`)
  for (const x of terminosDe(d, { grupos: ['objeto_propuesta'] })) assert.equal(puntuarBotonDescargaProyecto([`Descargar ${x.texto}`], 'allianz', false), 2, `propuesta «${x.texto}»`)
  for (const x of terminosDe(d, { grupos: ['excluir'] })) assert.equal(puntuarBotonDescargaProyecto([`Descargar presupuesto ${x.texto}`], 'allianz', true), 0, `ajeno «${x.texto}»`)
  for (const x of [...GRUPOS_BLOQUEO_ROTULO.flatMap((g) => BLOQUEO[g]), ...extraGuard]) {
    assert.equal(puntuarBotonDescargaProyecto([`Descargar presupuesto ${x.texto}`], 'allianz', true), 0, `bloqueo «${x.texto}»`)
  }
  for (const x of BLOQUEO.atributo_interno) assert.equal(puntuarBotonDescargaProyecto(['Descargar presupuesto', null, null, null, `btn_${x.texto}_x`], 'allianz', true), 0, `atributo «${x.texto}»`)
  for (const x of BLOQUEO.emision_pagina) assert.ok(casaEmisionGenerali(`Pulse para ${x.texto} ahora`) !== null, `emisión en página «${x.texto}»`)
})

test('(c) las tablas cerradas del formador (continuar, calcular) no se desvían del vocabulario', () => {
  const norm = (a: readonly string[]) => [...a].map(normalizarRotulo).sort()
  const av = CONCEPTOS_ACCION.avanzar as Concepto
  assert.deepEqual(norm(ACCIONES_PERMITIDAS.continuar), norm(terminosDe(av).map((x) => x.texto)))
  assert.deepEqual(norm(ACCIONES_PERMITIDAS.calcular), norm(terminosDe(CONCEPTOS_ACCION.calcular as Concepto).map((x) => x.texto)))
})

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? ficheros(p) : p.endsWith('.ts') ? [p] : []
  })
}
function sinComentarios(src: string): string {
  return src.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')
}
const leer = (rel: string): string => readFileSync(join(SRC, rel), 'utf8')

test('(c) lo migrado importa del vocabulario y ya no lleva los rótulos copiados', () => {
  const guard = sinComentarios(leer('guard.ts'))
  const reglas = sinComentarios(leer('adapters/generali/reglas.ts'))
  const genAuto = sinComentarios(leer('adapters/generali/auto.ts'))
  const mapAuto = sinComentarios(leer('adapters/mapfre/auto.ts'))
  for (const [nombre, src] of [['guard.ts', guard], ['generali/reglas.ts', reglas], ['generali/auto.ts', genAuto], ['mapfre/auto.ts', mapAuto]] as const) {
    assert.match(src, /from '(?:\.\.\/)*(?:\.\/)?(?:\.\.\/)?vocabulario\.ts'/, `${nombre} no importa de vocabulario.ts`)
  }
  // Descarga de proyecto (guard).
  assert.doesNotMatch(guard, /imprim\\w\*\|descarg/, 'guard.ts vuelve a llevar el verbo de descarga copiado')
  assert.doesNotMatch(guard, /\(proyecto\|presupuesto\|oferta\)/, 'guard.ts vuelve a llevar los objetos de descarga copiados')
  assert.doesNotMatch(guard, /condicion\\w\*\|condicionado/, 'guard.ts vuelve a llevar los documentos ajenos copiados')
  assert.doesNotMatch(guard, /emit\\w\*\|contrat\\w\*\|grabar/, 'guard.ts vuelve a llevar la lista negra del rótulo copiada')
  // «Siguiente ›».
  assert.doesNotMatch(guard, /\^SIGUIENTE/, 'guard.ts vuelve a llevar «SIGUIENTE» copiado')
  assert.match(guard, /CONCEPTOS_ACCION\.avanzar/)
  // Textos de proyecto de Mapfre.
  for (const lit of ["= 'GENERAR PROYECTO'", "= 'GUARDAR PROYECTO'", "= 'IR A GENERAR PROYECTO'"]) assert.ok(!guard.includes(lit), `guard.ts vuelve a llevar ${lit}`)
  // Etiquetas de precio de Generali.
  assert.doesNotMatch(reglas, /PRIMA\|PRIMAS\|PRECIO/, 'reglas.ts vuelve a llevar las etiquetas de precio copiadas')
  assert.doesNotMatch(reglas, /FRANQUICIA\|CAPITAL/, 'reglas.ts vuelve a llevar las etiquetas de importe ajeno copiadas')
  assert.doesNotMatch(reglas, /TOTAL ANUAL\|ANUAL TOTAL/, 'reglas.ts vuelve a llevar el total anual copiado')
  assert.doesNotMatch(reglas, /'FECHA DE NACIMIENTO'/, 'reglas.ts vuelve a llevar las etiquetas de fecha copiadas')
  // Cabeceras de la tabla de modalidades.
  assert.doesNotMatch(genAuto, /indexOf\('recibo anual'\)|indexOf\('prima anualidad'\)/, 'generali/auto.ts vuelve a llevar las cabeceras copiadas')
  // «Compañia» de Mapfre.
  assert.doesNotMatch(mapAuto, /compa\(\?:ñ\|n\)/, 'mapfre/auto.ts vuelve a llevar el patrón de «Compañia» copiado')
})

// Regex literales con varios términos del MISMO concepto fuera de vocabulario.ts: un rótulo nuevo de un concepto conocido tiene que ir al vocabulario.
// Excepciones REVISADAS (nº exacto por fichero: una nueva rompe). Cada una es otra cosa que el rótulo de un botón/etiqueta del concepto.
const EXCEPCIONES_REGEX: Record<string, number> = {
  // RE_ETIQUETA_INTERESANTE: elige QUÉ controles se enseñan en un diagnóstico (mezcla guard/ampli/desplieg/detalle…); no clasifica ningún rótulo de un concepto.
  'src/guard.ts': 1,
}

function regexLiterales(src: string): string[] {
  const out: string[] = []
  const re = /(?<![\w)\]'"`<])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\n\\[])+)\/[dgimsuvy]*/g
  for (const m of src.matchAll(re)) out.push(m[1]!)
  return out
}

test('(c) ningún adaptador ni el guard repite a mano ≥3 términos de un mismo concepto en un patrón (tiene que venir del vocabulario)', () => {
  const infractores: string[] = []
  // `dinero_diagnostico` es una lista BLANCA de palabras genéricas (sirve para decidir qué se puede enseñar): no es un rótulo con significado propio, y daría falsos positivos.
  const conceptos = todosConceptos().filter((c) => c.id !== 'dinero_diagnostico').map((c) => ({ id: c.id, terminos: [...new Set(terminosDe(c).map((x) => normalizarRotulo(x.texto)).filter((x) => x.length >= 4))] }))
  const veces: Record<string, number> = {}
  for (const f of ficheros(SRC)) {
    const rel = relative(join(SRC, '..'), f)
    if (f.endsWith('/src/vocabulario.ts')) continue
    const src = sinComentarios(readFileSync(f, 'utf8'))
    for (const lit of regexLiterales(src)) {
      const l = normalizarRotulo(lit.replace(/\\[bsdwSDW]|[\\^$|()?*+[\]{}]/g, ' '))
      for (const c of conceptos) {
        const casan = c.terminos.filter((x) => new RegExp(`(^|[^a-z])${x.replace(/ /g, '\\s*')}([^a-z]|$)`).test(l))
        if (casan.length >= 3) {
          veces[rel] = (veces[rel] ?? 0) + 1
          infractores.push(`${rel}: /${lit.slice(0, 70)}/ repite ${casan.length} términos del concepto «${c.id}» (${casan.slice(0, 4).join(', ')})`)
        }
      }
    }
  }
  const sinRevisar = infractores.filter((i) => (EXCEPCIONES_REGEX[i.split(':')[0]!] ?? 0) < (veces[i.split(':')[0]!] ?? 0))
  assert.deepEqual(sinRevisar, [], 'patrón con rótulos de un concepto copiados: muévelos a src/vocabulario.ts')
})
