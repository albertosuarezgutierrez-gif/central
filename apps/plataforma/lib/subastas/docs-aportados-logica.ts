// ────────────────────────────────────────────────────────────────────────────
// Documentos APORTADOS A MANO a una subasta — la parte PURA (sin BD, red ni IA),
// testeada con `node --test`.
//
// Por qué existe: el Portal del BOE esconde los documentos de muchas subastas
// tras el login, el login automático NO es viable (2FA + captcha, PRs
// #1548→#1560) y el cron lee en anónimo. Alberto SÍ puede bajarlos con su
// sesión en dos minutos (probado: 18 documentos de 9 fichas el 20/08/2026) —
// lo que faltaba era la puerta para dárselos al lector. Esa puerta es el botón
// «Aportar documentos» de la ficha de `/subastas`.
//
// 🚨 A diferencia de la nota simple, lo aportado SÍ escribe en el corpus
// global (`subastas.cargas_*`): estos documentos son los MISMOS que publica el
// Portal (edicto, certificación de cargas…), solo que descargados con sesión
// en vez de por el cron — la procedencia es la oficial, no un encargo privado
// de la cuenta. La nota simple, en cambio, la paga la cuenta y describe el
// registro HOY, no lo que publicó el BOE: por eso aquella vive aparte.
// ────────────────────────────────────────────────────────────────────────────
import {
  fusionarCargas,
  normalizarCuadroCargas,
  type CuadroCargas,
} from '@central/module-subastas'

/** Lo que el lector sacó de UN documento aportado. */
export interface LecturaAportada {
  cuadro: CuadroCargas
  /** Señales explícitas del edicto (`notasDeEdicto`), si el texto las traía. */
  notas: string[]
  /** Referencia catastral encontrada en el texto: llave del enriquecimiento. */
  refCatastral?: string | null
}

/**
 * Qué ES el documento, leído de su propio texto. Hace falta porque el Portal
 * sirve las descargas con nombres genéricos (`documento1_4.pdf`) que no dicen
 * nada — y el título importa: es lo que usa `autoridadDocumental` para
 * arbitrar cuando dos documentos discrepan en el rango de una carga (la
 * certificación manda sobre el edicto). Los patrones salen de documentos
 * REALES de SUB-JA-2026-264175 (edicto del Tribunal de Instancia de Sevilla,
 * certificación del Registro nº 3, consulta catastral del PNJ), no de memoria.
 */
export function tituloDesdeTexto(texto: string | null | undefined): string | null {
  const t = (texto ?? '').replace(/\s+/g, ' ')
  if (!t) return null
  // «LUIS FRANCISCO MONREAL VIDAL, REGISTRADOR DE LA PROPIEDAD … C E R T I F I C O:»
  // — con las letras SEPARADAS, tal cual lo maqueta el Registro (documento real
  // de SUB-JA-2026-264175); de ahí el `\s*` entre letras.
  if (/REGISTRADOR[A]?\s+DE\s+LA\s+PROPIEDAD/i.test(t) && /\bC\s*E\s*R\s*T\s*I\s*F\s*I\s*C\s*[OA]\b/i.test(t)) {
    return 'Certificación de dominio y cargas'
  }
  if (/\bnota\s+simple\b/i.test(t) && /registro\s+de\s+la\s+propiedad/i.test(t)) return 'Nota simple'
  if (/\bEDICTO\b/i.test(t) || /se\s+anuncia\s+.{0,60}\bsubasta\b/i.test(t)) return 'Edicto de subasta'
  // «Consulta Domicilios Catastrales — PLATAFORMA DE SERVICIOS DEL PUNTO NEUTRO JUDICIAL»
  if (/\bCATASTRAL/i.test(t)) return 'Datos catastrales'
  return null
}

/**
 * Título con el que se registra el documento: el que dé el usuario > el que
 * declare el propio texto (`tituloDesdeTexto`) > el nombre del fichero. El
 * contenido gana al fichero a propósito: «documento2_4.pdf» era la
 * certificación de cargas, y con ese nombre perdería su autoridad documental.
 */
export function tituloDeAportado(nombreFichero: string | null | undefined, titulo?: string | null, texto?: string | null): string {
  const dado = (titulo ?? '').trim()
  if (dado) return dado.slice(0, 200)
  const delTexto = tituloDesdeTexto(texto)
  if (delTexto) return delTexto
  const nombre = (nombreFichero ?? '').trim().replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim()
  return (nombre || 'Documento aportado').slice(0, 200)
}

/**
 * ¿Esta lectura dice ALGO utilizable? Un edicto sin cargas pero con señales
 * («vivienda habitual: no consta») aporta; un PDF del que no salió nada, no —
 * y ese «nada» se guarda como ilegible, nunca como «sin cargas» (la regla de
 * siempre: un «no lo he sabido leer» no puede vestirse de dato).
 */
export function aportaAlgo(l: LecturaAportada): boolean {
  return (
    l.cuadro.cargas.length > 0 ||
    l.cuadro.procedimiento !== 'desconocido' ||
    l.cuadro.valoracionPactada?.importe != null ||
    l.notas.length > 0 ||
    // Un doc «Datos catastrales» no trae cargas ni señales, pero su referencia
    // catastral es la llave que rellena m²/año/uso desde el Catastro.
    !!l.refCatastral
  )
}

/**
 * Revive el `cargas_detalle` guardado en la BD como un cuadro de confianza.
 * `null` si no hay nada guardado o lo guardado no trae cargas.
 *
 * Matiz asumido (el mismo que la nota simple): `normalizarCuadroCargas` no
 * conserva el `documento` de cada carga, así que lo ya guardado pierde su
 * autoridad documental al re-arbitrar. Es el lado conservador correcto aquí:
 * el documento recién aportado —cuyo título sí viaja— gana los empates, y en
 * las fichas con muro (el caso de uso) el corpus previo suele estar vacío.
 */
export function revivirCuadroGuardado(bruto: unknown): CuadroCargas | null {
  if (!bruto || typeof bruto !== 'object') return null
  const fuente = (bruto as Record<string, unknown>).fuente
  const cuadro = normalizarCuadroCargas(
    bruto,
    fuente === 'campo_ficha' || fuente === 'texto_documento' || fuente === 'ocr_ia' || fuente === 'manual' ? fuente : 'ocr_ia',
  )
  return cuadro.cargas.length || cuadro.procedimiento !== 'desconocido' ? cuadro : null
}

/**
 * El cuadro que se escribe al corpus: lo que ya se sabía + lo recién leído,
 * fusionado con UNA fila por asiento registral (`fusionarCargas` del módulo,
 * el mismo que usa el cron — dedupe por identidad, importe mayor, rango
 * arbitrado por autoridad documental).
 *
 * `null` = las lecturas nuevas no traen nada de cargas: NO se toca el corpus
 * (rescribir lo viejo con lo viejo solo movería `actualizado_en`).
 */
export function cuadroParaCorpus(previo: CuadroCargas | null, nuevos: CuadroCargas[]): CuadroCargas | null {
  const conAlgo = nuevos.filter((c) => c.cargas.length || c.procedimiento !== 'desconocido')
  if (!conAlgo.length) return null

  const todos = previo ? [previo, ...conAlgo] : conAlgo
  const { cargas, avisos } = fusionarCargas(todos.flatMap((c) => c.cargas))

  return {
    cargas,
    procedimiento: todos.find((c) => c.procedimiento !== 'desconocido')?.procedimiento ?? 'desconocido',
    sinMasCargas: todos.some((c) => c.sinMasCargas),
    notas: [...new Set([...todos.flatMap((c) => c.notas), ...avisos])],
    // Lo aportado se lee por el lector registral (texto o visión): la fuente
    // del cuadro combinado es la de una lectura, no el campo de la ficha.
    fuente: conAlgo.some((c) => c.fuente === 'ocr_ia') ? 'ocr_ia' : 'texto_documento',
    valoracionPactada: todos.find((c) => c.valoracionPactada?.importe != null)?.valoracionPactada,
    confianza: Math.max(...conAlgo.map((c) => c.confianza)),
  }
}
