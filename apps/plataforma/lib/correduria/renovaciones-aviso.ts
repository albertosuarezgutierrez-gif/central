// ────────────────────────────────────────────────────────────────────────────
// Aviso de RENOVACIONES de la correduría.
//
// La tabla de /correduria solo sirve si Alberto entra a mirarla. Lo que mueve
// una cartera es que el aviso llegue solo, y a tiempo: la ventana no la marca
// el calendario, la marca la LCS art. 22 — a menos de un mes del vencimiento
// el tomador ya no puede oponerse a la prórroga y la póliza se renueva sola.
//
// Todo lo de este archivo es PURO (sin BD, sin red, sin Telegram): la decisión
// de a quién avisar y con qué texto se puede probar sin levantar nada.
// ────────────────────────────────────────────────────────────────────────────
import { DIAS_PREAVISO_TOMADOR } from '@central/module-seguros'
import { eur } from '../dinero.ts'

export type PolizaAviso = {
  id: string
  cliente: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  fechaVencimiento: string
  dias: number
  prima: number | null
}

/**
 * Los tres momentos en que merece la pena interrumpir a alguien. Ordenados de
 * MÁS urgente a menos: una póliza dispara el más urgente que le aplique, no los
 * tres — si entra en el radar cuando ya le quedan 5 días, se manda un solo
 * mensaje y no una ráfaga de tres.
 */
export const HITOS = [
  {
    id: 'vence_7',
    hastaDias: 7,
    titulo: '🔴 Vence esta semana',
    // A estas alturas la prórroga es un hecho: se llama para retarificar la
    // anualidad que entra, no para evitar la renovación.
    pie: 'Ya se prorroga. La llamada es para revisar la prima del año que entra.',
  },
  {
    id: 'cierre_plazo',
    hastaDias: DIAS_PREAVISO_TOMADOR + 3,
    titulo: '⏳ Se cierra el plazo para moverla',
    pie: `Quedan días para comunicar la oposición (mínimo ${DIAS_PREAVISO_TOMADOR} días antes del vencimiento, LCS art. 22).`,
  },
  {
    id: 'ventana',
    hastaDias: 60,
    titulo: '📅 Entra en ventana de renovación',
    pie: 'Hay plazo de sobra: es el momento de retarificar y comparar sin prisa.',
  },
] as const

export type HitoId = (typeof HITOS)[number]['id']

/** Clave de dedupe: una póliza avisa una vez por hito Y por vencimiento. Si la
 *  póliza se renueva, el vencimiento cambia y el ciclo vuelve a empezar solo. */
export function claveAviso(p: { id: string; fechaVencimiento: string }, hito: HitoId): string {
  return `${p.id}|${p.fechaVencimiento}|${hito}`
}

export type Emision = { poliza: PolizaAviso; hito: HitoId; consumidos: HitoId[] }

/**
 * Qué avisar hoy. `yaAvisados` son las claves que ya constan en la BD.
 *
 * Devuelve, por póliza, UN hito a comunicar y la lista de hitos que hay que
 * marcar como consumidos — que incluye los más laxos: si una póliza aparece ya
 * a 5 días, «entra en ventana» y «se cierra el plazo» son avisos que ya no
 * tienen sentido dar, pero tampoco pueden quedar pendientes para mañana.
 */
export function emisionesDeHoy(polizas: PolizaAviso[], yaAvisados: Set<string>): Emision[] {
  const salida: Emision[] = []
  for (const p of polizas) {
    // Aplicables = todos los hitos cuya ventana ya alcanzó esta póliza.
    const aplicables = HITOS.filter(h => p.dias <= h.hastaDias)
    if (aplicables.length === 0) continue
    const pendientes = aplicables.filter(h => !yaAvisados.has(claveAviso(p, h.id)))
    if (pendientes.length === 0) continue
    // El más urgente aplicable manda (HITOS ya está ordenado por urgencia).
    salida.push({
      poliza: p,
      hito: aplicables[0].id,
      consumidos: pendientes.map(h => h.id),
    })
  }
  return salida
}

const TIPOS: Record<string, string> = {
  auto: '🚗 Auto', moto: '🏍️ Moto', hogar: '🏠 Hogar', vida: '🧬 Vida', salud: '🩺 Salud',
  decesos: '⚱️ Decesos', responsabilidad_civil: '⚖️ R. Civil', comercio: '🏪 Comercio',
  comunidad: '🏢 Comunidad', accidentes: '🩹 Accidentes',
}

function fechaEs(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function linea(p: PolizaAviso): string {
  // La prima que la compañía no informa se dice como tal. Un «0€» aquí haría
  // parecer que la póliza no vale nada, que es lo contrario de lo que se sabe.
  const prima = p.prima === null ? 'prima sin informar' : eur(p.prima)
  const ramo = TIPOS[p.tipo] ?? p.tipo
  const dias = p.dias === 0 ? 'vence hoy' : `${p.dias} días`
  return `• ${p.cliente} · ${ramo} · ${p.aseguradora} · ${prima} · ${fechaEs(p.fechaVencimiento)} (${dias})`
}

/**
 * El mensaje de Telegram, agrupado por hito. `null` cuando no hay nada que
 * decir — el silencio de «hoy no toca ninguna» es correcto; lo que nunca puede
 * pasar es que un fallo de lectura se convierta en este mismo silencio (de eso
 * se encarga quien llama, avisando aparte).
 */
export function mensajeRenovaciones(emisiones: Emision[]): string | null {
  if (emisiones.length === 0) return null
  const partes: string[] = ['📅 *Renovaciones · Grupo ASegura*']
  for (const hito of HITOS) {
    const suyas = emisiones.filter(e => e.hito === hito.id).map(e => e.poliza)
    if (suyas.length === 0) continue
    suyas.sort((a, b) => a.dias - b.dias)
    partes.push('', `${hito.titulo} (${suyas.length})`, ...suyas.map(linea), `_${hito.pie}_`)
  }
  return partes.join('\n')
}

/** Detalle del latido: cuenta lo hecho sin adornos, para el parte del vigía. */
export function detalleRenovaciones(
  leidas: number, emitidas: number, ventanaDias: number,
): string {
  return `${leidas} póliza(s) en ${ventanaDias} días · ${emitidas} aviso(s) nuevos`
}
