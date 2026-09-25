/**
 * El DUEÑO de una empresa ve la empresa entera en su portal (25/09/2026, decisión de Alberto).
 *
 * «Si esa persona es el dueño de la empresa, automáticamente hay que dar acceso a toda la
 * información de la empresa. Si no, esa empresa se queda en el limbo.» Luego es el dueño quien
 * autoriza a su administrativo o a su contable.
 *
 * Lo que lo ACTIVA es la relación `Dueño` que Alberto mantiene en la ficha (`cliente_relaciones`),
 * NUNCA que el correo de la empresa coincida con el de alguien: un correo de contacto puede ser de
 * la gestoría o de un hijo (el caso Guzmán Pueyo/Lozano). El acceso se DERIVA al leer, sin escribir
 * filas: si Alberto borra la relación, se va en la siguiente visita.
 *
 * Reglas, y por qué:
 * - Solo `Dueño`. `Administración` NO: en el CRM tanto es el administrador de la sociedad como
 *   la administrativa que lleva los papeles, y con eso no se regala un acceso total. `Empresa` es la
 *   mitad espejo del par y no dice quién manda.
 * - La dirección de la fila del volcado NO es fiable (unas veces A=empresa, otras A=persona), así
 *   que la decide el TIPO: la otra ficha tiene que ser `juridica` de forma EXPLÍCITA (un NULL no
 *   inventa una empresa) y la propia tiene que NO serlo (una persona con NULL sí vale: muchas lo
 *   tienen vacío). Dos jurídicas entre sí no abren nada.
 */
export type RelacionFicha = { clienteAId: string; clienteBId: string; tipoRelacion: string }
export type TipoFicha = 'fisica' | 'juridica' | null
/** Solo las fichas VIVAS (activas, sin fusionar): una que no está en el mapa no abre nada. */
export type FichaDueno = { tipo: TipoFicha; correduriaId: string }

export const RELACION_DUENO = 'Dueño'

export function empresasDelDueno(
  misFichas: readonly string[],
  relaciones: readonly RelacionFicha[],
  fichaPorId: ReadonlyMap<string, FichaDueno>,
): string[] {
  const mias = new Set(misFichas)
  const out = new Set<string>()
  for (const r of relaciones) {
    if (r.tipoRelacion.trim() !== RELACION_DUENO) continue
    for (const [yo, otra] of [
      [r.clienteAId, r.clienteBId],
      [r.clienteBId, r.clienteAId],
    ] as const) {
      if (!mias.has(yo) || mias.has(otra)) continue
      const f = fichaPorId.get(yo)
      const e = fichaPorId.get(otra)
      // Falla CERRADO: la ficha propia inactiva o fusionada no está en el mapa y no abre nada.
      if (!f || !e || f.tipo === 'juridica' || e.tipo !== 'juridica') continue
      if (f.correduriaId !== e.correduriaId) continue
      out.add(otra)
    }
  }
  return [...out].sort()
}
