// ────────────────────────────────────────────────────────────────────────────
// Documentos APORTADOS A MANO a una subasta: red + BD. La lógica es pura
// (`docs-aportados-logica.ts`) y la lectura por IA vive en `lector-registral`.
//
// El caso de uso: las fichas con muro documental (`documentos_muro` total o
// parcial). El cron lee en anónimo y el login automático del Portal no es
// viable (2FA + captcha) — pero Alberto baja los PDFs con su sesión en dos
// minutos. Aquí se los da al lector: se leen con el MISMO pipeline que los
// adjuntos del BOE (doble pasada + consenso) y el resultado se escribe en las
// MISMAS columnas del corpus que escribe el cron, con su misma semántica
// (solo se pisa cuando hay cargas leídas; un documento ilegible no borra nada
// ni se convierte jamás en «sin cargas»).
//
// 🚨 Lo que NO se toca desde aquí:
//  · `subastas.documentos` — es el listado del PORTAL y el cron lo reescribe
//    entero en cada pasada: lo aportado vive en su tabla y la ficha lo enseña
//    aparte.
//  · `subastas.notas_edicto` — el cron lo pisa incondicionalmente al procesar
//    la ficha (un `''` suyo es «procesada sin hallazgos»), así que las señales
//    del edicto aportado se guardan en `subastas_docs_aportados.notas` y se
//    pintan desde ahí. Meterlas en la columna sería regalárselas a la
//    siguiente pasada semanal del muro.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  cargasQueSubsisten,
  datosDeEdicto,
  notasDeEdicto,
  pareceEscaneado,
  resumirCargas,
  type CuadroCargas,
} from '@central/module-subastas'
import { leerDocumento } from '@/lib/subastas/lector-registral'
import {
  aportaAlgo,
  cuadroParaCorpus,
  revivirCuadroGuardado,
  tituloDeAportado,
} from '@/lib/subastas/docs-aportados-logica'

/** Mismo techo que los adjuntos que baja el cron (`documentos.ts`). */
export const MAX_BYTES_APORTADO = 20 * 1024 * 1024

export interface DocAportadoGuardado {
  id: string
  titulo: string
  legible: boolean
  cargas: number
  notas: string[]
  creadaEn: string
}

export interface ResultadoAportado {
  titulo: string
  /** `false` = el lector no sacó nada de este documento: hay que leerlo a mano. */
  legible: boolean
  /** Cargas leídas de ESTE documento. */
  cargas: number
  /** Señales explícitas del edicto, si el texto las traía. */
  notas: string[]
  /** ¿Se escribió el corpus (`subastas.cargas_*`) con esta lectura? */
  aplicado: boolean
  /** Lo que hereda el adjudicatario según el cuadro COMBINADO. `null` = sin afirmar. */
  importeSubsistente: number | null
  resumen: string | null
  avisos: string[]
}

/**
 * Lee un documento aportado, lo guarda en el histórico y —si trae cargas—
 * actualiza el corpus de la subasta como lo haría el cron.
 */
export async function procesarDocAportado(
  cuentaId: string,
  dedupeKey: string,
  doc: { nombreFichero?: string | null; titulo?: string | null; texto?: string | null; pdf?: Buffer | null; mediaType?: string | null },
): Promise<ResultadoAportado> {
  const filas = await prisma.$queryRaw<Array<{ dedupe_key: string; cargas_detalle: unknown }>>(Prisma.sql`
    SELECT dedupe_key, cargas_detalle FROM subastas WHERE dedupe_key = ${dedupeKey} LIMIT 1
  `)
  if (!filas.length) throw new Error('Subasta no encontrada')

  const titulo = tituloDeAportado(doc.nombreFichero, doc.titulo)
  const esImagen = /^image\//.test(doc.mediaType ?? '')
  const texto = doc.texto?.trim() || (esImagen || !doc.pdf ? '' : await textoDePdf(doc.pdf).catch(() => ''))
  const escaneado = !texto || pareceEscaneado(texto)

  const lectura = await leerDocumento({
    texto: escaneado ? null : texto,
    pdf: escaneado && doc.pdf && !esImagen ? doc.pdf : null,
    imagen: esImagen && doc.pdf ? { mediaType: (doc.mediaType ?? 'image/jpeg').split(';')[0], data: doc.pdf.toString('base64') } : null,
  })
  // El título viaja con cada carga: es lo que permite a `fusionarCargas`
  // arbitrar el rango por autoridad documental (la certificación manda).
  const cuadro: CuadroCargas = {
    ...lectura.cuadro,
    cargas: lectura.cuadro.cargas.map((c) => ({ ...c, documento: titulo })),
  }
  const notas = texto ? notasDeEdicto(datosDeEdicto(texto)) : []
  const legible = aportaAlgo({ cuadro, notas })

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO subastas_docs_aportados (cuenta_id, dedupe_key, titulo, via, paginas, legible, cuadro, notas)
    VALUES (
      ${cuentaId}::uuid, ${dedupeKey}, ${titulo}, ${lectura.via}, ${lectura.paginas}, ${legible},
      ${legible ? JSON.stringify(cuadro) : null}::jsonb, ${JSON.stringify(notas)}::jsonb
    )
  `)

  if (!legible) {
    return {
      titulo,
      legible: false,
      cargas: 0,
      notas: [],
      aplicado: false,
      importeSubsistente: null,
      resumen: null,
      avisos: [
        'El lector no ha sacado nada de este documento. Eso NO significa que esté limpio: puede ser un escaneo ilegible o un formato que no reconoce. Léelo a mano antes de decidir.',
        ...lectura.discrepancias,
      ],
    }
  }

  // ── Al corpus, con la semántica del cron ──────────────────────────────────
  const combinado = cuadroParaCorpus(revivirCuadroGuardado(filas[0].cargas_detalle), [cuadro])
  if (!combinado) {
    // Señales del edicto sin cuadro de cargas: se guardan y se enseñan, pero
    // no hay nada que afirmar sobre las cargas.
    return { titulo, legible: true, cargas: 0, notas, aplicado: false, importeSubsistente: null, resumen: null, avisos: lectura.discrepancias }
  }

  const subsistentes = cargasQueSubsisten(combinado, new Date())
  const hayCargas = combinado.cargas.length > 0
  const resumen = hayCargas ? resumirCargas(combinado, subsistentes) : null

  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas SET
      cargas_detalle = COALESCE(${hayCargas ? JSON.stringify(combinado) : null}::jsonb, cargas_detalle),
      -- Mismo criterio que el cron: cuando SÍ se han leído cargas, el importe
      -- se pisa aunque sea null («subsisten sin cuantificar» es un estado
      -- honesto; un COALESCE lo taparía con la cifra vieja).
      cargas = CASE WHEN ${hayCargas} THEN ${subsistentes.importe}::numeric ELSE cargas END,
      cargas_texto = COALESCE(${resumen}, cargas_texto),
      cargas_conocidas = (COALESCE(cargas_conocidas, false) OR ${hayCargas}),
      cargas_fuente = COALESCE(${hayCargas ? combinado.fuente : null}, cargas_fuente),
      valoracion_pactada = COALESCE(${combinado.valoracionPactada?.importe ?? null}, valoracion_pactada),
      valoracion_pactada_anio = COALESCE(${combinado.valoracionPactada?.anio ?? null}, valoracion_pactada_anio),
      actualizado_en = now()
    WHERE dedupe_key = ${dedupeKey}
  `)

  return {
    titulo,
    legible: true,
    cargas: cuadro.cargas.length,
    notas,
    aplicado: true,
    importeSubsistente: subsistentes.importe,
    resumen,
    avisos: [...lectura.discrepancias, ...subsistentes.avisos],
  }
}

/** Los documentos que la cuenta ya aportó a esta subasta, el más nuevo primero. */
export async function docsAportadosDe(cuentaId: string, dedupeKey: string): Promise<DocAportadoGuardado[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, titulo, legible, cuadro, notas, creada_en
    FROM subastas_docs_aportados
    WHERE cuenta_id = ${cuentaId}::uuid AND dedupe_key = ${dedupeKey}
    ORDER BY creada_en DESC
    LIMIT 20
  `)
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    legible: f.legible === true,
    cargas: Array.isArray(f.cuadro?.cargas) ? f.cuadro.cargas.length : 0,
    notas: Array.isArray(f.notas) ? f.notas : [],
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
