/**
 * Enlace de datos de HOGAR (25/10/2026): de lo que contestó el cliente (+ lo que diga el Catastro) a lo que la
 * correduría necesita para tarificar sin reteclear. PURO.
 *
 * Reglas:
 * - `null` = «no se sabe». Lo que el cliente dejó en blanco o el Catastro no publica NO se escribe (nunca 0 ni '').
 * - El Catastro solo cuenta con un inmueble INEQUÍVOCO (`estado: 'ok'`): varios, ninguno o caído = sin datos del
 *   Catastro, y se dice cuál de esas fue (no es lo mismo «no responde» que «hay 15 pisos y no sé cuál»).
 * - Lo que sale de aquí es DECLARADO: se escribe en `info_riesgo.datosVivienda` sin confirmar y solo en los huecos
 *   (lo que la correduría ya tenía escrito manda). Nunca en la ficha del cliente.
 */
import { TRAMOS_CONTENIDO, TRAMOS_CONTINENTE, claveDireccion, importeDeTramo, type Respuesta } from './solicitud-datos.ts'
import { ALARMA_ID_CODEOSCOPIC, idViviendaDeOpcion } from './solicitud-destinos.ts'

export type DireccionDeclarada = {
  cp: string | null
  provincia: string | null
  municipio: string | null
  calle: string | null
  numero: string | null
  planta: string | null
  puerta: string | null
  /** Calle OFICIAL del callejero; ambas `null` = texto libre. */
  viaTipo: string | null
  viaNombre: string | null
}

const txt = (v: Respuesta | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** La dirección declarada en un campo `direccion` (por defecto `vivienda`). `null` si no hay ni CP ni calle. */
export function direccionDeRespuestas(r: Record<string, Respuesta>, clave = 'vivienda'): DireccionDeclarada | null {
  const d: DireccionDeclarada = {
    cp: txt(r[claveDireccion(clave, 'Cp')]),
    provincia: txt(r[claveDireccion(clave, 'Provincia')]),
    municipio: txt(r[claveDireccion(clave, 'Municipio')]),
    calle: txt(r[claveDireccion(clave, 'Calle')]),
    numero: txt(r[claveDireccion(clave, 'Numero')]),
    planta: txt(r[claveDireccion(clave, 'Planta')]),
    puerta: txt(r[claveDireccion(clave, 'Puerta')]),
    viaTipo: txt(r[claveDireccion(clave, 'ViaTipo')]),
    viaNombre: txt(r[claveDireccion(clave, 'ViaNombre')]),
  }
  return d.cp === null && d.calle === null ? null : d
}

/** «2» → «2º»; «2º», «Bajo», «Ático» o «Entreplanta» se dejan tal cual (el «º» solo a un número pelado). */
export function plantaLegible(planta: string | null): string | null {
  if (planta === null || planta.trim() === '') return null
  const p = planta.trim()
  return /^\d+$/.test(p) ? `${p}º` : p
}

/** Una línea legible: «CL SOCORRO 24, 2º B · 41003 SEVILLA (SEVILLA)». */
export function direccionLegible(d: DireccionDeclarada): string {
  const via = d.viaTipo && d.viaNombre ? `${d.viaTipo} ${d.viaNombre}` : d.calle ?? ''
  const interior = [plantaLegible(d.planta), d.puerta].filter(Boolean).join(' ')
  const primera = [via, d.numero].filter(Boolean).join(' ') + (interior ? `, ${interior}` : '')
  const zona = [d.cp, d.municipio].filter(Boolean).join(' ') + (d.provincia && d.provincia !== d.municipio ? ` (${d.provincia})` : '')
  return [primera.trim(), zona.trim()].filter((x) => x !== '').join(' · ')
}

/** Qué dijo el Catastro de la dirección declarada. Solo `ok` trae datos. */
export type CatastroSolicitud =
  | { estado: 'ok'; referencia: string; metrosCuadrados: number | null; anioConstruccion: number | null; uso: string | null }
  | { estado: 'varios' | 'ninguno' | 'no_encontrado' | 'via_ambigua' | 'sin_direccion' | 'error' }

export function textoCatastroSolicitud(c: CatastroSolicitud | null): string {
  if (c === null) return 'Catastro sin consultar'
  switch (c.estado) {
    case 'ok': {
      const m = c.metrosCuadrados !== null && c.metrosCuadrados > 0 ? `${c.metrosCuadrados} m²` : 'm² sin dato'
      const a = c.anioConstruccion !== null ? `año ${c.anioConstruccion}` : 'año sin dato'
      const uso = c.uso && !/residencial/i.test(c.uso) ? ` · ⚠️ uso catastral «${c.uso}», no vivienda` : c.uso === null ? ' · uso sin dato' : ''
      return `Catastro: ref. ${c.referencia} · ${m} · ${a}${uso}`
    }
    case 'varios': return 'Catastro: varios pisos en ese portal y ninguno casa solo con planta/puerta (elige tú)'
    case 'ninguno': return 'Catastro: ningún inmueble casa con esa planta/puerta (revisa la dirección)'
    case 'no_encontrado': return 'Catastro: no encuentra esa dirección'
    case 'via_ambigua': return 'Catastro: la calle es ambigua en el callejero (revisa la dirección)'
    case 'sin_direccion': return 'Catastro: dirección incompleta, no se ha consultado'
    case 'error': return 'Catastro: no respondió (no es «no existe»: vuelve a consultarlo desde el riesgo)'
  }
}

/** Lo que el Catastro DEDUCE del tipo de vivienda (`deducirViviendaCatastro` de module-tarificacion), sin confirmar. */
export type ViviendaDeducidaSolicitud = { tipo: string | null; aviso?: string | null; ultimoPiso?: string | null }

/**
 * Lo que se propone escribir en `datosVivienda` (claves de `ESPEC_VIVIENDA`), sin nulls: solo lo que se sabe.
 * `ahoraIso` sella la consulta al Catastro cuando la hubo.
 *
 * 26/10/2026 — DECLARADO vs CATASTRO: lo del Catastro va SIEMPRE a sus gemelos (`catastroMetrosCuadrados`,
 * `catastroAnioConstruccion`, referencia); a `metrosCuadrados`/`anioConstruccion`/`tipoVivienda` (lo que se tarifica)
 * solo pasa si el cliente lo CONFIRMÓ en la tarjeta «¿Es esta tu vivienda?» (`confirmaCatastro`). Si lo corrigió o el
 * Catastro no respondió, va lo que él teclea. Todo sin confirmar por la correduría.
 */
export function viviendaDeSolicitud(
  r: Record<string, Respuesta>,
  catastro: CatastroSolicitud | null,
  ahoraIso: string,
  deducida: ViviendaDeducidaSolicitud | null = null,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  const d = direccionDeRespuestas(r)
  if (d) {
    if (d.cp) out.cp = d.cp
    if (d.provincia) out.provincia = d.provincia
    if (d.municipio) out.municipio = d.municipio
    const nombreVia = d.viaNombre ?? d.calle
    if (nombreVia) out.nombreVia = nombreVia.slice(0, 80)
    if (d.numero) out.numeroVia = d.numero
    if (d.planta) out.planta = d.planta
    if (d.puerta) out.puertaVivienda = d.puerta
    const legible = direccionLegible(d)
    if (legible) out.direccion = legible.slice(0, 200)
  }
  const confirma = r.confirmaCatastro === true
  const anioTope = Number(ahoraIso.slice(0, 4)) + 1
  const anioValido = (v: Respuesta | undefined): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1500 && v <= anioTope
  // Capitales: el número de antes (`valorContenido`) o el TECHO del tramo; sin techo / «que me lo calculen» = no se escribe.
  const contenido = typeof r.valorContenido === 'number' && r.valorContenido > 0 ? r.valorContenido : importeDeTramo(TRAMOS_CONTENIDO, r.tramoContenido)
  if (contenido !== null) out.capitalContenido = contenido
  const continente = importeDeTramo(TRAMOS_CONTINENTE, r.tramoContinente)
  if (continente !== null) out.capitalContinente = continente
  // Catálogos: solo id ATESTIGUADO. El tipo: lo que tecleó el cliente; si no, lo deducido y CONFIRMADO por él.
  for (const [clave, campo] of [['regimen', 'uso'], ['usoVivienda', 'ocupacion']] as const) {
    const id = idViviendaDeOpcion(clave, r[clave])
    if (id) out[campo] = id
  }
  const tipo = typeof r.tipoVivienda === 'string' ? r.tipoVivienda : confirma ? deducida?.tipo ?? null : null
  // «Último piso» NO es «ático» (26/10/2026): un piso que el Catastro deduce como el último de la parcela, confirmado por
  // el cliente, se anota como planta + `ultimoPiso = true`. Y NO como «planta intermedia» (`MiddleFloor`): ese id sería falso.
  const ultimoPiso = confirma && tipo === 'piso' && deducida?.ultimoPiso === 'ultimo'
  if (ultimoPiso) out.ultimoPiso = true
  const idTipo = ultimoPiso ? null : idViviendaDeOpcion('tipoVivienda', tipo)
  if (idTipo) out.tipoVivienda = idTipo
  if (r.alarma === false) out.alarma = ALARMA_ID_CODEOSCOPIC.no
  for (const k of ['propietarioEsTomador', 'urbanizacionCerrada', 'conMadera', 'puertaPrincipalBlindada', 'ventanasSeguras', 'vigilante'] as const) {
    const v = r[k]
    if (typeof v === 'boolean') out[k] = v
  }
  if (typeof r.habitaciones === 'number' && Number.isInteger(r.habitaciones) && r.habitaciones >= 1) out.habitaciones = r.habitaciones
  if (anioValido(r.anioUltimaReforma)) out.anioUltimaReforma = r.anioUltimaReforma
  for (const k of ['joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos'] as const) {
    const v = r[k]
    if (typeof v === 'number' && v >= 0) out[k] = v
  }
  if (typeof r.hipoteca === 'boolean') out.hipoteca = r.hipoteca
  const banco = txt(r.entidadHipoteca)
  if (r.hipoteca === true && banco) out.bancoHipoteca = banco.slice(0, 80)
  if (catastro?.estado === 'ok') {
    out.referenciaCatastral = catastro.referencia
    out.catastroReferencia = catastro.referencia
    out.catastroConsultadoAt = ahoraIso
    if (catastro.uso) out.usoCatastral = catastro.uso.slice(0, 60)
    if (catastro.metrosCuadrados !== null && catastro.metrosCuadrados > 0) {
      out.catastroMetrosCuadrados = catastro.metrosCuadrados
      if (confirma) out.metrosCuadrados = catastro.metrosCuadrados
    }
    if (catastro.anioConstruccion !== null && catastro.anioConstruccion >= 1500) {
      out.catastroAnioConstruccion = catastro.anioConstruccion
      if (confirma) out.anioConstruccion = catastro.anioConstruccion
    }
  }
  // Lo tecleado por el cliente (corrigió, o el Catastro no lo dio) manda sobre lo deducido.
  if (typeof r.metrosCuadrados === 'number' && r.metrosCuadrados > 0) out.metrosCuadrados = r.metrosCuadrados
  if (anioValido(r.anioConstruccion)) out.anioConstruccion = r.anioConstruccion
  return out
}

/**
 * Qué se escribe en `datosVivienda` (25/10/2026, revisión del PR #5057): por BLOQUES atómicos, nunca campo a campo.
 *   - Bloque DIRECCIÓN (cp, provincia, municipio, vía, número, planta, puerta, texto): solo si la guardada está vacía
 *     ENTERA. Si había otra y la declarada es distinta → no se escribe y se avisa («dirección distinta de la guardada»).
 *   - Bloque CATASTRO (referencia, m², año y la consulta): solo si no hay referencia previa o es la MISMA. Los m² y el
 *     año, además, solo donde no había (lo que escribió la correduría manda). Otra referencia → no se escribe y se avisa.
 *   - Hipoteca + banco: juntos, solo si ninguno estaba. Sueltos (`CLAVES_SUELTAS_VIVIENDA`: contenido, régimen, uso,
 *     tipo, protecciones, capitales, joyas…): cada uno solo si no estaba.
 *   - Bloque CONFIRMADO por Alberto (`confirmadoAt`): NO se toca nada; lo declarado queda en la solicitud y en el aviso.
 * `actual` = lo que la pantalla del riesgo enseña (lo estructurado o, sin ello, la precarga de la póliza).
 */
export const CLAVES_BLOQUE_DIRECCION = ['cp', 'provincia', 'municipio', 'municipioId', 'tipoViaId', 'nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'direccion'] as const
export const CLAVES_BLOQUE_CATASTRO = ['referenciaCatastral', 'catastroReferencia', 'catastroConsultadoAt', 'usoCatastral', 'metrosCuadrados', 'catastroMetrosCuadrados', 'anioConstruccion', 'catastroAnioConstruccion'] as const

/** Campos que se escriben uno a uno, solo si estaban vacíos (lo que escribió la correduría manda). */
export const CLAVES_SUELTAS_VIVIENDA = [
  'capitalContenido', 'capitalContinente', 'uso', 'ocupacion', 'tipoVivienda', 'ultimoPiso', 'alarma', 'habitaciones', 'anioUltimaReforma',
  'propietarioEsTomador', 'urbanizacionCerrada', 'conMadera', 'puertaPrincipalBlindada', 'ventanasSeguras', 'vigilante',
  'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos',
] as const

export type PlanVivienda = {
  escribir: Record<string, string | number | boolean>
  /** Lo que NO se ha escrito por chocar con lo guardado (frases para el aviso). */
  conflictos: string[]
  /** El bloque estaba confirmado: no se ha tocado nada. */
  confirmado: boolean
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s.,º°ª-]/g, '')
const refNorm = (v: unknown) => String(v ?? '').replace(/[\s-]/g, '').toUpperCase()

export function planEscrituraVivienda(actual: Record<string, unknown> | null, propuesta: Record<string, string | number | boolean>, confirmadoAt: string | null = null): PlanVivienda {
  if (confirmadoAt) return { escribir: {}, conflictos: [], confirmado: true }
  const a = actual ?? {}
  const escribir: Record<string, string | number | boolean> = {}
  const conflictos: string[] = []
  const de = (claves: readonly string[]) => Object.fromEntries(claves.flatMap((k) => (k in propuesta ? [[k, propuesta[k]]] : [])))

  // Dirección.
  const dir = de(CLAVES_BLOQUE_DIRECCION)
  if (Object.keys(dir).length > 0) {
    if (CLAVES_BLOQUE_DIRECCION.every((k) => vacio(a[k]))) Object.assign(escribir, dir)
    else {
      // Misma dirección (CP + vía + número, sin tildes, espacios ni «º») = nada que hacer; si no, conflicto.
      const misma = ['cp', 'nombreVia', 'numeroVia'].every((k) => !(k in dir) || vacio(a[k]) || norm(a[k]) === norm(dir[k]))
        && (!('planta' in dir) || vacio(a.planta) || norm(a.planta) === norm(dir.planta))
        && (!('puertaVivienda' in dir) || vacio(a.puertaVivienda) || norm(a.puertaVivienda) === norm(dir.puertaVivienda))
      if (!misma) conflictos.push('dirección distinta de la guardada: revisar (no se ha tocado la guardada)')
    }
  }

  // Catastro. Sin referencia en la propuesta, los m²/año son DECLARADOS (el Catastro no respondió): van sueltos.
  const cat = de(CLAVES_BLOQUE_CATASTRO)
  if (Object.keys(cat).length > 0 && !('referenciaCatastral' in cat)) {
    for (const k of ['metrosCuadrados', 'anioConstruccion'] as const) if (k in cat && vacio(a[k])) escribir[k] = cat[k]
  } else if (Object.keys(cat).length > 0) {
    const previa = vacio(a.referenciaCatastral) ? null : refNorm(a.referenciaCatastral)
    if (previa === null || previa === refNorm(cat.referenciaCatastral)) {
      for (const [k, v] of Object.entries(cat)) {
        if ((k === 'metrosCuadrados' || k === 'anioConstruccion' || k === 'referenciaCatastral') && !vacio(a[k])) continue
        escribir[k] = v
      }
    } else {
      conflictos.push('referencia catastral distinta de la guardada: revisar (no se han tocado los datos del Catastro)')
    }
  }

  // Hipoteca + banco, juntos.
  const hip = de(['hipoteca', 'bancoHipoteca'])
  if (Object.keys(hip).length > 0 && vacio(a.hipoteca) && vacio(a.bancoHipoteca)) Object.assign(escribir, hip)
  else if ('hipoteca' in hip && !vacio(a.hipoteca) && a.hipoteca !== hip.hipoteca) conflictos.push('hipoteca declarada distinta de la guardada: revisar')

  // Sueltos (contenido y, desde el 26/10/2026, las preguntas nuevas): solo donde no había nada.
  for (const k of CLAVES_SUELTAS_VIVIENDA) if (k in propuesta && vacio(a[k])) escribir[k] = propuesta[k]
  return { escribir, conflictos, confirmado: false }
}
