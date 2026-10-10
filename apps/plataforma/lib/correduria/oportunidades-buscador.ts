/**
 * Qué dice el buscador de /correduria sobre las oportunidades de una ficha.
 * Puro y testeado: la pantalla solo pinta lo que devuelve.
 *
 * Tres estados, como todo el puerto: `null` = no se ha podido contar (no se
 * pinta nada, no se afirma «ninguna»); 0 = contado, no hay; >0 = el dato.
 * Las aparcadas van aparte: un lead aparcado hasta marzo no es trabajo de hoy
 * y no debe salir destacado como si lo fuera.
 */
import { ROTULO_ESTADO, TIPOS_TAREA_UI, type EstadoOportunidad } from '../seguimiento-asegura.ts'

type Entrada = {
  oportunidadesAbiertas: number | null
  oportunidadesAparcadas: number | null
  siguientePaso: { estado: string; tipo: string; fechaLimite: string } | null
}

export type ResumenOportunidades =
  | { estado: 'sin_dato' }
  | {
      estado: 'ok'
      activas: number
      /** `null` = asegura no informa aparcadas: no se dice nada de ellas. */
      aparcadas: number | null
      texto: string
      /** Hay algo que hacer: se pinta en color de marca. */
      destacado: boolean
      /** «Interesado · Llamada 30/09», o `null` si no hay paso pendiente. */
      paso: string | null
      atrasado: boolean
      /** Sin ninguna abierta (ni aparcada): se ofrece abrir una. */
      ofrecerAbrir: boolean
    }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

/** `hoy` en `YYYY-MM-DD` (hora de Madrid), para decir si el paso va atrasado. */
export function resumenOportunidades(h: Entrada, hoy: string): ResumenOportunidades {
  const activas = h.oportunidadesAbiertas
  if (activas === null) return { estado: 'sin_dato' }
  const aparcadas = h.oportunidadesAparcadas

  const partes: string[] = []
  if (activas > 0) partes.push(plural(activas, 'oportunidad activa', 'oportunidades activas'))
  if (aparcadas !== null && aparcadas > 0) partes.push(plural(aparcadas, 'aparcada', 'aparcadas'))
  const ninguna = activas === 0 && aparcadas === 0
  const texto = partes.length > 0 ? partes.join(' · ') : ninguna ? 'sin oportunidades abiertas' : 'sin oportunidades activas'

  const s = activas > 0 ? h.siguientePaso : null
  const estado = s ? ((ROTULO_ESTADO as Record<string, string>)[s.estado as EstadoOportunidad] ?? s.estado) : null
  const tipo = s ? (TIPOS_TAREA_UI.find((t) => t.valor === s.tipo)?.rotulo ?? s.tipo) : null

  return {
    estado: 'ok',
    activas,
    aparcadas,
    texto,
    destacado: activas > 0,
    paso: s ? `${estado} · ${tipo} ${ddmm(s.fechaLimite)}` : null,
    atrasado: s !== null && s.fechaLimite < hoy,
    ofrecerAbrir: ninguna,
  }
}
