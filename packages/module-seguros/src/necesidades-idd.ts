/**
 * Cuestionario de exigencias y necesidades (IDD, art. 20 Ley 16/2018 → hoy RDL 3/2020).
 *
 * Antes era un texto libre que escribía el corredor. Con preguntas cerradas por ramo:
 *  - todos los presupuestos preguntan lo mismo (prueba uniforme ante la DGSFP), y
 *  - nada se olvida (quién conduce, lunas, régimen de la vivienda…).
 *
 * El resultado se guarda como TEXTO en la misma columna `necesidades` de siempre
 * (`textoNecesidades`), que es lo que el cliente lee y firma con la aceptación: así no
 * cambia la BD ni lo que ya firmó nadie. Las respuestas en bruto viajan aparte, para la
 * auditoría del evento.
 *
 * Una pregunta sin responder NO se inventa: el cuestionario no se da por completo.
 */

export type OpcionPregunta = { valor: string; texto: string }
export type PreguntaNecesidad = {
  id: string
  texto: string
  /** Cómo se escribe en la declaración: «<etiqueta>: <texto de la opción>». */
  etiqueta: string
  opciones: readonly OpcionPregunta[]
}

export type GrupoNecesidades = 'motor' | 'hogar' | 'otro'
export type RespuestasNecesidades = Readonly<Record<string, string>>

const SI_NO: readonly OpcionPregunta[] = [
  { valor: 'si', texto: 'sí' },
  { valor: 'no', texto: 'no' },
  { valor: 'indiferente', texto: 'le es indiferente' },
]

const COMUNES: readonly PreguntaNecesidad[] = [
  {
    id: 'prioridad', texto: '¿Qué le importa más?', etiqueta: 'Prioridad',
    opciones: [
      { valor: 'precio', texto: 'el precio' },
      { valor: 'coberturas', texto: 'las coberturas' },
      { valor: 'equilibrio', texto: 'un equilibrio entre precio y coberturas' },
    ],
  },
  {
    id: 'franquicia', texto: '¿Acepta una franquicia para pagar menos?', etiqueta: 'Acepta franquicia',
    opciones: SI_NO,
  },
]

const MOTOR: readonly PreguntaNecesidad[] = [
  {
    id: 'uso', texto: '¿Para qué usa el vehículo?', etiqueta: 'Uso del vehículo',
    opciones: [
      { valor: 'particular', texto: 'particular' },
      { valor: 'profesional', texto: 'profesional o de trabajo' },
    ],
  },
  {
    id: 'conductores', texto: '¿Quién lo conduce?', etiqueta: 'Conductores',
    opciones: [
      { valor: 'solo_tomador', texto: 'solo el tomador' },
      { valor: 'ocasionales', texto: 'el tomador y conductores ocasionales' },
      { valor: 'jovenes', texto: 'también conductores menores de 25 años o con menos de 2 años de carné' },
    ],
  },
  {
    id: 'modalidad', texto: '¿Qué modalidad busca?', etiqueta: 'Modalidad',
    opciones: [
      { valor: 'terceros', texto: 'terceros básico' },
      { valor: 'terceros_ampliado', texto: 'terceros ampliado (lunas, robo, incendio)' },
      { valor: 'todo_riesgo_franquicia', texto: 'todo riesgo con franquicia' },
      { valor: 'todo_riesgo', texto: 'todo riesgo sin franquicia' },
    ],
  },
  { id: 'lunas', texto: '¿Quiere cobertura de lunas?', etiqueta: 'Lunas', opciones: SI_NO },
  { id: 'asistencia', texto: '¿Quiere asistencia en viaje desde el km 0?', etiqueta: 'Asistencia desde el km 0', opciones: SI_NO },
  { id: 'sustitucion', texto: '¿Quiere vehículo de sustitución?', etiqueta: 'Vehículo de sustitución', opciones: SI_NO },
]

const HOGAR: readonly PreguntaNecesidad[] = [
  {
    id: 'regimen', texto: '¿Es propietario o inquilino?', etiqueta: 'Régimen',
    opciones: [
      { valor: 'propietario', texto: 'propietario' },
      { valor: 'inquilino', texto: 'inquilino' },
    ],
  },
  {
    id: 'vivienda', texto: '¿Qué vivienda es?', etiqueta: 'Vivienda',
    opciones: [
      { valor: 'habitual', texto: 'habitual' },
      { valor: 'segunda', texto: 'segunda residencia' },
      { valor: 'alquilada', texto: 'la alquila a otros' },
    ],
  },
  {
    id: 'que_asegura', texto: '¿Qué quiere asegurar?', etiqueta: 'Qué asegura',
    opciones: [
      { valor: 'continente', texto: 'solo el continente' },
      { valor: 'contenido', texto: 'solo el contenido' },
      { valor: 'ambos', texto: 'continente y contenido' },
    ],
  },
  { id: 'hipoteca', texto: '¿Lo pide el banco por una hipoteca?', etiqueta: 'Vinculado a hipoteca', opciones: SI_NO },
  { id: 'objetos_valor', texto: '¿Tiene joyas u objetos de valor que asegurar?', etiqueta: 'Joyas u objetos de valor', opciones: SI_NO },
]

/** El grupo de preguntas que toca a un ramo. Un ramo sin cuestionario propio pregunta solo lo común. */
export function grupoNecesidades(ramo: string | null | undefined): GrupoNecesidades {
  const r = (ramo ?? '').toLowerCase()
  if (r === 'auto' || r === 'moto') return 'motor'
  if (r === 'hogar') return 'hogar'
  return 'otro'
}

export function preguntasNecesidades(ramo: string | null | undefined): readonly PreguntaNecesidad[] {
  const g = grupoNecesidades(ramo)
  return g === 'motor' ? [...MOTOR, ...COMUNES] : g === 'hogar' ? [...HOGAR, ...COMUNES] : COMUNES
}

export type ValidacionRespuestas =
  | { ok: true; respuestas: Record<string, string> }
  | { ok: false; faltan: string[]; invalidas: string[] }

/**
 * Solo pasan las respuestas de preguntas de ESE ramo con un valor de su lista. Falta una
 * → no está completo (no se inventa). Claves que no son del ramo se descartan.
 */
export function validarRespuestasNecesidades(ramo: string | null | undefined, respuestas: unknown): ValidacionRespuestas {
  const r = respuestas && typeof respuestas === 'object' ? (respuestas as Record<string, unknown>) : {}
  const limpias: Record<string, string> = {}
  const faltan: string[] = []
  const invalidas: string[] = []
  for (const p of preguntasNecesidades(ramo)) {
    const v = r[p.id]
    if (v === undefined || v === null || v === '') { faltan.push(p.id); continue }
    if (typeof v !== 'string' || !p.opciones.some((o) => o.valor === v)) { invalidas.push(p.id); continue }
    limpias[p.id] = v
  }
  return faltan.length || invalidas.length ? { ok: false, faltan, invalidas } : { ok: true, respuestas: limpias }
}

/**
 * La declaración que se guarda y que el cliente firma: una frase por pregunta, en el orden
 * del cuestionario, y al final lo que el corredor añada a mano. Solo usa respuestas válidas.
 */
export function textoNecesidades(ramo: string | null | undefined, respuestas: RespuestasNecesidades, otras?: string | null): string {
  const partes: string[] = []
  for (const p of preguntasNecesidades(ramo)) {
    const o = p.opciones.find((x) => x.valor === respuestas[p.id])
    if (o) partes.push(`${p.etiqueta}: ${o.texto}.`)
  }
  const extra = (otras ?? '').replace(/\s+/g, ' ').trim()
  if (extra) partes.push(`Además: ${extra}`)
  return partes.join(' ')
}

/**
 * Las respuestas DEDUCIDAS de lo que ya se ha presupuestado (29/09/2026, dictado de Alberto: «que
 * se autorrellene y se guarde, eso no me puede salir»). Sale de la petición que viajó a la compañía
 * y de la opción que se le recomienda; lo que no se puede leer de ahí toma el valor más neutro
 * («le es indiferente», «un equilibrio»). Todas las respuestas son válidas para el ramo: el
 * cuestionario queda completo. El texto dice que es deducido, para que nadie lo lea como una
 * declaración literal del cliente, y el corredor puede corregirlo mientras no se acepte.
 */
export function deducirNecesidades(
  ramo: string | null | undefined,
  peticion: unknown,
  recomendada: { categoria: string | null; franquiciaEur: number | null } | null,
  hoy: Date = new Date(),
): { respuestas: Record<string, string>; otras: string } {
  const g = grupoNecesidades(ramo)
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const pet = obj(peticion)
  const risk = obj(pet.risk)
  const r: Record<string, string> = { prioridad: 'equilibrio', franquicia: 'indiferente' }
  const notas: string[] = []

  if (g === 'motor') {
    const doc = (p: unknown) => {
      const d = obj(obj(p).identificationDocument)
      return { tipo: String(obj(d.type).id ?? ''), id: String(d.id ?? '').toUpperCase() }
    }
    const tomador = doc(pet.holder)
    const conductor = doc(risk.primaryDriver)
    r.uso = tomador.tipo === 'Cif' ? 'profesional' : 'particular'
    const edad = (p: unknown) => {
      const f = Date.parse(String(obj(p).birthDate ?? ''))
      return Number.isFinite(f) ? (hoy.getTime() - f) / (365.25 * 86400000) : null
    }
    const carne = (p: unknown) => {
      const l = Array.isArray(obj(p).drivingLicenses) ? (obj(p).drivingLicenses as unknown[])[0] : null
      const f = Date.parse(String(obj(l).date ?? ''))
      return Number.isFinite(f) ? (hoy.getTime() - f) / (365.25 * 86400000) : null
    }
    const joven = (p: unknown) => {
      const e = edad(p)
      const c = carne(p)
      return (e !== null && e < 25) || (c !== null && c < 2)
    }
    if (joven(risk.primaryDriver) || (risk.secondaryDriver && joven(risk.secondaryDriver))) r.conductores = 'jovenes'
    else if (risk.secondaryDriver) r.conductores = 'ocasionales'
    else r.conductores = 'solo_tomador'
    if (conductor.id && tomador.id && conductor.id !== tomador.id) {
      notas.push('el conductor habitual es otra persona distinta del tomador')
      if (r.conductores === 'solo_tomador') r.conductores = 'ocasionales'
    }
    const cat = (recomendada?.categoria ?? '').toLowerCase()
    const conFranquicia = (recomendada?.franquiciaEur ?? 0) > 0 || /franquicia/.test(cat)
    r.modalidad = /todo\s*riesgo/.test(cat)
      ? conFranquicia ? 'todo_riesgo_franquicia' : 'todo_riesgo'
      : /ampliad|plus|complet|lunas|robo|incendio/.test(cat) ? 'terceros_ampliado' : 'terceros'
    if (r.modalidad === 'todo_riesgo_franquicia') r.franquicia = 'si'
    r.lunas = 'indiferente'
    r.asistencia = 'indiferente'
    r.sustitucion = 'indiferente'
  } else if (g === 'hogar') {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    r.regimen = risk.owner ? 'propietario' : 'inquilino'
    r.vivienda = 'habitual'
    const cont = n(risk.buildingsLimit) > 0
    const cdo = n(risk.contentsLimit) > 0
    r.que_asegura = cont && cdo ? 'ambos' : cont ? 'continente' : cdo ? 'contenido' : 'ambos'
    r.hipoteca = 'indiferente'
    r.objetos_valor = n(risk.highValueItemsLimit) + n(risk.jewelsInSafeBoxLimit) + n(risk.jewelsOutSafeBoxLimit) > 0 ? 'si' : 'no'
    if ((recomendada?.franquiciaEur ?? 0) > 0) r.franquicia = 'si'
  }

  const respuestas: Record<string, string> = {}
  for (const p of preguntasNecesidades(ramo)) if (r[p.id]) respuestas[p.id] = r[p.id]
  const otras = `Deducido de lo presupuestado${notas.length ? ` (${notas.join('; ')})` : ''}.`
  return { respuestas, otras }
}
