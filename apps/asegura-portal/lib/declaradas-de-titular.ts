/**
 * Las pólizas que AÑADIÓ en su portal quien te ha dado acceso (08/10/2026).
 *
 * Principio de producto (Alberto): el portal es para que cada persona controle
 * SUS seguros, estén o no con la correduría. Para quien recibe el acceso, la
 * póliza que su mujer subió del banco es tan «su seguro» como las de CIMA, y su
 * tarjeta «Te ha dado acceso» no puede decir «sin seguros» teniéndola.
 *
 * 🚨 El problema de fondo es de IDENTIDAD, no de pintar: una autorización la da
 * una FICHA (`otorgante_cliente_id`) y una declarada es de una IDENTIDAD del
 * portal. El puente es `portal_vinculo`, y aquí se decide —puro y con test—
 * cuándo una identidad ES la titular de esa ficha. Todo lo dudoso cae FUERA
 * (fail-closed): enseñar a un tercero la póliza de otra persona por un vínculo
 * ambiguo es una fuga; no enseñarla es solo una tarjeta más corta.
 *
 * Reglas (cada una con su brazo en `declaradas-de-titular.test.ts`):
 *  1. Solo fichas abiertas ENTERAS (`poliza_id IS NULL`). Una concesión suelta
 *     nombra UNA póliza de la cartera; no dice nada de lo que añadió a mano.
 *  2. Vínculo que OPERA (`gestionar`/`administrar`): un vínculo de `tarjeta` o
 *     `completo` no dice que esa identidad sea la persona de la ficha.
 *  3. La identidad tiene que estar vinculada SOLO a esa ficha (sin contar los
 *     temporales de la vista de corredor). Con dos fichas —ella y su sociedad, o
 *     dos personas— no se sabe de cuál es cada declarada.
 *  4. Nunca la identidad que mira ni la del corredor.
 *  5. Solo declaradas con `titular_tipo = 'propio'`: `empresa` es de otra
 *     persona jurídica y `null` es «no se le preguntó» (no autoriza a afirmar).
 */

/** Las columnas de `portal_vinculo` que deciden. */
export type VinculoDeclarante = {
  identidadId: string
  clienteId: string
  nivel: string
  origen: string
}

const NIVELES_TITULAR: readonly string[] = ['gestionar', 'administrar']

/**
 * `identidadId → clienteId` de las identidades cuyas declaradas puede ver quien
 * tiene abierta ENTERA la ficha `clienteId`. `vinculos` debe traer TODOS los
 * vínculos de cada identidad candidata (no solo los de las fichas abiertas): sin
 * ellos la regla 3 no se puede comprobar, y entonces no se sirve nada.
 */
export function identidadesTitulares(entrada: {
  fichasEnteras: readonly string[]
  vinculos: readonly VinculoDeclarante[]
  identidadQueMira: string
  identidadCorredor: string
}): Map<string, string> {
  const abiertas = new Set(entrada.fichasEnteras)
  const porIdentidad = new Map<string, VinculoDeclarante[]>()
  for (const v of entrada.vinculos) {
    if (v.origen === 'corredor') continue
    const l = porIdentidad.get(v.identidadId)
    if (l) l.push(v)
    else porIdentidad.set(v.identidadId, [v])
  }
  const out = new Map<string, string>()
  for (const [identidadId, vs] of porIdentidad) {
    if (identidadId === entrada.identidadQueMira || identidadId === entrada.identidadCorredor) continue
    const fichas = new Set(vs.map((v) => v.clienteId))
    if (fichas.size !== 1) continue
    const v = vs[0]
    if (!abiertas.has(v.clienteId)) continue
    if (!vs.every((x) => NIVELES_TITULAR.includes(x.nivel))) continue
    out.set(identidadId, v.clienteId)
  }
  return out
}

/** Regla 5, aparte para que el `where` de la consulta y el test digan lo mismo. */
export const TITULAR_TIPO_VISIBLE_A_TERCERO = 'propio' as const

/**
 * Lo que un TERCERO ve de una declarada: lo mismo que pinta la fila de las
 * propias (`FilaDeclarada`), y nada más. Sin prima, matrícula, bastidor,
 * catastro, documento ni coberturas: la ficha de una añadida no se abre desde
 * otra identidad (`/boveda/anadida/[id]` filtra por la suya y da 404).
 */
export type DeclaradaDeTitular = {
  id: string
  compania: string | null
  ramo: string | null
  fechaVencimiento: Date | null
  deDocumento: boolean
}

/**
 * Lo que dice la cabecera plegada de un titular ajeno: sus pólizas de cartera
 * MÁS las que añadió. Contar solo unas dejaría «sin seguros» sobre una lista que
 * al abrirla sí tiene algo.
 */
export function cuentaDeTitular(t: { polizas: readonly unknown[]; declaradas?: readonly unknown[] }): number {
  return t.polizas.length + (t.declaradas === undefined ? 0 : t.declaradas.length)
}
