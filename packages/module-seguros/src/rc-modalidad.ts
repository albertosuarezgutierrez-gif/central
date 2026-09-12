/**
 * Modalidad de una RC "suelta" (responsabilidad civil general, no ligada a un
 * bien) cuando la compañía no manda coberturas por CIMA/EIAC.
 *
 * `objeto.ts` ya distingue «no informado» (la compañía no lo ha mandado, es un
 * "todavía no se sabe") de las demás ausencias. Esto NO sustituye esa lectura:
 * es el ÚNICO camino para que un corredor anote a mano de qué RC se trata
 * cuando la compañía no lo dice — un dato MANUAL, y se pinta como tal.
 */

export type ModalidadRc = { id: string; etiqueta: string }

/** Catálogo cerrado: evita que cada corredor teclee su propio texto libre y
 *  que la misma modalidad acabe escrita de cinco formas distintas. */
export const MODALIDADES_RC: ModalidadRc[] = [
  { id: 'general', etiqueta: 'RC General / Vida privada' },
  { id: 'explotacion', etiqueta: 'RC Explotación (actividad empresarial)' },
  { id: 'patronal', etiqueta: 'RC Patronal (accidentes de trabajo)' },
  { id: 'profesional', etiqueta: 'RC Profesional' },
  { id: 'locativa', etiqueta: 'RC Locativa (inmueble alquilado)' },
  { id: 'productos', etiqueta: 'RC Productos' },
  { id: 'caza', etiqueta: 'RC de Caza' },
  { id: 'otra', etiqueta: 'Otra (se detalla en nota)' },
]

const POR_ID = new Map(MODALIDADES_RC.map((m) => [m.id, m]))

export function etiquetaModalidadRc(id: string): string | null {
  return POR_ID.get(id)?.etiqueta ?? null
}

export type ValidacionRc =
  | { ok: true; id: string; nota: string | null }
  | { ok: false; motivo: string }

const MAX_NOTA = 200

/**
 * Valida lo que teclea el corredor. `id` tiene que estar en el catálogo (no se
 * acepta un id inventado: un id que no está en `MODALIDADES_RC` no se puede ni
 * pintar, porque `etiquetaModalidadRc` devolvería `null` y el "conocido" que se
 * guardó dejaría de tener título). La nota es libre y opcional, salvo en
 * `otra`, donde SIN nota no se sabe nada más que "es otra cosa" — eso no es
 * mejor que "no informado".
 */
export function validarModalidadRc(idCrudo: unknown, notaCruda?: unknown): ValidacionRc {
  const id = typeof idCrudo === 'string' ? idCrudo.trim() : ''
  if (id === '') return { ok: false, motivo: 'Falta la modalidad.' }
  if (!POR_ID.has(id)) return { ok: false, motivo: 'Esa modalidad no existe en el catálogo.' }
  const notaTexto = typeof notaCruda === 'string' ? notaCruda.trim() : ''
  const nota = notaTexto === '' ? null : notaTexto.slice(0, MAX_NOTA)
  if (id === 'otra' && nota === null) {
    return { ok: false, motivo: 'Con "Otra" hace falta una nota que diga de qué RC se trata.' }
  }
  return { ok: true, id, nota }
}

/** El texto final que se guarda y se pinta como título del objeto asegurado. */
export function tituloModalidadRc(id: string, nota: string | null): string | null {
  const etiqueta = etiquetaModalidadRc(id)
  if (etiqueta === null) return null
  if (id === 'otra') return nota
  return nota ? `${etiqueta} · ${nota}` : etiqueta
}
