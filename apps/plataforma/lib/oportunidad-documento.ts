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
/** Qué tiene la ficha de la figura tras la subida (`campos` de asegura). Solo booleanos: nunca valores. */
export const CAMPOS_FIGURA_DOCUMENTO = ['nombre', 'nacimiento', 'domicilio', 'telefono', 'email', 'carne', 'dni'] as const
export type CampoFiguraDocumento = (typeof CAMPOS_FIGURA_DOCUMENTO)[number]
/** `true` = lo tiene; `false` = le falta; `null` = no se pudo mirar. */
export type CamposFiguraDocumento = Record<CampoFiguraDocumento, boolean | null>
export type FiguraDocumento = {
  clienteId: string
  roles: (RolFiguraDocumento | null)[]
  creada: boolean
  /** `null` = asegura no lo dice (respuesta anterior): no se pinta. */
  campos: CamposFiguraDocumento | null
}
export type FigurasDocumento = { figuras: FiguraDocumento[]; avisos: string[] }

const ROTULO_ROL: Record<RolFiguraDocumento, string> = {
  tomador: 'Tomador',
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
}
const esRol = (v: unknown): v is RolFiguraDocumento => typeof v === 'string' && v in ROTULO_ROL

const ROTULO_CAMPO: Record<CampoFiguraDocumento, string> = {
  nombre: 'nombre', nacimiento: 'nacimiento', domicilio: 'domicilio', telefono: 'teléfono', email: 'email', carne: 'carné', dni: 'DNI',
}

/** Solo booleanos (o `null`): cualquier otra cosa —un valor que se colara— cuenta como «no se sabe». */
function camposFigura(v: unknown): CamposFiguraDocumento | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return Object.fromEntries(CAMPOS_FIGURA_DOCUMENTO.map(k => [k, typeof o[k] === 'boolean' ? o[k] : null])) as CamposFiguraDocumento
}

/** «Tiene: nombre, nacimiento · Falta: domicilio, DNI · Sin comprobar: email». `null` = nada que decir. */
export function textoCamposFigura(c: CamposFiguraDocumento | null): { tiene: string[]; falta: string[]; sinComprobar: string[] } | null {
  if (!c) return null
  const de = (x: boolean | null) => CAMPOS_FIGURA_DOCUMENTO.filter(k => c[k] === x).map(k => ROTULO_CAMPO[k])
  return { tiene: de(true), falta: de(false), sinComprobar: de(null) }
}

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
    const campos = camposFigura(f.campos)
    const ya = porFicha.get(clienteId)
    if (ya) {
      if (!ya.roles.includes(rol)) ya.roles.push(rol)
      ya.creada ||= f.creada === true
      ya.campos ??= campos
    } else porFicha.set(clienteId, { clienteId, roles: [rol], creada: f.creada === true, campos })
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

// ─── Propuesta de corregir la identidad con la póliza (05/10/2026) ──────────

/**
 * asegura propone corregir nombre/apellidos de la ficha con los de la póliza SOLO si el DNI de la
 * póliza es el de la ficha (caso «Estibaliz Slava» → «Eslava Antoli»). No se escribe nada: el corredor
 * lo confirma y va por el PATCH de identidad con ESTE documento (`documentoId`) como acreditativo.
 */
export type PropuestaIdentidadDocumento = {
  clienteId: string
  documentoId: string
  nombre: string
  apellidos: string
  actual: { nombre: string; apellidos: string }
  /** `hueco` · `un_apellido` · `distinto` (por qué se propone). */
  motivo: string
}

/** `null` = no hay propuesta (o la respuesta no tiene la forma esperada: tampoco se inventa una). */
export function interpretarPropuestaIdentidad(v: unknown): PropuestaIdentidadDocumento | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const p = o.propuesta && typeof o.propuesta === 'object' && !Array.isArray(o.propuesta) ? (o.propuesta as Record<string, unknown>) : null
  const actual = p?.actual && typeof p.actual === 'object' && !Array.isArray(p.actual) ? (p.actual as Record<string, unknown>) : null
  const clienteId = txt(o.clienteId)
  const documentoId = txt(o.documentoId)
  const nombre = txt(p?.nombre)
  if (!clienteId || !documentoId || !p || !nombre || !actual) return null
  return {
    clienteId,
    documentoId,
    nombre,
    apellidos: typeof p.apellidos === 'string' ? p.apellidos.trim() : '',
    actual: { nombre: typeof actual.nombre === 'string' ? actual.nombre : '', apellidos: typeof actual.apellidos === 'string' ? actual.apellidos : '' },
    motivo: txt(p.motivo) ?? 'distinto',
  }
}

/** Lo que se pinta: «Estibaliz Slava» → «Estibaliz Eslava Antoli», y por qué. */
export function textoPropuestaIdentidad(p: PropuestaIdentidadDocumento): string {
  const de = `${p.actual.nombre} ${p.actual.apellidos}`.trim() || '(sin nombre)'
  const a = `${p.nombre} ${p.apellidos}`.trim()
  const porque = p.motivo === 'un_apellido' ? 'la ficha solo tiene un apellido' : p.motivo === 'hueco' ? 'a la ficha le falta el nombre o los apellidos' : 'la póliza lo escribe distinto'
  return `La póliza (con el mismo DNI que la ficha) dice «${a}» y la ficha «${de}»: ${porque}.`
}
