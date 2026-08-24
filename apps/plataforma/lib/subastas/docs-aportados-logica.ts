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
}

/**
 * Título con el que se registra el documento. El título importa: es lo que
 * usa `autoridadDocumental` para arbitrar cuando dos documentos discrepan en
 * el rango de una carga (la certificación manda sobre el edicto), así que si
 * el nombre del fichero dice «certificación», hay que conservarlo.
 */
export function tituloDeAportado(nombreFichero: string | null | undefined, titulo?: string | null): string {
  const dado = (titulo ?? '').trim()
  if (dado) return dado.slice(0, 200)
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
    l.notas.length > 0
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
