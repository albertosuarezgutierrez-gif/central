// Lógica PURA de «Consultas a compañías» (fase 1): agrupado/orden del panel, contador N·M, días de espera,
// avisos y texto de los errores de envío. Sin React ni red. `null` ≠ `[]`: ramos `null` = sin clasificar.

import { AVISO_ADJUNTO_CONSULTA, etiquetaFaltaConsulta, etiquetaRamo as etiquetaDeRamo } from '@central/module-seguros'
import type { CompaniaConsulta, ConsultaDTO, ContactoCompania, EstadoConsulta } from '../../../../../lib/correduria/consultas-companias-asegura.ts'

/** El aviso fijo de adjuntos (decisión 8 del spec): el MISMO texto que usa asegura, de `@central/module-seguros`. */
export const AVISO_ADJUNTO = AVISO_ADJUNTO_CONSULTA

/** ¿Este contacto lleva el ramo? `null` (sin clasificar) NUNCA cuenta como «lleva»: ni como «todos». */
export function llevaRamo(c: ContactoCompania, ramo: string | null): boolean {
  return !!ramo && c.ramos !== null && c.ramos.includes(ramo)
}

/** Etiqueta «lleva <ramo>» solo para quien lo lleva; el resto sale sin etiqueta. */
export function etiquetaRamo(c: ContactoCompania, ramo: string | null): string | null {
  return llevaRamo(c, ramo) && ramo ? `lleva ${etiquetaDeRamo(ramo)}` : null
}

/** Compañía con contactos reordenados (los del ramo primero; el orden relativo se conserva). */
export type CompaniaOrdenada = CompaniaConsulta & { delRamo: boolean }

/** Primero las compañías con algún contacto del ramo («delRamo»); luego «otras» (plegadas). Orden estable. */
export function agruparCompanias(companias: CompaniaConsulta[], ramo: string | null): { delRamo: CompaniaOrdenada[]; otras: CompaniaOrdenada[] } {
  const delRamo: CompaniaOrdenada[] = []
  const otras: CompaniaOrdenada[] = []
  for (const comp of companias) {
    const con = comp.contactos.filter((c) => llevaRamo(c, ramo))
    const sin = comp.contactos.filter((c) => !llevaRamo(c, ramo))
    const o: CompaniaOrdenada = { ...comp, contactos: [...con, ...sin], delRamo: con.length > 0 }
    ;(o.delRamo ? delRamo : otras).push(o)
  }
  return { delRamo, otras }
}

/** «N compañías · M personas» sobre lo marcado. Un id marcado que ya no existe no cuenta. */
export function contarSeleccion(companias: CompaniaConsulta[], marcados: ReadonlySet<string>): { companias: number; personas: number } {
  let nComp = 0
  let personas = 0
  for (const comp of companias) {
    const n = comp.contactos.filter((c) => marcados.has(c.id)).length
    if (n > 0) { nComp++; personas += n }
  }
  return { companias: nComp, personas }
}

export function rotuloContador(c: { companias: number; personas: number }): string {
  return `${c.companias} ${c.companias === 1 ? 'compañía' : 'compañías'} · ${c.personas} ${c.personas === 1 ? 'persona' : 'personas'}`
}

/** Los ids marcados, solo los que existen (orden del panel). */
export function destinatariosMarcados(companias: CompaniaConsulta[], marcados: ReadonlySet<string>): string[] {
  return companias.flatMap((comp) => comp.contactos.filter((c) => marcados.has(c.id)).map((c) => c.id))
}

const aDia = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/**
 * Días de espera (naturales): de la fecha de envío a la respuesta, o a `hoy` si sigue sin responder.
 * `null` = no enviada (no hay espera que contar), nunca 0. Nunca negativo. `hoy` = `YYYY-MM-DD` de Madrid.
 */
export function diasEspera(enviadaAt: string | null, respondidaAt: string | null, hoy: string): number | null {
  if (!enviadaAt) return null
  const ini = aDia(enviadaAt)
  const fin = aDia(respondidaAt ?? hoy)
  if (ini === null || fin === null) return null
  return Math.max(0, fin - ini)
}

/**
 * Aviso (no bloqueo) de datos mínimos. `faltan` son CLAVES de campo: se enseñan con su etiqueta del bloque del ramo.
 * `null` = no se ha podido comprobar (≠ «no falta nada»).
 */
export function avisoFaltan(faltan: string[] | null, ramo: string | null): string | null {
  if (faltan === null) return 'No se han podido comprobar los datos mínimos del ramo. Puedes redactar igualmente.'
  if (faltan.length === 0) return null
  const etiquetas = faltan.map((k) => (ramo ? etiquetaFaltaConsulta(ramo, k) : k))
  return `Faltan datos del riesgo: ${etiquetas.join(', ')}. Complétalos en «Datos del riesgo» de esta oportunidad; si no, la consulta saldrá incompleta (puedes redactarla igualmente).`
}

/** Por qué no se ha podido leer el panel. `sin_migracion` ≠ `sin_configurar` ≠ un error de lectura. */
export function textoErrorPanel(l: { estado: 'sin_configurar' } | { estado: 'sin_migracion' } | { estado: 'error'; motivo: string }): string {
  if (l.estado === 'sin_configurar') return 'Falta conectar el puerto con central-asegura: no se han podido mirar las consultas.'
  if (l.estado === 'sin_migracion') return 'Las consultas a compañías aún no están activadas en asegura (falta aplicar su SQL). No se ha leído ni enviado nada.'
  return `No se ha podido leer (${l.motivo}). No es que no haya consultas: no se han podido mirar.`
}

export const ROTULO_ESTADO: Record<EstadoConsulta, string> = {
  borrador: 'Borrador', enviada: 'Enviada', respondida: 'Respondida', pide_info: 'Pide más información', rechazada: 'Rechazada',
  sin_respuesta: 'Sin respuesta', descartada: 'Descartada', cancelada: 'Cancelada',
}
export const TONO_ESTADO: Record<EstadoConsulta, 'neutral' | 'positivo' | 'negativo' | 'aviso' | 'info'> = {
  borrador: 'neutral', enviada: 'info', respondida: 'positivo', pide_info: 'aviso', rechazada: 'negativo',
  sin_respuesta: 'negativo', descartada: 'neutral', cancelada: 'neutral',
}
/** Estado desconocido → su valor CRUDO (nunca se oculta ni se inventa un rótulo). */
export function rotuloEstado(estado: string): string {
  return Object.hasOwn(ROTULO_ESTADO, estado) ? ROTULO_ESTADO[estado as EstadoConsulta] : estado
}
export function tonoEstado(estado: string): 'neutral' | 'positivo' | 'negativo' | 'aviso' | 'info' {
  return Object.hasOwn(TONO_ESTADO, estado) ? TONO_ESTADO[estado as EstadoConsulta] : 'neutral'
}

/** Borradores arriba (piden acción); el resto, por fecha de envío descendente. Estable. */
export function ordenarConsultas(consultas: ConsultaDTO[]): ConsultaDTO[] {
  const pend = (c: ConsultaDTO) => (c.estado === 'borrador' ? 0 : 1)
  return consultas
    .map((c, i) => ({ c, i }))
    .sort((a, b) => pend(a.c) - pend(b.c) || (b.c.enviadaAt ?? '').localeCompare(a.c.enviadaAt ?? '') || a.i - b.i)
    .map((x) => x.c)
}

/**
 * El texto de un fallo de envío, por el `estado` que manda asegura (el status solo no basta: dos 503 distintos).
 *  - «NO enviada» SOLO cuando asegura afirma que no salió (4xx, 503 antes de tocar el SMTP, 502 `envio_fallido`);
 *  - `enviada_sin_registrar` = SALIÓ: no se reenvía;
 *  - sin respuesta, 502 de red de plataforma, 5xx genérico o timeout = NO SE SABE: se mira antes de repetir.
 */
export function textoErrorEnvio(status: number, json: Record<string, unknown> | null): string {
  const estado = typeof json?.estado === 'string' ? json.estado : null
  const motivo = typeof json?.motivo === 'string' ? json.motivo : typeof json?.causa === 'string' ? json.causa : null
  const noSeSabe = 'No se sabe si ha salido: recarga y mira su estado (y Enviados de Gmail) antes de repetir.'
  if (status === 0) return `No se ha podido hablar con el servidor. ${noSeSabe}`
  switch (estado) {
    case 'enviada_sin_registrar':
      return 'El correo SÍ ha salido, pero no ha quedado registrado. NO lo reenvíes: avisa para marcarla a mano.'
    case 'sin_configurar':
      return 'Falta conectar el puerto con central-asegura: no se ha intentado enviar.'
    case 'canal_no_disponible':
      return 'El canal de correo (Gmail de hola@grupoasegura.es) no está configurado en asegura: no se ha intentado enviar. Reintentar no lo arregla.'
    case 'sin_migracion':
      return 'Las consultas a compañías aún no están activadas en asegura (falta su SQL): no se ha enviado nada.'
    case 'identidad_no_disponible':
      return 'No se ha podido leer el DNI/NIE/CIF del tomador: NO se ha enviado (no sale con un dato a medias). Quita la línea del tomador o avisa.'
    case 'envio_fallido':
      return `El servidor de correo no aceptó el envío${motivo ? ` (${motivo})` : ''}. NO consta como enviada: sigue de borrador.`
    case 'ya_enviada':
      return 'Esta consulta ya estaba enviada (o la estaba enviando otra pestaña). No se ha vuelto a enviar. Recarga para ver su estado.'
    case 'envio_en_curso':
      return 'Esta consulta tiene un envío en curso o sin confirmar. No se ha vuelto a enviar: mira Enviados de Gmail antes de hacer nada.'
    case 'actor_no_humano':
      return 'El envío tiene que pedirlo una persona con sesión. No se ha enviado: recarga la página e inténtalo de nuevo.'
  }
  if (status >= 500) return `${motivo ? `Error del servidor (${motivo}). ` : 'Error del servidor. '}${noSeSabe}`
  return `NO enviada: ${motivo ?? `HTTP ${status}`}`
}

/** El aviso fijo del adjunto debe verse siempre que haya algún documento elegido (de competencia o no). */
export function mostrarAvisoAdjunto(adjuntos: readonly unknown[]): boolean {
  return adjuntos.length > 0
}

/** Texto de la fila fija «Competencia». `null` en un campo = «No figura», nunca 0. */
export function filaCompetencia(c: { compania: string | null; prima: number | null; coberturas: string | null }, fmt: (n: number) => string): { compania: string; prima: string; coberturas: string } {
  return { compania: c.compania ?? 'No figura', prima: c.prima === null ? 'No figura' : fmt(c.prima), coberturas: c.coberturas ?? 'No figura' }
}
