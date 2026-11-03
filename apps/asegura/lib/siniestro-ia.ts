// IA del siniestro = «gabinete de siniestros» (analizar / redactar). Todo de ESA correduría.
//  · ANALIZAR: (1) ÍNDICE de la póliza con el modelo BARATO, cacheado en el meta del análisis por huella de los
//    documentos; (2) FICHA del caso con el modelo barato, cacheada por huella del hilo vigente; (3) VEREDICTO JSON
//    con el modelo BUENO + base de conocimiento fija (`CONOCIMIENTO_SINIESTROS`). Con índice completo NO se manda el
//    texto entero de la póliza. Cada paso es UNA llamada (`llamarIA`, sin reintentos). Si el veredicto no valida, se
//    guarda el texto tal cual y `meta.veredicto = null`.
//  · REDACTAR: una llamada con el modelo bueno; destinatario 'compania' | 'compania_intranet' | 'cliente'.
// Toda cita (texto, índice y veredicto) pasa por `verificarCitas` contra su fuente. El texto del PDF y el hilo van a
// la IA (por la pasarela, `privado`), nunca a `historial_interno`.
import {
  verificarCitas, avisoCitasNoEncontradas, hiloVigente, huellaDocumentos, huellaHilo, indiceCacheado, fichaCacheada,
  ultimoVeredicto, validarIndicePoliza, validarFichaCaso, validarVeredicto, verificarCitasIndice, verificarCitasVeredicto,
  textoVeredicto, metaGabinete, correccionesDeValoraciones, esValoracion, encajarMeta, CONOCIMIENTO_SINIESTROS, MODELO_POLIZA_DEFECTO, WHERE_CARTERA_EN_VIGOR,
  INDICE_POLIZA_VERSION, FICHA_CASO_VERSION,
  type IndicePolizaCacheado, type FichaCasoCacheada, type Veredicto,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { iaTexto } from './ia'
import { textoPdfParse } from './documentos/extraer-poliza'
import { pdfDePoliza } from './poliza-pdf'
import { registrarErrorCartera } from './error-cartera'
import { anadirMensajeSiniestro, leerHiloSiniestro, type FalloHilo, type MensajeSiniestro } from './siniestro-hilo'
import {
  promptSistemaSiniestro, promptSistemaVeredicto, PROMPT_FICHA_CASO, PROMPT_INDICE_POLIZA,
  type AccionSiniestroIA, type DestinatarioSiniestroIA,
} from './siniestro-ia-prompt'
import { MODELO_FORMADOR_POTENTE_POR_DEFECTO, modeloFormador } from './tarificador-formador-reglas'

export const TOPE_TEXTO_POLIZA = 120_000
const TOPE_COBERTURAS = 4_000
const TOPE_HILO = 40_000
const TOPE_HILO_CON_FICHA = 12_000
const TOPE_NOTAS = 8_000
const MAX_TOKENS = 4_000
const MAX_TOKENS_EXTRACCION = 4_500
const TIMEOUT_MS = 120_000
const TIMEOUT_EXTRACCION_MS = 60_000
/** Tope del meta EN CLARO antes de cifrar: el sobre `meta.privado` crece ~1,4× y el hilo admite 20.000 bytes (19.000 / 1,4 ≈ 13.500). */
const META_MAX = 13_000

/** Modelo para razonamiento largo: el potente que ya usa el formador (Claude Sonnet vía OpenRouter, por la pasarela). */
export const modeloSiniestroIA = (env: Record<string, string | undefined> = process.env): string =>
  modeloFormador({ TARIFICADOR_FORMADOR_MODELO: env.SINIESTRO_IA_MODELO }) ?? MODELO_FORMADOR_POTENTE_POR_DEFECTO

/** Modelo BARATO para índice y ficha: el de lectura de pólizas por defecto (Gemini Flash vía OpenRouter). */
export const modeloSiniestroExtraccion = (env: Record<string, string | undefined> = process.env): string =>
  env.SINIESTRO_IA_MODELO_EXTRACCION?.trim() || MODELO_POLIZA_DEFECTO

export type FalloIA = FalloHilo | { ok: false; estado: 'ia_no_disponible'; motivo: string; status: 503 }

/** Texto de los PDF de la póliza (documentos con polizaId de ESA correduría + el PDF archivado), recortado. */
export async function textoPolizaDe(
  correduriaId: string, polizaId: string,
): Promise<{ texto: string; recortado: boolean; fuentes: number; documentos: { id: string; texto: string }[] }> {
  const trozos: string[] = []
  const documentos: { id: string; texto: string }[] = []
  const vistos = new Set<string>()
  try {
    const docs = await prismaAsegura().documento.findMany({
      where: { correduriaId, polizaId, contenido: { not: null } },
      select: { id: true, nombreFichero: true, mimeType: true, contenido: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    for (const d of docs) {
      const esPdf = (d.mimeType ?? '').includes('pdf') || /\.pdf$/i.test(d.nombreFichero ?? '')
      if (!esPdf || !d.contenido) continue
      const t = (await textoPdfParse(Buffer.from(d.contenido))).trim()
      if (t && !vistos.has(t)) { vistos.add(t); documentos.push({ id: d.id, texto: t }); trozos.push(`[Documento: ${d.nombreFichero ?? 'póliza.pdf'}]\n${t}`) }
    }
  } catch (e) {
    registrarErrorCartera('siniestro/ia documentos póliza', e)
  }
  try {
    const pdf = await pdfDePoliza(correduriaId, polizaId)
    if (pdf) {
      const t = (await textoPdfParse(pdf.contenido)).trim()
      if (t && !vistos.has(t)) { vistos.add(t); documentos.push({ id: `pdf:${pdf.nombre}`, texto: t }); trozos.push(`[Documento: ${pdf.nombre}]\n${t}`) }
    }
  } catch (e) {
    registrarErrorCartera('siniestro/ia pdf póliza', e)
  }
  const todo = trozos.join('\n\n')
  return todo.length > TOPE_TEXTO_POLIZA
    ? { texto: todo.slice(0, TOPE_TEXTO_POLIZA), recortado: true, fuentes: trozos.length, documentos }
    : { texto: todo, recortado: false, fuentes: trozos.length, documentos }
}

type PasoIA = 'indice' | 'ficha' | 'veredicto' | 'redactar'
/** Traza de cada paso en el meta. `tokens`: `iaTexto` no los devuelve (solo texto): `null`, nunca 0. */
type LlamadaIA = { paso: PasoIA; modelo: string; cache: boolean; ok: boolean; caracteresEnviados: number; tokens: null; motivo?: string }

/** LA llamada a la IA del siniestro: un solo intento, sin reintentos, por la pasarela (`privado`). */
async function llamarIA(paso: PasoIA, prompt: string, o: { system: string; modelo: string; maxTokens: number; timeoutMs: number }): Promise<string> {
  const r = await iaTexto(prompt, {
    system: o.system, maxTokens: o.maxTokens, timeoutMs: o.timeoutMs, privado: true, modeloOpenRouter: o.modelo, cliente: `siniestro-ia:${paso}`,
  })
  return r.trim()
}

function falloIA(err: unknown, donde: string): FalloIA {
  const causa = registrarErrorCartera(`siniestro/ia ${donde}`, err)
  const msg = err instanceof Error ? err.message : String(err)
  const tope = /tope|presupuesto|limit|429|402/i.test(msg)
  return {
    ok: false, estado: 'ia_no_disponible', status: 503,
    motivo: tope ? 'IA no disponible: tope de gasto agotado o límite alcanzado.' : `IA no disponible (${typeof causa === 'string' ? causa : 'error'}).`,
  }
}

const linea = (m: { creadoAtOriginal: string; autor: string; tipo: string; editado: boolean; texto: string | null }) =>
  `[${m.creadoAtOriginal.slice(0, 10)} · ${m.autor} · ${m.tipo}${m.editado ? ' · editado' : ''}] ${m.texto ?? '(ilegible)'}`
const cola = (t: string, tope: number) => (t.length > tope ? '…' + t.slice(-tope) : t)

/** Otras pólizas EN VIGOR del mismo cliente (criterio de cartera, nunca el tipo de la ficha), resumidas: solo para el aviso «otrasPolizas». */
async function otrasPolizasEnVigor(correduriaId: string, clienteId: string, polizaId: string) {
  try {
    const filas = await prismaAsegura().poliza.findMany({
      where: { AND: [{ correduriaId, clienteId, mergedIntoPolizaId: null, id: { not: polizaId } }, WHERE_CARTERA_EN_VIGOR] },
      select: { id: true, tipo: true, aseguradora: true, coberturas: true },
      take: 15,
    })
    return filas.map((p) => {
      let garantias = ''
      try { garantias = p.coberturas == null ? '' : JSON.stringify(p.coberturas).slice(0, 300) } catch { /* sin garantías */ }
      return { polizaId: p.id, ramo: String(p.tipo), compania: p.aseguradora, garantias: garantias || 'no constan' }
    })
  } catch (e) {
    registrarErrorCartera('siniestro/ia otras pólizas', e)
    return null
  }
}

export async function ejecutarIASiniestro(
  correduriaId: string,
  e: { siniestroId: string; accion: AccionSiniestroIA; destinatario: DestinatarioSiniestroIA; actor: string },
): Promise<{ ok: true; mensaje: MensajeSiniestro } | FalloIA> {
  const h = await leerHiloSiniestro(correduriaId, e.siniestroId)
  if (!h.ok) return h
  const { siniestro: s, poliza, mensajes } = h.hilo

  const db = prismaAsegura()
  const p = await db.poliza.findFirst({ where: { id: s.polizaId, correduriaId }, select: { coberturas: true } })
  const poliz = await textoPolizaDe(correduriaId, s.polizaId)
  const sinPoliza = poliz.texto.trim() === ''
  const huellaDoc = sinPoliza ? null : huellaDocumentos(poliz.documentos)

  let coberturas = ''
  if (p?.coberturas != null) {
    try { coberturas = JSON.stringify(p.coberturas).slice(0, TOPE_COBERTURAS) } catch { /* sin garantías */ }
  }
  // Solo la última versión de cada mensaje: la IA no lee lo que el corredor ya corrigió.
  const vigentes = hiloVigente(mensajes ?? [])
  // Las valoraciones 👍/👎 no son hechos del caso: solo entran como CORRECCIONES (las «mal» con motivo).
  const hechos = vigentes.filter((m) => m.autor !== 'ia' && !esValoracion(m))
  const correcciones = correccionesDeValoraciones(vigentes)
  const hiloHechos = hechos.map(linea).join('\n')
  const hiloTodo = cola(vigentes.map(linea).join('\n'), TOPE_HILO)
  const modelo = modeloSiniestroIA()
  const modeloExtraccion = modeloSiniestroExtraccion()
  const llamadas: LlamadaIA[] = []

  // Sin DNI, IBAN ni direcciones: solo lo necesario para razonar.
  const bloqueSiniestro = [
    '## SINIESTRO',
    `Referencia: ${s.referencia ?? 'falta'} · Tipo: ${s.tipo ?? 'falta'} · Estado: ${s.estado} · Gravedad: ${s.gravedad ?? 'falta'}`,
    `Fecha de ocurrencia: ${s.fechaOcurrencia ?? 'falta'} · Declarado a la compañía: ${s.fechaDeclaracion ?? 'falta'}`,
    s.resultado ? `Resultado: ${s.resultado}` : '',
    '## PÓLIZA',
    `Compañía: ${poliza.compania} · Ramo: ${poliza.ramo} · Nº: ${poliza.numero ?? 'falta'}`,
    coberturas ? `Garantías registradas (JSON): ${coberturas}` : 'Garantías registradas: no constan',
  ]
  const bloquePlazos = ['## PLAZOS', h.hilo.plazos.map((z) => `${z.clave}: ${JSON.stringify(z)}`).join('\n').slice(0, 3000) || '(sin plazos)']
  const bloqueTextoPoliza = [
    '## TEXTO DE LA PÓLIZA',
    sinPoliza ? 'SIN TEXTO DE LA PÓLIZA: no puedo citar cláusulas.' : poliz.texto,
    poliz.recortado ? `(El texto de la póliza se recortó a ${TOPE_TEXTO_POLIZA} caracteres.)` : '',
  ]
  /** Índice para el prompt: sin las citas que NO se verificaron (no se propagan). */
  const indiceParaPrompt = (i: IndicePolizaCacheado) => JSON.stringify({
    garantias: i.garantias.map((g) => ({ nombre: g.nombre, suma: g.suma, franquicia: g.franquicia, cita: g.citaVerificada === false ? null : g.cita })),
    exclusiones: i.exclusiones.map((x) => ({ texto: x.texto, cita: x.citaVerificada === false ? null : x.cita })),
  })

  // ─── REDACTAR ────────────────────────────────────────────────────────────────────────────────────────────
  if (e.accion === 'redactar') {
    const indice = huellaDoc ? indiceCacheado(vigentes, huellaDoc) : null
    const ultimo = ultimoVeredicto(vigentes)
    const prompt = [
      ...bloqueSiniestro,
      ...(indice ? ['## ÍNDICE DE LA PÓLIZA (JSON; citas literales verificadas)', indiceParaPrompt(indice)] : bloqueTextoPoliza),
      ultimo ? `## ÚLTIMO VEREDICTO DEL GABINETE\n${textoVeredicto(ultimo)}` : '',
      '## HILO DEL SINIESTRO (más antiguo primero)',
      hiloTodo || '(sin mensajes)',
      ...bloquePlazos,
    ].filter((l) => l !== '').join('\n')
    let respuesta: string
    try {
      respuesta = await llamarIA('redactar', prompt, { system: promptSistemaSiniestro('redactar', e.destinatario), modelo, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS })
    } catch (err) {
      return falloIA(err, 'redactar')
    }
    if (respuesta === '') return { ok: false, estado: 'ia_no_disponible', status: 503, motivo: 'La IA devolvió una respuesta vacía.' }
    llamadas.push({ paso: 'redactar', modelo, cache: false, ok: true, caracteresEnviados: prompt.length, tokens: null })
    const v = verificarCitas(respuesta, poliz.texto)
    const { meta } = encajarMeta(metaGabinete({
      modelo, accion: e.accion, destinatario: e.destinatario,
      sinPoliza, polizaRecortada: poliz.recortado, polizaFuentes: poliz.fuentes, polizaVia: indice ? 'indice' : 'texto',
      llamadas, citas: { verificadas: v.verificadas, noEncontradas: v.noEncontradas },
    }), META_MAX)
    return anadirMensajeSiniestro(correduriaId, {
      siniestroId: e.siniestroId, autor: 'ia', tipo: 'borrador', texto: respuesta + avisoCitasNoEncontradas(v.noEncontradas),
      creadoPor: e.actor, canal: 'servidor', meta,
    })
  }

  // ─── ANALIZAR: 1) índice de la póliza (barato, cacheado por huella de documentos) ────────────────────────
  let indice: IndicePolizaCacheado | null = null
  if (huellaDoc) {
    indice = indiceCacheado(vigentes, huellaDoc)
    if (indice) {
      llamadas.push({ paso: 'indice', modelo: indice.modelo, cache: true, ok: true, caracteresEnviados: 0, tokens: null })
    } else {
      const prompt = ['## TEXTO DE LA PÓLIZA', poliz.texto].join('\n')
      try {
        const r = await llamarIA('indice', prompt, { system: PROMPT_INDICE_POLIZA, modelo: modeloExtraccion, maxTokens: MAX_TOKENS_EXTRACCION, timeoutMs: TIMEOUT_EXTRACCION_MS })
        const val = validarIndicePoliza(r)
        if (val) {
          const ver = verificarCitasIndice({ ...val, completo: val.completo && !poliz.recortado }, poliz.texto)
          indice = { ...ver.indice, version: INDICE_POLIZA_VERSION, huella: huellaDoc, modelo: modeloExtraccion, creadoAt: new Date().toISOString() }
        }
        llamadas.push({ paso: 'indice', modelo: modeloExtraccion, cache: false, ok: val !== null, caracteresEnviados: prompt.length, tokens: null, ...(val ? {} : { motivo: 'no_parsea' }) })
      } catch (err) {
        registrarErrorCartera('siniestro/ia índice', err)
        llamadas.push({ paso: 'indice', modelo: modeloExtraccion, cache: false, ok: false, caracteresEnviados: prompt.length, tokens: null, motivo: 'ia_no_disponible' })
      }
    }
  }

  // ─── 2) ficha del caso (barata, cacheada por huella del hilo vigente) ───────────────────────────────────
  const huellaH = huellaHilo(
    vigentes.map((m) => ({ id: m.id, creadoAt: m.creadoAt, autor: m.autor })),
    JSON.stringify([s.estado, s.fechaOcurrencia, s.fechaDeclaracion, s.gravedad, s.resultado ?? null]),
  )
  const conPerito = [...hechos].reverse().find((m) => m.meta && typeof m.meta === 'object' && m.meta.fichaPerito != null)
  let fichaPeritoTxt = ''
  if (conPerito) { try { fichaPeritoTxt = JSON.stringify(conPerito.meta?.fichaPerito).slice(0, 3_000) } catch { /* ilegible */ } }
  let ficha: FichaCasoCacheada | null = fichaCacheada(vigentes, huellaH)
  if (ficha) {
    llamadas.push({ paso: 'ficha', modelo: ficha.modelo, cache: true, ok: true, caracteresEnviados: 0, tokens: null })
  } else {
    const prompt = [
      ...bloqueSiniestro,
      fichaPeritoTxt ? `## FICHA DEL PERITO (JSON)\n${fichaPeritoTxt}` : '',
      '## HILO DEL SINIESTRO (más antiguo primero)',
      cola(hiloHechos, TOPE_HILO) || '(sin mensajes)',
    ].filter((l) => l !== '').join('\n')
    try {
      const r = await llamarIA('ficha', prompt, { system: PROMPT_FICHA_CASO, modelo: modeloExtraccion, maxTokens: MAX_TOKENS_EXTRACCION, timeoutMs: TIMEOUT_EXTRACCION_MS })
      const val = validarFichaCaso(r)
      if (val) ficha = { ...val, version: FICHA_CASO_VERSION, huella: huellaH, modelo: modeloExtraccion, creadoAt: new Date().toISOString() }
      llamadas.push({ paso: 'ficha', modelo: modeloExtraccion, cache: false, ok: val !== null, caracteresEnviados: prompt.length, tokens: null, ...(val ? {} : { motivo: 'no_parsea' }) })
    } catch (err) {
      registrarErrorCartera('siniestro/ia ficha', err)
      llamadas.push({ paso: 'ficha', modelo: modeloExtraccion, cache: false, ok: false, caracteresEnviados: prompt.length, tokens: null, motivo: 'ia_no_disponible' })
    }
  }

  // ─── 3) veredicto (modelo bueno) ────────────────────────────────────────────────────────────────────────
  const otras = await otrasPolizasEnVigor(correduriaId, s.clienteId, s.polizaId)
  const notas = hechos.filter((m) => m.autor === 'corredor' && m.tipo === 'nota').map(linea).join('\n')
  const previo = ultimoVeredicto(vigentes)
  const usarIndice = indice !== null && indice.completo
  const prompt = [
    ...bloqueSiniestro,
    ...(usarIndice ? ['## ÍNDICE DE LA PÓLIZA (JSON; citas literales verificadas contra el texto)', indiceParaPrompt(indice!)] : bloqueTextoPoliza),
    ficha ? `## FICHA DEL CASO (JSON)\n${JSON.stringify({ cronologia: ficha.cronologia, partes: ficha.partes, importesPerito: ficha.importesPerito, garantiaEnJuego: ficha.garantiaEnJuego, motivoRehuse: ficha.motivoRehuse, documentosFaltan: ficha.documentosFaltan })}` : '',
    fichaPeritoTxt ? `## FICHA DEL PERITO (JSON)\n${fichaPeritoTxt}` : '',
    correcciones.length ? `## CORRECCIONES DEL CORREDOR A ANÁLISIS ANTERIORES DE ESTE SINIESTRO (tenlas en cuenta; si las contradices, explica por qué)\n${correcciones.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : '',
    previo?.preguntas.length ? `## PREGUNTAS DEL ANÁLISIS ANTERIOR\n${previo.preguntas.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '',
    `## RESPUESTAS Y NOTAS DEL CORREDOR\n${notas ? cola(notas, TOPE_NOTAS) : '(ninguna)'}`,
    '## HILO DEL SINIESTRO (más antiguo primero; sin análisis de la IA)',
    cola(hiloHechos, ficha ? TOPE_HILO_CON_FICHA : TOPE_HILO) || '(sin mensajes)',
    '## OTRAS PÓLIZAS EN VIGOR DEL MISMO CLIENTE (solo para el aviso «otrasPolizas»)',
    otras === null ? '(no se pudieron leer: deja "otrasPolizas": [])' : otras.length ? JSON.stringify(otras) : '(ninguna)',
    ...bloquePlazos,
  ].filter((l) => l !== '').join('\n')

  let respuesta: string
  try {
    respuesta = await llamarIA('veredicto', prompt, { system: promptSistemaVeredicto(), modelo, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS })
  } catch (err) {
    return falloIA(err, 'veredicto')
  }
  if (respuesta === '') return { ok: false, estado: 'ia_no_disponible', status: 503, motivo: 'La IA devolvió una respuesta vacía.' }
  llamadas.push({ paso: 'veredicto', modelo, cache: false, ok: true, caracteresEnviados: prompt.length, tokens: null })

  // Reintento NULO: si no valida, se guarda el texto tal cual y `veredicto = null`.
  const val = validarVeredicto(respuesta, { polizasPermitidas: (otras ?? []).map((o) => o.polizaId) })
  let veredicto: Veredicto | null = null
  let texto: string
  let citas: { verificadas: string[]; noEncontradas: string[] }
  if (val.ok) {
    const ver = verificarCitasVeredicto(val.veredicto, { poliza: poliz.texto, hechos: hiloHechos, ley: CONOCIMIENTO_SINIESTROS })
    veredicto = ver.veredicto
    citas = { verificadas: ver.verificadas, noEncontradas: ver.noEncontradas }
    texto = textoVeredicto(veredicto) + avisoCitasNoEncontradas(ver.noEncontradas)
  } else {
    const v = verificarCitas(respuesta, poliz.texto)
    citas = { verificadas: v.verificadas, noEncontradas: v.noEncontradas }
    texto = respuesta + avisoCitasNoEncontradas(v.noEncontradas)
  }

  const { meta } = encajarMeta(metaGabinete({
    modelo, modeloExtraccion, accion: e.accion, destinatario: null,
    sinPoliza, polizaRecortada: poliz.recortado, polizaFuentes: poliz.fuentes, polizaVia: usarIndice ? 'indice' : 'texto',
    huellaDocumentos: huellaDoc, huellaHilo: huellaH, llamadas,
    indicePoliza: indice, fichaCaso: ficha,
    veredicto, veredictoError: val.ok ? null : val.motivo,
    citas,
  }), META_MAX)
  return anadirMensajeSiniestro(correduriaId, {
    siniestroId: e.siniestroId, autor: 'ia', tipo: 'analisis', texto, creadoPor: e.actor, canal: 'servidor', meta,
  })
}
