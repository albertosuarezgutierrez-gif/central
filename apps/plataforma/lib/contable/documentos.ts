// apps/plataforma/lib/contable/documentos.ts
// Orquesta un documento subido (foto de ticket / PDF de factura): extrae con la maquinaria
// CANÓNICA existente (extraerDesdeBuffer → aiExtractInvoice) y busca un movimiento bancario que
// cuadre, SIN escribir nada (la conciliación real se hace luego por confirmación, en acciones.ts).
// No implementa OCR nuevo (spec §5).
//
// 08/08/2026 — el cruce ya no responde sí/no, responde CUÁL de los cinco desenlaces es (ver CruceDoc
// en documentos-tipos.ts). El motivo es un fallo repetido: los extractos del banco llegan con retraso
// (Kutxabank suele ir 1-3 días por detrás), así que una factura de anteayer NO se puede contrastar
// todavía — y el agente contestaba «no encuentro un movimiento bancario que cuadre», que suena a «no
// lo has pagado». Casos reales: la factura de lavandería de 780,10€ del 03/08 (el cargo entró en la
// BD el 06/08, un día DESPUÉS de que el agente lo negara) y la factura 47/2026 de 278,30€ del 06/08
// (Kutxabank llegaba entonces al 05/08). Regla del CLAUDE.md: dato que no hay ≠ dato que no se ha mirado.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { extraerDesdeBuffer } from '@/lib/agente-facturas/extraer'
import { esExtractoTarjeta, parseTarjetaPdfTexto } from '@/lib/extracto-tarjeta-pdf'
import { parseExtractoXls } from '@/lib/extracto-xls'
import { identificarTarjetaExcel, comoExtractoTarjeta } from '@/lib/extracto-tarjeta-excel'
import { interpretarExtraccion, fechaEs, type FacturaDoc, type CruceDoc, type CoberturaBanco, type MovCandidato } from './documentos-tipos'
import { detectarListadoMovimientos } from './documento-clase'
import { procesarExtractoTarjeta } from './extracto-tarjeta'

export type DocProcesado =
  | { ok: false; motivo: string }
  | { ok: true; tipo: 'factura'; factura: FacturaDoc; cruce: CruceDoc }
  | { ok: true; tipo: 'extracto_tarjeta'; resumen: string; driveUrl?: string }

// Ventana ancha para el «existe, pero en otra fecha»: un recibo domiciliado puede cargarse bastante
// después de la fecha de la factura. Se PREGUNTA, no se concilia solo.
const VENTANA_ANCHA = 60
// Una cuenta cuenta como "viva" (su feed está al día) si tiene movimientos recientes. Las cuentas
// dormidas (N26, las tarjetas que solo se cargan con el PDF mensual) NO deben hacernos decir
// «todavía no ha llegado» de todo lo que se pregunte.
const DIAS_CUENTA_VIVA = 30

type FilaMov = { id: string; fecha: string; concepto: string | null; importe: unknown; banco: string | null; conciliado: boolean | null; factura_ref: string | null }

const aCandidato = (m: FilaMov): MovCandidato => ({
  movId: m.id, fecha: m.fecha, concepto: m.concepto, importe: Number(m.importe), banco: m.banco,
  facturaRef: m.factura_ref,
})

// Cargos del MISMO importe (al céntimo) dentro de una ventana de días. READ-ONLY: réplica de la
// SELECT de factura-ocr.ts::casarFactura pero SIN el UPDATE (aquí solo proponemos; el UPDATE lo hace
// acciones.ts tras confirmar). Todo scoped por cuenta_id. Los ya conciliados vienen marcados, no
// filtrados: un cargo conciliado es una RESPUESTA («ya está hecho»), no una ausencia.
async function cargosDelImporte(cuentaId: string, f: FacturaDoc, dias: number): Promise<FilaMov[]> {
  return await prisma.$queryRaw<FilaMov[]>(Prisma.sql`
    SELECT mb.id, mb.fecha_operacion::text AS fecha, mb.concepto, mb.importe,
           coalesce(cb.alias, cb.banco) AS banco, coalesce(mb.conciliado, false) AS conciliado,
           mb.factura_ref
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
      AND sign(mb.importe) = -1
      AND ABS(ABS(mb.importe) - ${f.total}) < 0.005
      AND mb.fecha_operacion IS NOT NULL
      AND ABS(mb.fecha_operacion - ${f.fecha}::date) <= ${dias}
    ORDER BY coalesce(mb.conciliado, false) ASC, ABS(mb.fecha_operacion - ${f.fecha}::date) ASC
    LIMIT 5`).catch(() => [])
}

// Hasta qué fecha llega el extracto de cada cuenta VIVA. Es lo que convierte un «no lo encuentro» en
// un «todavía no me ha llegado» (regla del CLAUDE.md: dato que no hay ≠ dato que no se ha mirado).
async function coberturaExtractos(cuentaId: string): Promise<CoberturaBanco[]> {
  const rows = await prisma.$queryRaw<Array<{ banco: string | null; ultima: string | null }>>(Prisma.sql`
    SELECT coalesce(cb.alias, cb.banco) AS banco, max(mb.fecha_operacion)::text AS ultima
    FROM cuentas_bancarias cb
    JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND NOT coalesce(cb.oculta, false)
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    GROUP BY 1
    HAVING max(mb.fecha_operacion) >= CURRENT_DATE - ${DIAS_CUENTA_VIVA}::int
    ORDER BY 1`).catch(() => [])
  return rows.filter(r => r.banco).map(r => ({ banco: String(r.banco), ultima: r.ultima }))
}

const diasEntre = (a: string, b: string) =>
  Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000)

// Cruza la factura contra los movimientos y devuelve CUÁL de los cinco desenlaces es (ver CruceDoc).
async function buscarCruce(cuentaId: string, f: FacturaDoc, tolDias = 7): Promise<CruceDoc> {
  const cercanos = await cargosDelImporte(cuentaId, f, tolDias)
  const libre = cercanos.find(m => !m.conciliado)
  if (libre) return { estado: 'match', mov: aCandidato(libre) }

  // Los ±60 días se miran SIEMPRE, aunque haya un cargo cercano ya conciliado: mismo importe y fecha
  // parecida es un indicio fuerte, pero no es una prueba de que sea ESTA factura (dos recibos
  // gemelos del mismo proveedor lo rompen). Si hay un cargo libre, se ofrece; el conciliado se cuenta
  // como lo que es —un dato— y se deja que Alberto lo desmienta.
  const lejano = (await cargosDelImporte(cuentaId, f, VENTANA_ANCHA)).find(m => !m.conciliado)
  if (cercanos[0]) return { estado: 'ya_conciliado', mov: aCandidato(cercanos[0]), otro: lejano ? aCandidato(lejano) : null }
  if (lejano) {
    return { estado: 'fuera_de_ventana', mov: aCandidato(lejano), dias: diasEntre(lejano.fecha, f.fecha) }
  }

  // Nada casa. Antes de afirmar que no existe, ¿he podido mirarlo siquiera? Si alguna cuenta viva
  // no llega todavía a la fecha de la factura, la respuesta honesta es «aún no lo sé».
  const cobertura = await coberturaExtractos(cuentaId)
  const ciega = cobertura.some(c => c.ultima && c.ultima < f.fecha)
  return ciega ? { estado: 'sin_cobertura', cobertura } : { estado: 'sin_match', cobertura }
}

const RE_EXCEL = /\.xlsx?$/i
const MIME_EXCEL = /(excel|spreadsheet)/i

// Hoja de cálculo subida al chat: el lector de facturas no sabe abrirla (devolvería «no he podido
// leer el documento», que es falso). Hoy el Excel que Alberto sube es el MISMO listado de la tarjeta
// que el PDF, y ese sí se puede importar entero.
async function procesarExcel(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName: string,
): Promise<DocProcesado> {
  // El catch cubre SOLO el parseo. Si falla la importación (BD), el error sube: decir «no pude leer
  // la hoja» cuando las filas ya están dentro dejaría a Alberto reimportando algo ya importado.
  let extractos
  try {
    extractos = parseExtractoXls(buffer)
  } catch {
    return { ok: false, motivo: 'No pude abrir la hoja de cálculo. ¿Es el Excel de movimientos que descarga el banco?' }
  }
  const primero = extractos[0]
  if (!primero || !primero.movimientos.length) {
    return { ok: false, motivo: 'He abierto la hoja de cálculo pero no reconozco ninguna columna de movimientos (fecha, concepto, importe). Si es un extracto, súbelo en /banca → Importar.' }
  }

  const tarjeta = identificarTarjetaExcel(primero)
  if (!tarjeta) {
    // No es de tarjeta o no se puede saber a qué cuenta pertenece. NO se adivina: meter movimientos
    // en la cuenta equivocada ensucia el P&L y el dedupe, y cuesta más deshacerlo que no importarlo.
    const desde = primero.fechaInicio ? fechaEs(primero.fechaInicio) : ''
    const hasta = primero.fechaFin ? fechaEs(primero.fechaFin) : ''
    const rango = desde && hasta ? ` (del ${desde} al ${hasta})` : ''
    return {
      ok: false,
      motivo: `Es un listado de ${primero.movimientos.length} movimientos${rango}, pero el fichero no dice de qué cuenta o tarjeta es, y no lo adivino. Impórtalo en /banca → Importar, que ahí eliges la cuenta.`,
    }
  }

  return await procesarExtractoTarjeta(
    cuentaId, buffer, mimeType, fileName, [comoExtractoTarjeta(primero, tarjeta.ccc)], 'xls',
  )
}

export async function procesarDocumento(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName = '',
): Promise<DocProcesado> {
  if (RE_EXCEL.test(fileName) || MIME_EXCEL.test(mimeType)) {
    return await procesarExcel(cuentaId, buffer, mimeType, fileName)
  }

  let extraido
  try {
    extraido = await extraerDesdeBuffer(buffer, mimeType, fileName)
  } catch {
    return { ok: false, motivo: 'No pude procesar el documento. ¿Es un PDF o una imagen (JPG/PNG)?' }
  }

  // Un EXTRACTO de tarjeta (multilínea) no es una factura suelta: se desglosa e importa por su
  // propia vía (parser exacto → importarExtracto → categoría → devoluciones → cuadre → Drive).
  if (extraido.texto && esExtractoTarjeta(extraido.texto)) {
    return await procesarExtractoTarjeta(cuentaId, buffer, mimeType, fileName, parseTarjetaPdfTexto(extraido.texto))
  }

  const interp = interpretarExtraccion(extraido.data, extraido.source)
  if (!interp.ok) {
    // El documento SÍ se lee: lo que pasa es que no es una factura suelta, sino un listado de
    // movimientos (el «movimientos (1).pdf» que Alberto subió tres veces el 07/08/2026). Pedirle
    // «una copia más clara» de un PDF perfectamente legible es mandarlo a arreglar lo que no falla.
    const listado = detectarListadoMovimientos(extraido.texto)
    if (listado) {
      const rango = listado.desde && listado.hasta ? ` (del ${fechaEs(listado.desde)} al ${fechaEs(listado.hasta)})` : ''
      return {
        ok: false,
        motivo: `Esto parece un listado de ${listado.lineas} movimientos${rango}, no una factura suelta. Los movimientos del banco entran solos por la sincronización; si quieres cargar este extracto, súbelo en /banca → Importar. Si de verdad es una factura, dime el importe y la fecha y te la cuadro.`,
      }
    }
    return interp
  }

  const cruce = await buscarCruce(cuentaId, interp.factura)
  return { ok: true, tipo: 'factura', factura: interp.factura, cruce }
}
