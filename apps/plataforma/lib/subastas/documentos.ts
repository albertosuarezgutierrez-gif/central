// ────────────────────────────────────────────────────────────────────────────
// Documentos adjuntos a la ficha del BOE: descarga + lectura completa.
// Aquí va SOLO la red y la BD; el parseo y la lógica son puros
// (`@central/module-subastas`), y la lectura por IA vive en `lector-registral`.
//
// Qué hace por subasta: baja la ficha, lista TODOS sus documentos, y de cada uno
// saca (a) las señales explícitas del edicto por regex y (b) el cuadro de cargas
// estructurado. Los PDF escaneados —que son la mayoría de las certificaciones—
// se rescatan extrayendo sus imágenes y leyéndolas con un modelo de visión.
//
// 🚨 Tres fallos que tenía la versión anterior y que dejaban 30 de 34 subastas
// vigentes diciendo «Cargas no publicadas» (auditado el 30/07/2026):
//   1. `MIN_CHARS_TEXTO` descartaba en SILENCIO los escaneos. La certificación de
//      Belmonte pesaba 3,2 MB y `pdf-parse` devolvía 0 caracteres: se saltaba.
//   2. `notas_edicto = ''` («procesada sin hallazgos») CONGELABA la ficha para
//      siempre: la consulta solo cogía `notas_edicto IS NULL`, así que una ficha
//      mal leída una vez no se reintentaba nunca. Ahora hay versión de lector.
//   3. Tope de 3 documentos por ficha, sin criterio: si la certificación era el
//      cuarto enlace, no se leía.
//
// El coste se controla con un GATE de rentabilidad, no recortando la lectura: se
// analizan a fondo solo las subastas que ya han pasado el filtro de chollo/flip
// (decisión de Alberto, 30/07/2026: «solo chollos y rentables»).
//
// El LISTADO de documentos se guarda entero en `documentos` (jsonb) aunque no se
// lean todos: saber que la subasta TIENE una certificación de cargas —y poder
// abrirla— vale por sí mismo. `legible:false` = no se ha podido leer (hay que
// abrirlo a mano); `null` = no se llegó a intentar.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  cargasQueSubsisten,
  datosDeEdicto,
  enlacesDocumentos,
  esDocumentoDeCargas,
  fichaLegible,
  mismoAcreedorQueEjecutante,
  notasDeEdicto,
  pareceEscaneado,
  resumirCargas,
  DIAS_PARA_ARCHIVAR,
  type CuadroCargas,
} from '@central/module-subastas'
import { fusionarCuadros, leerDocumento, type LecturaDocumento } from '@/lib/subastas/lector-registral'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FICHA = 'https://subastas.boe.es/detalleSubasta.php'
const MAX_DOCS_POR_FICHA = 6
const MAX_BYTES_DOC = 20 * 1024 * 1024

/**
 * Versión del lector. Se guarda en `subastas.lector_version`: al subirla, las
 * fichas ya procesadas se vuelven a leer en la siguiente pasada. Es lo que
 * arregla el punto 2 de arriba — sin esto, mejorar el prompt no rescata nada de
 * lo ya (mal) leído.
 */
export const LECTOR_VERSION = 9

/** Documentos que NO merecen una llamada de IA: no contienen cargas. */
const RUIDO = /^(justificante|minuta|honorarios|tasa|pago|aranceles?)\b/i

async function bajar(url: string, ms = 30000): Promise<Response> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r
}

async function textoDePdf(buf: Buffer): Promise<string> {
  // Import perezoso del implementador interno (patrón de lib/concursos.ts:
  // el índice del paquete arrastra artefactos de test que rompen el build).
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const { text } = await pdfParse(buf)
  return String(text ?? '')
}

/** Un documento de la ficha tal y como se guarda en `subastas.documentos`. */
export interface DocumentoAdjunto {
  titulo: string
  url: string
  /** `false` = no se ha podido leer automáticamente (escaneado sin visión, o error).
   *  `null` = no se intentó (tope de descargas por pasada). */
  legible: boolean | null
}

export interface ResultadoFicha {
  notas: string[]
  cuadro: CuadroCargas
  /** Documentos que se han podido leer (con texto o por visión). */
  leidos: number
  /** Detalle por documento, para poder auditar de dónde salió cada cifra. */
  detalle: Array<{ titulo: string; via: string; paginas: number; cargas: number; discrepancias: string[] }>
  /** TODOS los documentos que publica la ficha, no solo los leídos. */
  documentos: DocumentoAdjunto[]
  /** ¿Se llegó a llamar al lector registral (IA) en esta ficha? */
  analisisProfundo: boolean
}

/**
 * Procesa TODOS los documentos de UNA ficha: señales del edicto + cuadro de
 * cargas. `leerCargas: false` se queda en las señales por regex (gratis), para
 * las subastas que no han pasado el gate de rentabilidad.
 */
export async function procesarDocumentosDeFicha(
  identificador: string,
  opts: { leerCargas?: boolean } = {},
): Promise<ResultadoFicha> {
  const html = await (await bajar(`${FICHA}?idSub=${encodeURIComponent(identificador)}`)).text()
  // 🚨 Antes de creerse un «no hay adjuntos», comprobar que esto ES la ficha.
  // Un 200 que no lo sea daría `[]`, se grabaría como «sin documentos» y la
  // cola no volvería a mirar esta subasta jamás. Lanzando, la fila se queda a
  // NULL («sin revisar») y se reintenta en la pasada siguiente.
  if (!fichaLegible(html, identificador)) {
    throw new Error('la respuesta del Portal no es la ficha de esta subasta')
  }
  // Se listan TODOS (los enlaces son gratis) y se descargan solo los primeros.
  const todos = enlacesDocumentos(html)

  // 🚨 El gate de RENTABILIDAD no puede ser también el gate de LECTURA.
  // Si la ficha publica la certificación de cargas, se lee — punto. Una lectura
  // cuesta céntimos; pujar sin saber qué cargas se heredan cuesta el inmueble.
  // Caso real (01/08/2026, SUB-JA-2026-264478): salida = tasación, margen de
  // flip −30,6% → `mereceAnalisisProfundo` decía que no, la certificación se
  // descargaba pero NUNCA se analizaba, y la ficha remataba diciendo «Cargas no
  // publicadas» con el PDF enlazado justo debajo.
  const leerCargas = (opts.leerCargas ?? false) || todos.some((d) => esDocumentoDeCargas(d.titulo))

  const notas = new Set<string>()
  const lecturas: LecturaDocumento[] = []
  const detalle: ResultadoFicha['detalle'] = []
  const documentos: DocumentoAdjunto[] = todos.map((d) => ({ titulo: d.titulo, url: d.url, legible: null }))
  let leidos = 0

  // Los documentos de cargas se descargan PRIMERO: con el tope de
  // `MAX_DOCS_POR_FICHA`, una certificación que fuera el séptimo enlace se
  // quedaba fuera por orden de aparición, que es un criterio que no significa nada.
  const orden = todos
    .map((_, i) => i)
    .sort((a, b) => Number(esDocumentoDeCargas(todos[b].titulo)) - Number(esDocumentoDeCargas(todos[a].titulo)))
    .slice(0, MAX_DOCS_POR_FICHA)

  for (const i of orden) {
    const doc = todos[i]
    try {
      const r = await bajar(doc.url, 40000)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > MAX_BYTES_DOC) continue

      const tipo = r.headers.get('content-type') ?? ''
      const esImagen = /^image\//.test(tipo)
      const texto = esImagen ? '' : await textoDePdf(buf).catch(() => '')
      const escaneado = !esImagen && pareceEscaneado(texto)

      // Señales explícitas del edicto: solo del texto, y gratis.
      if (texto) {
        for (const n of notasDeEdicto(datosDeEdicto(texto))) notas.add(n)
        documentos[i].legible = true
        leidos++
      }

      // Sin análisis profundo un escaneo se queda sin leer: la ficha debe poder
      // decir «ábrelo a mano» en vez de callar.
      if (!leerCargas || RUIDO.test(doc.titulo)) {
        if (escaneado || esImagen) documentos[i].legible = false
        continue
      }

      const lectura = await leerDocumento({
        texto: escaneado ? null : texto || null,
        pdf: escaneado ? buf : null,
        imagen: esImagen ? { mediaType: tipo.split(';')[0], data: buf.toString('base64') } : null,
      })
      if (escaneado || esImagen) {
        // La visión lo ha rescatado solo si ha devuelto páginas de verdad.
        documentos[i].legible = lectura.paginas > 0
        leidos++
      }

      // De qué documento sale cada carga: sin esto `fusionarCargas` no puede
      // arbitrar cuando la certificación y una nota simple se contradicen en el
      // RANGO, y coger «el más caro» inventa cargas heredadas (Punta Umbría).
      lecturas.push({
        ...lectura,
        cuadro: { ...lectura.cuadro, cargas: lectura.cuadro.cargas.map((c) => ({ ...c, documento: doc.titulo })) },
      })
      detalle.push({
        titulo: doc.titulo,
        via: lectura.via,
        paginas: lectura.paginas,
        cargas: lectura.cuadro.cargas.length,
        discrepancias: lectura.discrepancias,
      })
    } catch (e) {
      documentos[i].legible = false
      console.warn('[subastas-documentos]', identificador, doc.titulo, e)
    }
  }

  return { notas: [...notas], cuadro: fusionarCuadros(lecturas), leidos, detalle, documentos, analisisProfundo: leerCargas }
}

/** Fila mínima que necesita la pasada. */
interface FilaPendiente {
  dedupe_key: string
  identificador: string
  autoridad: string | null
  flip_apto: boolean | null
  margen_flip_pct: number | null
  es_playa: boolean | null
  descuento_estimado: number | null
}

/**
 * ¿Merece esta subasta el análisis profundo (que cuesta llamadas de IA)?
 * El embudo de Alberto: primero rentabilidad, y solo si cuadra, documentación.
 * Entra si es un flip viable, si es de la costa de Huelva o de Cádiz (segunda residencia,
 * sin tope de precio) o si el descuento estimado ya es goloso.
 */
export function mereceAnalisisProfundo(f: {
  flip_apto: boolean | null
  margen_flip_pct: number | null
  es_playa: boolean | null
  descuento_estimado: number | null
}): boolean {
  if (f.es_playa) return true
  if (f.flip_apto && (f.margen_flip_pct ?? 0) >= 0.25) return true
  return (f.descuento_estimado ?? 0) >= 0.4
}

/**
 * Pasada sobre las subastas vivas: lee los documentos de las que no están al día
 * con la versión actual del lector. Best-effort: un fallo de descarga deja la
 * fila como está y se reintenta mañana.
 */
export async function procesarDocumentos(max = 10): Promise<{
  revisadas: number
  conHallazgos: number
  conCargas: number
  analizadas: number
}> {
  const filas = await prisma.$queryRaw<FilaPendiente[]>(Prisma.sql`
    SELECT dedupe_key, identificador, autoridad, flip_apto, margen_flip_pct, es_playa,
           CASE
             WHEN COALESCE(tasacion, valor_referencia) > 0 AND valor_subasta > 0
               THEN 1 - (valor_subasta / COALESCE(tasacion, valor_referencia))
             ELSE NULL
           END AS descuento_estimado
    FROM subastas
    WHERE fuente = 'boe' AND identificador IS NOT NULL
      AND es_inmueble = true
      AND (fecha_fin IS NULL OR fecha_fin >= now())
      AND (COALESCE(lector_version, 0) < ${LECTOR_VERSION} OR documentos IS NULL)
    ORDER BY fecha_fin ASC NULLS LAST
    LIMIT ${max}
  `)

  let conHallazgos = 0
  let conCargas = 0
  let analizadas = 0

  for (const f of filas) {
    try {
      // El gate de rentabilidad solo ADELANTA la decisión: la ficha puede
      // volver a decir que sí si publica un documento de cargas (que no se sabe
      // hasta haberla bajado). El contador cuenta lo que de verdad se analizó.
      const r = await procesarDocumentosDeFicha(f.identificador, { leerCargas: mereceAnalisisProfundo(f) })
      if (r.analisisProfundo) analizadas++

      // Con fecha: así el resumen guardado ya marca las anotaciones que por el
      // art. 86 LH podrían estar caducadas (marcar, no descontar).
      const subsistentes = cargasQueSubsisten(r.cuadro, new Date())
      const hayCargas = r.cuadro.cargas.length > 0
      if (hayCargas) conCargas++
      if (r.notas.length) conHallazgos++

      // El ejecutante suele venir en la autoridad/descripción: si coincide con el
      // acreedor de una carga anterior, el riesgo baja mucho (el crédito ejecutado
      // es el garantizado por ella). Se anota, no se decide por él.
      const mismoAcreedor = mismoAcreedorQueEjecutante(r.cuadro.cargas, f.autoridad)
      const notas = mismoAcreedor
        ? [...r.notas, 'El ejecutante figura también como acreedor de una carga anterior: esa carga podría cancelarse al satisfacerse el crédito (confirmar con el juzgado).']
        : r.notas

      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas SET
          notas_edicto = ${notas.join('\n')},
          lector_version = ${LECTOR_VERSION},
          -- Solo se escriben las cargas cuando de verdad se han leído: una pasada
          -- sin análisis profundo NO puede borrar lo que ya se sabía.
          cargas_detalle = COALESCE(${hayCargas ? JSON.stringify(r.cuadro) : null}::jsonb, cargas_detalle),
          -- OJO: aquí NO vale COALESCE. Cuando la lectura SÍ se hizo y concluye
          -- «subsisten cargas pero no se pueden cuantificar», el importe es null a
          -- propósito, y un COALESCE lo rellenaría con la CIFRA VIEJA: la ficha
          -- diría «hereda 43.200,00€» justo encima de «cargas subsistentes sin
          -- cuantificar». Se pisa siempre que se hayan leído cargas — quedarse en
          -- null es «no lo sé» (🟠), que es el estado honesto, no «no hay».
          cargas = CASE WHEN ${hayCargas} THEN ${subsistentes.importe}::numeric ELSE cargas END,
          cargas_texto = COALESCE(${hayCargas ? resumirCargas(r.cuadro, subsistentes) : null}, cargas_texto),
          cargas_conocidas = (COALESCE(cargas_conocidas, false) OR ${hayCargas}),
          cargas_fuente = COALESCE(${hayCargas ? r.cuadro.fuente : null}, cargas_fuente),
          -- Tasación pactada en la escritura: alimenta la serie de €/m² propia.
          valoracion_pactada = COALESCE(${r.cuadro.valoracionPactada?.importe ?? null}, valoracion_pactada),
          valoracion_pactada_anio = COALESCE(${r.cuadro.valoracionPactada?.anio ?? null}, valoracion_pactada_anio),
          documentos_leidos = ${r.leidos},
          documentos = ${JSON.stringify(r.documentos)}::jsonb,
          actualizado_en = now()
        WHERE dedupe_key = ${f.dedupe_key}
      `)
    } catch (e) {
      console.error('[subastas-documentos]', f.identificador, e)
    }
  }

  return { revisadas: filas.length, conHallazgos, conCargas, analizadas }
}

/**
 * Cierre del ciclo: saca de la VISTA lo que ya pasó, conservando el histórico.
 *
 * Alberto pidió «borrar las pasadas», y en la misma frase apuntó que hay fincas
 * que salen varias veces — que es exactamente la razón para NO borrarlas:
 *  · sin la convocatoria vieja no se detecta que la finca vuelve más barata;
 *  · sin los resultados no hay calibración (la memoria del agente).
 *
 * Así que se borra la BANDEJA de avisos (`subastas_radar`, efímera por diseño) y
 * se marca la subasta como archivada. El histórico se queda.
 */
export async function archivarPasadas(): Promise<{ archivadas: number; radarLimpiado: number }> {
  // Archivadas: pasadas CON resultado conocido, o pasadas hace tanto que el
  // portal ya no va a publicarlo (DIAS_PARA_ARCHIVAR del módulo).
  const archivadas = await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas SET archivada_at = now(), actualizado_en = now()
    WHERE archivada_at IS NULL
      AND fecha_fin IS NOT NULL
      AND fecha_fin < now()
      AND (resultado IS NOT NULL OR fecha_fin < now() - make_interval(days => ${DIAS_PARA_ARCHIVAR}::int))
  `)

  // La bandeja de avisos de lo ya cerrado: eso sí se borra, no sirve de nada.
  // SIN día de gracia (01/08/2026): con `now() - 1 day` una subasta que cerraba
  // a las 18:13 seguía en la bandeja hasta la pasada del día SIGUIENTE, así que
  // Alberto la veía «viva» al día siguiente de vencer. Aun así esto es solo la
  // recogida de basura: quien garantiza que no se pinte es `RADAR_VIGENTE` en la
  // lectura — un `DELETE` diario no puede ser lo único que evite decir algo falso.
  const radarLimpiado = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM subastas_radar r
    USING subastas s
    WHERE s.dedupe_key = r.dedupe_key
      AND s.fecha_fin IS NOT NULL
      AND s.fecha_fin < now()
  `)

  return { archivadas: Number(archivadas), radarLimpiado: Number(radarLimpiado) }
}
