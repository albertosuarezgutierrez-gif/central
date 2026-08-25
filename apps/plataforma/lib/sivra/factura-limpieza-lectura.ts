// lib/sivra/factura-limpieza-lectura.ts — leer la factura de Sique Brilla y guardarla si cuadra.
//
// El LAYOUT lo lee la IA, nunca una expresión regular escrita de memoria (ver la cabecera de
// `factura-limpieza.ts`). Este módulo es el borde sucio: PDF → texto o visión → JSON → validación
// aritmética → BD. Toda la decisión vive en el helper puro; aquí solo hay red, IA y SQL.

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { chatConDirector } from '@/lib/pasarela'
import { aiVision } from '@/lib/ai-client'
import { parsearJsonIa } from '@/lib/agente-facturas/parsear-json-ia'
import { pareceEscaneado } from '@central/module-subastas'
import { paginasDePdfEscaneado } from '@/lib/subastas/lector-registral'
import { rasterizarPdf } from '@/lib/subastas/rasterizar-pdf'
import {
  desgloseDeFactura,
  validarFactura,
  type FacturaCruda,
  type FacturaLimpieza,
} from './factura-limpieza'

export const PROVEEDOR_LIMPIEZA = 'sique_brilla'
export const MAX_BYTES_FACTURA = 15 * 1024 * 1024

const SYSTEM = `Eres un lector de facturas de una empresa de limpieza de apartamentos turísticos.
Devuelves SOLO un objeto JSON, sin texto alrededor y sin vallas de código.

Esquema exacto:
{
  "numero": string|null,        // número de factura tal cual aparece
  "periodo": string|null,       // mes de los SERVICIOS en formato YYYY-MM (no la fecha de emisión)
  "fecha": string|null,         // fecha de emisión YYYY-MM-DD
  "total": number,              // TOTAL de la factura, CON IVA
  "base": number|null,          // base imponible
  "iva": number|null,           // cuota de IVA
  "limpieza": [                 // una entrada por LÍNEA de limpieza de un apartamento
    { "concepto": string,       // el texto de la línea tal cual (p. ej. "Luxury (5x28€)")
      "sesiones": number,       // cuántas limpiezas
      "tarifa": number,         // precio por limpieza, SIN IVA
      "importe": number|null }  // importe de la línea, SIN IVA
  ],
  "lavanderia": [               // una entrada por línea de lavandería / lencería / kg de ropa
    { "concepto": string, "importe": number }   // SIN IVA
  ]
}

Reglas:
- Los importes son NÚMEROS con punto decimal (86.18), nunca cadenas ni con símbolo de euro.
- No inventes líneas ni cifras: si un dato no está en el documento, pon null.
- Si una línea mezcla varios apartamentos, devuélvela como varias entradas.
- Todo lo que no sea limpieza de un apartamento concreto ni lavandería, ignóralo.`

async function textoDePdf(buf: Buffer): Promise<string> {
  // Import perezoso del implementador interno (mismo patrón que `lib/subastas/documentos.ts`:
  // el índice del paquete arrastra artefactos de test que rompen el build).
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const { text } = await pdfParse(buf)
  return String(text ?? '')
}

async function leerConIa(contenido: { texto?: string | null; pdf?: Buffer | null; mediaType?: string | null }): Promise<{
  cruda: FacturaCruda | null
  via: 'texto' | 'vision'
  error: string | null
}> {
  const esImagen = /^image\//.test(contenido.mediaType ?? '')
  const texto = contenido.texto?.trim() || (esImagen || !contenido.pdf ? '' : await textoDePdf(contenido.pdf).catch(() => ''))

  // La respuesta puede venir con vallas ```json o cortada: `parsearJsonIa` lo tolera y, cuando
  // no hay objeto legible, dice que NO se ha podido leer — nunca devuelve una factura vacía.
  const aFactura = (raw: string): FacturaCruda | null => {
    const { datos, ok } = parsearJsonIa(raw)
    if (!ok) return null
    return {
      numero: datos.numero ?? null,
      periodo: datos.periodo ?? null,
      fecha: datos.fecha ?? null,
      total: datos.total ?? null,
      base: datos.base ?? null,
      iva: datos.iva ?? null,
      limpieza: Array.isArray(datos.limpieza) ? datos.limpieza : [],
      lavanderia: Array.isArray(datos.lavanderia) ? datos.lavanderia : [],
    }
  }

  try {
    if (texto && !pareceEscaneado(texto)) {
      // 🚨 El modelo del catálogo se pide con `categoria`, NUNCA con `modelo` (landmine del
      // lector registral, 24/08/2026: `modelo` salta OpenRouter y el id acaba en NVIDIA → 404).
      const { text } = await chatConDirector(
        [{ role: 'user', content: `--- FACTURA ---\n${texto.slice(0, 20_000)}` }],
        { app: 'plataforma', endpoint: 'factura-limpieza', system: SYSTEM, categoria: 'registral', maxTokens: 1500, timeoutMs: 60_000 },
      )
      return { cruda: aFactura(text), via: 'texto', error: null }
    }

    // Escaneada o foto: por visión, con el mismo respaldo de rasterizado que el lector registral
    // (los escaneos en CCITT/JBIG2 no llevan un solo JPEG que rescatar).
    let paginas = esImagen && contenido.pdf
      ? [{ data: contenido.pdf.toString('base64'), mediaType: contenido.mediaType ?? 'image/jpeg' }]
      : contenido.pdf ? await paginasDePdfEscaneado(contenido.pdf).catch(() => []) : []
    if (!paginas.length && contenido.pdf && !esImagen) {
      paginas = await rasterizarPdf(contenido.pdf, 4).catch(() => [])
    }
    if (!paginas.length) {
      return { cruda: null, via: 'vision', error: 'No se ha podido extraer ni texto ni imágenes del documento' }
    }
    const text = await aiVision(
      SYSTEM,
      paginas,
      'Esta es una factura de limpieza de apartamentos. Devuelve el JSON del esquema.',
      { maxTokens: 1500, endpoint: 'factura-limpieza-vision', multiPagina: paginas.length > 1, timeoutMs: 120_000 },
    )
    return { cruda: aFactura(text), via: 'vision', error: null }
  } catch (e) {
    return { cruda: null, via: texto ? 'texto' : 'vision', error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Guarda una factura ya validada. Reimportar la misma NUNCA duplica: sería gasto doble en el P&L.
 *
 * 🚨 Dos caminos porque Postgres no puede deduplicar el segundo: con número, el índice único
 * parcial y `ON CONFLICT`; SIN número, un DELETE explícito con `IS NOT DISTINCT FROM` — un índice
 * único no sirve ahí, porque dos NULL no colisionan y la misma factura sin numerar entraría dos
 * veces. La clave del caso sin número es importe + fecha: dos facturas del mismo proveedor por el
 * mismo importe el mismo día son, a todos los efectos, la misma.
 */
export async function guardarFactura(
  cuentaId: string,
  factura: FacturaLimpieza,
  fuente: 'pdf_ia' | 'manual',
  avisos: string[],
  nombreFichero: string | null = null,
): Promise<void> {
  const fecha = factura.fecha ? new Date(factura.fecha) : null
  if (!factura.numero) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM limpieza_facturas
      WHERE cuenta_id = ${cuentaId} AND proveedor = ${PROVEEDOR_LIMPIEZA}
        AND numero IS NULL
        AND total = ${factura.total}
        AND fecha IS NOT DISTINCT FROM ${fecha}
    `)
  }
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO limpieza_facturas
      (id, cuenta_id, proveedor, numero, periodo, fecha, total, base, iva, lavanderia, limpieza, fuente, nombre_fichero, avisos)
    VALUES (
      ${randomUUID()}, ${cuentaId}, ${PROVEEDOR_LIMPIEZA}, ${factura.numero}, ${factura.periodo},
      ${fecha}, ${factura.total}, ${factura.base}, ${factura.iva},
      ${factura.lavanderia}, ${JSON.stringify(factura.limpieza)}::jsonb, ${fuente},
      ${nombreFichero}, ${JSON.stringify(avisos)}::jsonb
    )
    ON CONFLICT (cuenta_id, proveedor, numero) WHERE numero IS NOT NULL
    DO UPDATE SET
      periodo = EXCLUDED.periodo, fecha = EXCLUDED.fecha, total = EXCLUDED.total,
      base = EXCLUDED.base, iva = EXCLUDED.iva, lavanderia = EXCLUDED.lavanderia,
      limpieza = EXCLUDED.limpieza, avisos = EXCLUDED.avisos,
      fuente = EXCLUDED.fuente, nombre_fichero = EXCLUDED.nombre_fichero
  `)
}

export interface ResultadoFactura {
  /** `null` = no se ha podido afirmar el desglose; `motivo` dice por qué. */
  factura: FacturaLimpieza | null
  guardada: boolean
  via: 'texto' | 'vision'
  avisos: string[]
  motivo: string | null
}

/**
 * Lee una factura de limpieza y la guarda SOLO si sus líneas cuadran con su total.
 * Nunca lanza por un documento ilegible: devuelve el motivo y el P&L sigue con su inferencia.
 */
export async function procesarFacturaLimpieza(
  cuentaId: string,
  doc: { texto?: string | null; pdf?: Buffer | null; mediaType?: string | null; nombreFichero?: string | null },
  tarifas: Record<string, number>,
): Promise<ResultadoFactura> {
  const { cruda, via, error } = await leerConIa(doc)
  if (!cruda) {
    return { factura: null, guardada: false, via, avisos: [], motivo: error ?? 'La IA no ha devuelto un JSON utilizable' }
  }

  const { factura, avisos } = validarFactura(cruda, tarifas)
  if (!factura) {
    return { factura: null, guardada: false, via, avisos, motivo: avisos[0] ?? 'La lectura no cuadra con el total' }
  }

  await guardarFactura(cuentaId, factura, 'pdf_ia', avisos, doc.nombreFichero ?? null)
  return { factura, guardada: true, via, avisos, motivo: null }
}

/** Fila de `limpieza_facturas` tal como la consume el P&L. */
export interface FacturaGuardada {
  id: string
  numero: string | null
  periodo: string | null
  total: number
  limpieza: Map<string, number>
  lavanderia: number
}

/**
 * Facturas cuyo TOTAL podría casar con un pago del mes. Se piden por importe (no por periodo):
 * el mes de servicio de la factura y el mes de caja del pago son distintos por diseño.
 */
export async function facturasParaImportes(importes: number[]): Promise<FacturaGuardada[]> {
  if (!importes.length) return []
  const filas = await prisma.$queryRaw<Array<{
    id: string; numero: string | null; periodo: string | null; total: string | number
    lavanderia: string | number; limpieza: unknown
  }>>(Prisma.sql`
    SELECT id, numero, periodo, total, lavanderia, limpieza
    FROM limpieza_facturas
    WHERE proveedor = ${PROVEEDOR_LIMPIEZA}
      AND total = ANY(${importes}::numeric[])
    ORDER BY creada_at
  `)
  return filas.map(f => {
    const guardada: FacturaLimpieza = {
      numero: f.numero, periodo: f.periodo, fecha: null,
      total: Number(f.total), base: 0, iva: 0,
      lavanderia: Number(f.lavanderia),
      limpieza: (Array.isArray(f.limpieza) ? f.limpieza : []) as FacturaLimpieza['limpieza'],
    }
    const d = desgloseDeFactura(guardada)
    return {
      id: f.id,
      numero: f.numero,
      periodo: f.periodo,
      total: Number(f.total),
      limpieza: d.limpieza,
      lavanderia: d.lavanderia,
    }
  })
}
