// Qué se le dice a Alberto tras subir un documento (29/09/2026): asegura abre SOLA la oportunidad de
// todo documento de seguro, y devuelve el desenlace en `oportunidad`. Cada desenlace se dice distinto
// porque se actúa distinto: no es lo mismo «ya es nuestra» que «no se ha podido leer».

export type AvisoOportunidadDocumento = {
  tono: 'ok' | 'info' | 'aviso'
  texto: string
  /** Ficha donde ha quedado la oportunidad (puede ser un lead nuevo). */
  clienteId: string | null
}

const fecha = (iso: unknown) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : null)
const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 200) : null)

/** `null` = la respuesta no trae desenlace (subida a una póliza, o un asegura anterior a esto). */
export function interpretarOportunidadDocumento(v: unknown): AvisoOportunidadDocumento | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const clienteId = txt(o.clienteId)
  switch (o.estado) {
    case 'creada':
    case 'actualizada': {
      const vence = fecha(o.vence)
      const llamada = fecha(o.llamada)
      const quien = o.clienteNuevo === true
        // «De otra persona» solo si se subió desde OTRA ficha (en «Subir póliza» no hay ficha de partida).
        ? ` para un lead NUEVO${o.relacionado === true ? ' (el documento era de otra persona)' : ''}`
        : o.relacionado === true ? ' en la ficha del tomador (el documento era de otra persona)' : ''
      const cuando = vence
        ? `vence el ${vence}; llamada el ${llamada ?? '—'}`
        : 'sin vencimiento legible: queda una tarea para pedirlo'
      const que = o.estado === 'creada'
        ? 'Oportunidad abierta sola'
        : o.completada === true
          ? 'Ya tenía una oportunidad de este seguro: le he completado lo que faltaba'
          : 'Ya tenía una oportunidad de este seguro abierta: sigue esa'
      return { tono: 'ok', texto: `${que}${quien} (${cuando}).`, clienteId }
    }
    case 'ya_nuestra':
      return { tono: 'info', texto: 'Esta póliza ya es nuestra (en vigor): no es una oportunidad.', clienteId: null }
    case 'no_es_seguro':
      return { tono: 'info', texto: 'No trae datos de un seguro (compañía, nº, vencimiento ni prima): no abre oportunidad.', clienteId: null }
    case 'sin_persona':
      return { tono: 'aviso', texto: 'No se sabe de quién es el seguro: abre la oportunidad a mano.', clienteId: null }
    case 'sin_lectura':
      return { tono: 'aviso', texto: `No se ha podido leer${txt(o.motivo) ? ` (${txt(o.motivo)})` : ''}: abre la oportunidad a mano.`, clienteId: null }
    case 'error':
      return { tono: 'aviso', texto: `La oportunidad no se ha podido abrir${txt(o.motivo) ? ` (${txt(o.motivo)})` : ''}: ábrela a mano.`, clienteId: null }
    default:
      return null
  }
}

// ─── La ficha del tomador tras «Subir póliza» (03/10/2026) ──────────────────────────────────────
// asegura devuelve `ficha`: a qué ficha ha ido el documento, si se ha abierto ahora, qué HUECOS ha
// rellenado (solo nombres de campo, nunca valores) y los avisos. `null` = no se ha tocado ninguna.

export type FichaDocumento = { clienteId: string; creada: boolean; rellenados: string[]; avisos: string[] }

const lista = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.flatMap(x => (typeof x === 'string' && x.trim() !== '' ? [x.trim().slice(0, 300)] : [])).slice(0, max) : []

/** `undefined` = asegura no dice nada de la ficha (versión anterior): no se afirma nada. */
export function interpretarFichaDocumento(v: unknown): FichaDocumento | null | undefined {
  if (v === undefined) return undefined
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const clienteId = txt(o.clienteId)
  if (!clienteId) return null
  return { clienteId, creada: o.creada === true, rellenados: lista(o.rellenados), avisos: lista(o.avisos) }
}

/** Una frase con lo que de verdad ha pasado en la ficha. */
export function textoFichaDocumento(f: FichaDocumento): string {
  const quien = f.creada ? 'Se ha abierto un lead nuevo para el tomador' : 'El documento es de una ficha que ya existía'
  const que = f.rellenados.length > 0
    ? `rellenado: ${f.rellenados.join(', ')}`
    : 'no se ha rellenado ningún dato (no había huecos o no se pudo)'
  return `${quien}; ${que}.`
}

// ─── Las figuras de una póliza de motor (03/10/2026) ────────────────────────────────────────────
// asegura devuelve en `oportunidad.figuras` cada persona de la póliza que no es el tomador
// (propietario, conductores) con su ficha y su rol, SIN nombres; y en `avisosFiguras` lo que no se
// pudo hacer. Una respuesta anterior (sin `figuras`) no pinta nada.

export type RolFiguraDocumento = 'propietario' | 'conductor_habitual' | 'conductor_ocasional' | 'tomador'
export type FiguraDocumento = { clienteId: string; roles: (RolFiguraDocumento | null)[]; creada: boolean }
export type FigurasDocumento = { figuras: FiguraDocumento[]; avisos: string[] }

const ROTULO_ROL: Record<RolFiguraDocumento, string> = {
  tomador: 'Tomador',
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
}
const esRol = (v: unknown): v is RolFiguraDocumento => typeof v === 'string' && v in ROTULO_ROL

/**
 * Las figuras, agrupadas por ficha (la misma persona puede ser propietaria y conductora). `null` =
 * asegura no dice nada (versión anterior, otro ramo o sin verificar) o no hay nada que enseñar.
 */
export function interpretarFigurasDocumento(oportunidad: unknown): FigurasDocumento | null {
  if (oportunidad === null || typeof oportunidad !== 'object' || Array.isArray(oportunidad)) return null
  const o = oportunidad as Record<string, unknown>
  if (!Array.isArray(o.figuras)) return null
  const porFicha = new Map<string, FiguraDocumento>()
  for (const x of o.figuras.slice(0, 20)) {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) continue
    const f = x as Record<string, unknown>
    const clienteId = txt(f.clienteId)
    if (!clienteId) continue
    const rol = esRol(f.rol) ? f.rol : null
    const ya = porFicha.get(clienteId)
    if (ya) {
      if (!ya.roles.includes(rol)) ya.roles.push(rol)
      ya.creada ||= f.creada === true
    } else porFicha.set(clienteId, { clienteId, roles: [rol], creada: f.creada === true })
  }
  // Un rol conocido manda sobre el «sin rol» de la misma ficha.
  for (const f of porFicha.values()) if (f.roles.some(r => r !== null)) f.roles = f.roles.filter(r => r !== null)
  const avisos = lista(o.avisosFiguras)
  if (porFicha.size === 0 && avisos.length === 0) return null
  return { figuras: [...porFicha.values()], avisos }
}

/** «Propietario y conductor habitual (creada)» / «Figura sin rol (ya existía)». */
export function textoFiguraDocumento(f: FiguraDocumento): string {
  const roles = f.roles.filter((r): r is RolFiguraDocumento => r !== null).map((r, i) => (i === 0 ? ROTULO_ROL[r] : ROTULO_ROL[r].toLowerCase()))
  const que = roles.length === 0 ? 'Figura sin rol' : roles.length === 1 ? roles[0] : `${roles.slice(0, -1).join(', ')} y ${roles[roles.length - 1]}`
  return `${que} (${f.creada ? 'creada' : 'ya existía'})`
}

/** «Figuras: Propietario (creada) · Conductor habitual (ya existía)». */
export function textoFigurasDocumento(fs: FigurasDocumento): string {
  return `Figuras: ${fs.figuras.map(textoFiguraDocumento).join(' · ')}`
}
