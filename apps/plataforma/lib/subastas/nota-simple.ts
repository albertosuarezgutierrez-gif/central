// ────────────────────────────────────────────────────────────────────────────
// NOTA SIMPLE VIVA. La certificación de dominio y cargas que el juzgado adjunta
// a la ficha del BOE está fechada años antes de la subasta (la de Belmonte, en
// agosto de 2020) y el registro no se congela: se cancelan hipotecas, caducan
// anotaciones del art. 86 LH y aparecen embargos nuevos. Una nota simple
// actualizada cuesta unos euros y es lo único que convierte «PODRÍA estar
// caducada» en un hecho.
//
// Este módulo cierra ese hueco: se sube la nota (PDF con texto, escaneada o
// pegada), la lee el MISMO lector registral que la certificación, y
// `compararCuadros` del módulo puro dice qué ha cambiado.
//
// 🚨 Dos decisiones que no son obvias:
//  1. La nota NO pisa las columnas `cargas_*` de `subastas`. Ese es el corpus
//     GLOBAL (compartido entre cuentas) y refleja lo que publica el BOE; la nota
//     la paga una cuenta y es suya. La ficha enseña las dos, cada una con su
//     fecha, en vez de mezclarlas en un número sin procedencia.
//  2. Si la lectura de la nota sale pobre, NO se concluye nada. Una nota mal
//     leída que «no ve» la hipoteca diría que la finca está limpia, que es el
//     error caro. Sin cargas leídas se devuelve el diff vacío y se dice que hay
//     que mirarla a mano.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  cargasQueSubsisten,
  compararCuadros,
  normalizarCuadroCargas,
  parsearFechaRegistral,
  pareceEscaneado,
  resumirCargas,
  type CambioCargas,
  type CuadroCargas,
} from '@central/module-subastas'
import { leerDocumento } from '@/lib/subastas/lector-registral'

/** Tamaño máximo aceptado: por encima es un escaneo a resolución absurda. */
export const MAX_BYTES_NOTA = 12 * 1024 * 1024

export interface NotaSimpleGuardada {
  id: string
  fechaNota: string | null
  cuadro: CuadroCargas
  cambios: CambioCargas[]
  importeSubsistente: number | null
  resumen: string | null
  confianza: number | null
  creadaEn: string
}

export interface ResultadoNotaSimple {
  cuadro: CuadroCargas
  cambios: CambioCargas[]
  importeSubsistente: number | null
  resumen: string
  fechaNota: string | null
  /** `true` cuando el lector no sacó ni una carga: la nota no dice nada utilizable. */
  ilegible: boolean
  avisos: string[]
}

/**
 * Fecha de expedición de la nota. El registro la escribe en la cabecera con
 * fórmulas muy variadas, así que se busca la primera fecha que aparezca cerca de
 * las palabras que la anuncian; si no hay ninguna se queda en `null` — poner la
 * fecha de SUBIDA sería inventar la antigüedad del dato, que es justo lo que
 * este módulo existe para no hacer.
 */
export function fechaDeLaNota(texto: string | null): string | null {
  if (!texto) return null
  const m = /(?:expedid[ao]|emitid[ao]|fecha\s+de\s+(?:expedici[oó]n|emisi[oó]n)|a\s+fecha\s+de)[^.\n]{0,60}/i.exec(texto)
  const parsed = parsearFechaRegistral(m ? m[0] : null)
  return parsed ? parsed.fecha.toISOString().slice(0, 10) : null
}

/**
 * Lee la nota simple y la contrasta con lo que ya se sabía de esa subasta.
 * Nunca lanza por culpa del documento: un PDF ilegible devuelve un resultado
 * vacío y explicado.
 */
export async function analizarNotaSimple(
  dedupeKey: string,
  contenido: { texto?: string | null; pdf?: Buffer | null; mediaType?: string | null },
): Promise<ResultadoNotaSimple> {
  const esImagen = /^image\//.test(contenido.mediaType ?? '')
  const texto = contenido.texto?.trim() || (esImagen || !contenido.pdf ? '' : await textoDePdf(contenido.pdf).catch(() => ''))
  const escaneado = !texto || pareceEscaneado(texto)

  const lectura = await leerDocumento({
    texto: escaneado ? null : texto,
    pdf: escaneado && contenido.pdf && !esImagen ? contenido.pdf : null,
    imagen: esImagen && contenido.pdf ? { mediaType: (contenido.mediaType ?? 'image/jpeg').split(';')[0], data: contenido.pdf.toString('base64') } : null,
  })

  const cuadro = lectura.cuadro
  const avisos = [...lectura.discrepancias]
  const fechaNota = fechaDeLaNota(texto)
  if (!fechaNota) {
    avisos.push('No se ha podido leer la fecha de expedición de la nota: compruébala en el propio documento antes de fiarte del diff.')
  }

  if (!cuadro.cargas.length) {
    return {
      cuadro,
      cambios: [],
      importeSubsistente: null,
      resumen: '',
      fechaNota,
      ilegible: true,
      avisos: [
        ...avisos,
        'El lector no ha sacado ninguna carga de la nota simple. Eso NO significa que la finca esté libre: puede ser un escaneo ilegible o un formato que no reconoce. Léela a mano antes de decidir nada.',
      ],
    }
  }

  const subsistentes = cargasQueSubsisten(cuadro, new Date())
  const anterior = await cuadroDeLaCertificacion(dedupeKey)
  const cambios = anterior ? compararCuadros(anterior, cuadro) : []
  if (!anterior) {
    avisos.push('No había cuadro de cargas leído de la certificación del BOE, así que no hay con qué comparar: esta nota pasa a ser la referencia.')
  }

  return {
    cuadro,
    cambios,
    importeSubsistente: subsistentes.importe,
    resumen: resumirCargas(cuadro, subsistentes),
    fechaNota,
    ilegible: false,
    avisos: [...avisos, ...subsistentes.avisos],
  }
}

/** Cuadro leído de la certificación adjunta al BOE (el corpus global). */
async function cuadroDeLaCertificacion(dedupeKey: string): Promise<CuadroCargas | null> {
  const filas = await prisma.$queryRaw<Array<{ cargas_detalle: unknown }>>(Prisma.sql`
    SELECT cargas_detalle FROM subastas WHERE dedupe_key = ${dedupeKey} LIMIT 1
  `)
  const bruto = filas[0]?.cargas_detalle
  if (!bruto || typeof bruto !== 'object') return null
  const cuadro = normalizarCuadroCargas(bruto, 'ocr_ia')
  return cuadro.cargas.length ? cuadro : null
}

/** Guarda la nota analizada. Histórico: nunca pisa la anterior. */
export async function guardarNotaSimple(
  cuentaId: string,
  dedupeKey: string,
  r: ResultadoNotaSimple,
): Promise<string> {
  const filas = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO subastas_notas_simples
      (cuenta_id, dedupe_key, fecha_nota, cuadro, cambios, importe_subsistente, resumen, confianza)
    VALUES (
      ${cuentaId}::uuid, ${dedupeKey}, ${r.fechaNota}::date,
      ${JSON.stringify(r.cuadro)}::jsonb, ${JSON.stringify(r.cambios)}::jsonb,
      ${r.importeSubsistente}, ${r.resumen}, ${r.cuadro.confianza}
    )
    RETURNING id
  `)
  return filas[0].id
}

/** Las notas simples que la cuenta ya subió de esta subasta, la más nueva primero. */
export async function notasSimplesDe(cuentaId: string, dedupeKey: string): Promise<NotaSimpleGuardada[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, fecha_nota, cuadro, cambios, importe_subsistente, resumen, confianza, creada_en
    FROM subastas_notas_simples
    WHERE cuenta_id = ${cuentaId}::uuid AND dedupe_key = ${dedupeKey}
    ORDER BY creada_en DESC
    LIMIT 10
  `)
  return filas.map((f) => ({
    id: f.id,
    fechaNota: f.fecha_nota ? new Date(f.fecha_nota).toISOString().slice(0, 10) : null,
    cuadro: f.cuadro,
    cambios: Array.isArray(f.cambios) ? f.cambios : [],
    importeSubsistente: f.importe_subsistente == null ? null : Number(f.importe_subsistente),
    resumen: f.resumen ?? null,
    confianza: f.confianza == null ? null : Number(f.confianza),
    creadaEn: new Date(f.creada_en).toISOString(),
  }))
}

async function textoDePdf(buf: Buffer): Promise<string> {
  // Mismo import perezoso que `documentos.ts`: el índice del paquete arrastra
  // artefactos de test que rompen el build.
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const { text } = await pdfParse(buf)
  return String(text ?? '')
}
