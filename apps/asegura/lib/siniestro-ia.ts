// IA del siniestro (analizar / redactar): arma el contexto de ESA correduría, llama a `iaTexto()` UNA vez, verifica
// las citas contra el texto de la póliza y guarda el resultado como mensaje autor 'ia' del hilo.
// El texto del PDF y el hilo van a la IA (por la pasarela, `privado`), nunca a `historial_interno`.
import { verificarCitas, avisoCitasNoEncontradas } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { iaTexto } from './ia'
import { textoPdfParse } from './documentos/extraer-poliza'
import { pdfDePoliza } from './poliza-pdf'
import { registrarErrorCartera } from './error-cartera'
import { anadirMensajeSiniestro, leerHiloSiniestro, type FalloHilo, type MensajeSiniestro } from './siniestro-hilo'
import { promptSistemaSiniestro, type AccionSiniestroIA, type DestinatarioSiniestroIA } from './siniestro-ia-prompt'
import { MODELO_FORMADOR_POTENTE_POR_DEFECTO, modeloFormador } from './tarificador-formador-reglas'

export const TOPE_TEXTO_POLIZA = 120_000
const TOPE_COBERTURAS = 4_000
const TOPE_HILO = 40_000
const MAX_TOKENS = 4_000
const TIMEOUT_MS = 120_000

/** Modelo para razonamiento largo: el potente que ya usa el formador (Claude Sonnet vía OpenRouter, por la pasarela). */
export const modeloSiniestroIA = (env: Record<string, string | undefined> = process.env): string =>
  modeloFormador({ TARIFICADOR_FORMADOR_MODELO: env.SINIESTRO_IA_MODELO }) ?? MODELO_FORMADOR_POTENTE_POR_DEFECTO

export type FalloIA = FalloHilo | { ok: false; estado: 'ia_no_disponible'; motivo: string; status: 503 }

/** Texto de los PDF de la póliza (documentos con polizaId de ESA correduría + el PDF archivado), recortado. */
export async function textoPolizaDe(correduriaId: string, polizaId: string): Promise<{ texto: string; recortado: boolean; fuentes: number }> {
  const trozos: string[] = []
  const vistos = new Set<string>()
  try {
    const docs = await prismaAsegura().documento.findMany({
      where: { correduriaId, polizaId, contenido: { not: null } },
      select: { nombreFichero: true, mimeType: true, contenido: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    for (const d of docs) {
      const esPdf = (d.mimeType ?? '').includes('pdf') || /\.pdf$/i.test(d.nombreFichero ?? '')
      if (!esPdf || !d.contenido) continue
      const t = (await textoPdfParse(Buffer.from(d.contenido))).trim()
      if (t && !vistos.has(t)) { vistos.add(t); trozos.push(`[Documento: ${d.nombreFichero ?? 'póliza.pdf'}]\n${t}`) }
    }
  } catch (e) {
    registrarErrorCartera('siniestro/ia documentos póliza', e)
  }
  try {
    const pdf = await pdfDePoliza(correduriaId, polizaId)
    if (pdf) {
      const t = (await textoPdfParse(pdf.contenido)).trim()
      if (t && !vistos.has(t)) { vistos.add(t); trozos.push(`[Documento: ${pdf.nombre}]\n${t}`) }
    }
  } catch (e) {
    registrarErrorCartera('siniestro/ia pdf póliza', e)
  }
  const todo = trozos.join('\n\n')
  return todo.length > TOPE_TEXTO_POLIZA
    ? { texto: todo.slice(0, TOPE_TEXTO_POLIZA), recortado: true, fuentes: trozos.length }
    : { texto: todo, recortado: false, fuentes: trozos.length }
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

  let coberturas = ''
  if (p?.coberturas != null) {
    try { coberturas = JSON.stringify(p.coberturas).slice(0, TOPE_COBERTURAS) } catch { /* sin garantías */ }
  }
  let hiloTxt = (mensajes ?? [])
    .map((m) => `[${m.creadoAt.slice(0, 10)} · ${m.autor} · ${m.tipo}] ${m.texto ?? '(ilegible)'}`)
    .join('\n')
  if (hiloTxt.length > TOPE_HILO) hiloTxt = '…' + hiloTxt.slice(-TOPE_HILO)

  // Sin DNI, IBAN ni direcciones: solo lo necesario para razonar.
  const prompt = [
    '## SINIESTRO',
    `Referencia: ${s.referencia ?? 'falta'} · Tipo: ${s.tipo ?? 'falta'} · Estado: ${s.estado} · Gravedad: ${s.gravedad ?? 'falta'}`,
    `Fecha de ocurrencia: ${s.fechaOcurrencia ?? 'falta'} · Declarado a la compañía: ${s.fechaDeclaracion ?? 'falta'}`,
    s.resultado ? `Resultado: ${s.resultado}` : '',
    '## PÓLIZA',
    `Compañía: ${poliza.compania} · Ramo: ${poliza.ramo} · Nº: ${poliza.numero ?? 'falta'}`,
    coberturas ? `Garantías registradas (JSON): ${coberturas}` : 'Garantías registradas: no constan',
    '## TEXTO DE LA PÓLIZA',
    sinPoliza ? 'SIN TEXTO DE LA PÓLIZA: no puedo citar cláusulas.' : poliz.texto,
    poliz.recortado ? `(El texto de la póliza se recortó a ${TOPE_TEXTO_POLIZA} caracteres.)` : '',
    '## HILO DEL SINIESTRO (más antiguo primero)',
    hiloTxt || '(sin mensajes)',
    '## PLAZOS',
    h.hilo.plazos.map((z) => `${z.clave}: ${JSON.stringify(z)}`).join('\n').slice(0, 3000) || '(sin plazos)',
  ].filter((l) => l !== '').join('\n')

  const modelo = modeloSiniestroIA()
  let respuesta: string
  try {
    respuesta = await iaTexto(prompt, {
      system: promptSistemaSiniestro(e.accion, e.destinatario),
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
      privado: true,
      modeloOpenRouter: modelo,
      cliente: `siniestro-ia:${e.accion}`,
    })
  } catch (err) {
    const causa = registrarErrorCartera('siniestro/ia llamada', err)
    const msg = err instanceof Error ? err.message : String(err)
    const tope = /tope|presupuesto|limit|429|402/i.test(msg)
    return {
      ok: false, estado: 'ia_no_disponible', status: 503,
      motivo: tope ? 'IA no disponible: tope de gasto agotado o límite alcanzado.' : `IA no disponible (${typeof causa === 'string' ? causa : 'error'}).`,
    }
  }
  respuesta = respuesta.trim()
  if (respuesta === '') return { ok: false, estado: 'ia_no_disponible', status: 503, motivo: 'La IA devolvió una respuesta vacía.' }

  const v = verificarCitas(respuesta, poliz.texto)
  const texto = respuesta + avisoCitasNoEncontradas(v.noEncontradas)
  const r = await anadirMensajeSiniestro(correduriaId, {
    siniestroId: e.siniestroId,
    autor: 'ia',
    tipo: e.accion === 'analizar' ? 'analisis' : 'borrador',
    texto,
    creadoPor: e.actor,
    canal: 'servidor',
    meta: {
      modelo, accion: e.accion, destinatario: e.accion === 'redactar' ? e.destinatario : null,
      sinPoliza, polizaRecortada: poliz.recortado, polizaFuentes: poliz.fuentes,
      citas: { verificadas: v.verificadas, noEncontradas: v.noEncontradas },
    },
  })
  return r
}
