/**
 * Catálogo ESTÁTICO y en BORRADOR de lo que cubre cada paquete de AUTO de las compañías (nombres tal y como
 * los devuelven los bots RPA), para listarlo en el presupuesto del cliente. Sin IA en vivo: lo revisa una
 * persona (`docs/correduria/COBERTURAS-PAQUETES-AUTO.md`) y hasta entonces `revisado: false`.
 *
 * TRES ESTADOS por garantía: `true` (confirmada) · `false` (confirmado que NO) · `null` (sin confirmar).
 * Lo que no se ha podido confirmar es `null`, nunca `false`. Las claves son las del catálogo de vehículo
 * (`CATALOGO_GARANTIAS.auto`): no hay vocabulario paralelo (lo vigila el test).
 *
 * Fuentes (consulta 22/10/2026): el entorno no pudo abrir los PDF IPID (proxy 403), así que los datos salen de
 * resúmenes de buscador sobre páginas de la compañía y de comparadores. Cada dato lleva su `fuente` y su
 * `tipo`; ningún IPID oficial está verificado aún (`pendiente` en la hoja de revisión).
 */
import { normalizarTexto } from './coberturas-taxonomia.ts'

export type ValorCobertura = boolean | null
export type TipoFuente = 'compania' | 'comparador' | 'blog'
export type FuenteCobertura = { url: string; fecha: string; tipo: TipoFuente }

export type CoberturaPaquete = {
  /** Clave del catálogo de vehículo (`CATALOGO_GARANTIAS.auto`). */
  clave: string
  valor: ValorCobertura
  /** Límite / franquicia / condición en texto, solo si la fuente lo da. */
  limite?: string
  /** Obligatoria cuando `valor !== null`. */
  fuente?: FuenteCobertura
}

export type CompaniaPaquetes = 'allianz' | 'mapfre' | 'generali'

export type PaqueteAuto = {
  compania: CompaniaPaquetes
  /** Nombre canónico, tal y como lo devuelve el bot. */
  nombre: string
  /** Variantes ya normalizadas (`normalizarTexto`) que casan con este paquete (igualdad exacta). */
  alias: readonly string[]
  /** Siempre `false` hasta que Alberto valide la hoja de revisión. */
  revisado: boolean
  coberturas: readonly CoberturaPaquete[]
}

const F = (url: string, tipo: TipoFuente): FuenteCobertura => ({ url, fecha: '2026-10-22', tipo })
const ALZ = F('https://www.allianz.es/seguro-de-coche.html', 'compania')
const ALZ_RAS = F('https://www.rastreator.com/seguros/aseguradoras/allianz-seguros.aspx', 'comparador')
const MAP_BAS = F('https://www.mapfre.es/seguros/particulares/coche/seguros-de-coche/terceros-basico/', 'compania')
const MAP_AMP = F('https://www.mapfre.es/seguros/particulares/coche/seguros-de-coche/terceros-completo/', 'compania')
const MAP_TR = F('https://www.mapfreventas.com/seguros-de-coche-a-todo-riesgo', 'comparador')
const MAP_ACI = F('https://www.acierto.com/seguros-coche/aseguradoras/mapfre/', 'comparador')
const GEN_ACI = F('https://www.acierto.com/seguros-coche/aseguradoras/generali/', 'comparador')
const GEN_CHK = F('https://seguros.check24.es/seguros-de-coche/companias-aseguradoras/generali/', 'comparador')
const GEN_RK = F('https://www.rankia.com/blog/mejores-seguros/7501571-generali-seguros-opiniones', 'blog')

const si = (clave: string, fuente: FuenteCobertura, limite?: string): CoberturaPaquete => ({ clave, valor: true, fuente, ...(limite ? { limite } : {}) })
const no = (clave: string, fuente: FuenteCobertura): CoberturaPaquete => ({ clave, valor: false, fuente })
const nc = (clave: string): CoberturaPaquete => ({ clave, valor: null })

export const PAQUETES_AUTO: readonly PaqueteAuto[] = [
  {
    compania: 'allianz', nombre: 'Terceros con lunas', alias: ['terceros con lunas'], revisado: false,
    coberturas: [
      si('rc_obligatoria', ALZ), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'),
      si('asistencia_viaje', ALZ, 'asistencia en carretera; km no confirmados'),
      si('lunas', ALZ), si('conductor', ALZ),
      no('robo', ALZ_RAS), no('incendio', ALZ_RAS), no('fenomenos_atmosfericos', ALZ_RAS), no('danos_propios', ALZ),
      nc('colision_animales'), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'allianz', nombre: 'Tercero Ampliado', alias: ['tercero ampliado', 'terceros ampliado', 'terceros ampliados'], revisado: false,
    coberturas: [
      si('rc_obligatoria', ALZ), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'),
      si('asistencia_viaje', ALZ, 'asistencia en carretera; km no confirmados'),
      si('lunas', ALZ), si('conductor', ALZ),
      si('robo', ALZ), si('incendio', ALZ), si('fenomenos_atmosfericos', ALZ), si('colision_animales', ALZ, 'animales cinegéticos'),
      no('danos_propios', ALZ), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'allianz', nombre: 'Todo Riesgo con franq.', alias: ['todo riesgo con franq', 'todo riesgo con franquicia'], revisado: false,
    coberturas: [
      nc('rc_obligatoria'), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'), nc('asistencia_viaje'),
      nc('lunas'), nc('conductor'),
      si('robo', ALZ_RAS), si('incendio', ALZ_RAS), si('fenomenos_atmosfericos', ALZ_RAS),
      si('danos_propios', ALZ, 'con franquicia a elegir (importe no confirmado)'),
      nc('colision_animales'), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'mapfre', nombre: 'TERCEROS', alias: ['terceros', 'terceros basico'], revisado: false,
    coberturas: [
      si('rc_obligatoria', MAP_BAS), si('rc_voluntaria', MAP_BAS, 'suplementaria hasta 50.000.000€'),
      nc('defensa_juridica'), nc('retirada_carnet'),
      si('asistencia_viaje', MAP_BAS, 'asistencia en carretera; km no confirmados'), si('conductor', MAP_BAS),
      no('lunas', MAP_AMP), no('robo', MAP_AMP), no('incendio', MAP_AMP), no('danos_propios', MAP_AMP),
      nc('fenomenos_atmosfericos'), nc('colision_animales'), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'mapfre', nombre: 'TERCEROS AMPLIADO', alias: ['terceros ampliado', 'terceros completo'], revisado: false,
    coberturas: [
      si('rc_obligatoria', MAP_AMP), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'),
      nc('asistencia_viaje'), nc('conductor'),
      si('lunas', MAP_AMP, 'cobertura total'),
      si('robo', MAP_AMP, 'sin franquicia; robo total, piezas, accesorios declarados e intento de robo'),
      si('incendio', MAP_AMP, 'sin franquicia'),
      nc('fenomenos_atmosfericos'), nc('colision_animales'), no('danos_propios', MAP_AMP), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'mapfre', nombre: 'TODO RIESGO CON FRANQUICIA', alias: ['todo riesgo con franquicia', 'todo riesgo con franq'], revisado: false,
    coberturas: [
      nc('rc_obligatoria'), nc('rc_voluntaria'),
      nc('defensa_juridica'), // un blog cita «hasta 3.000€»: fuente única, sin confirmar
      nc('retirada_carnet'),
      si('asistencia_viaje', MAP_ACI, 'desde km 0 (comparador)'),
      nc('lunas'), nc('robo'), nc('incendio'), nc('fenomenos_atmosfericos'), nc('conductor'), nc('colision_animales'),
      si('danos_propios', MAP_TR, 'franquicia elegible 100-600€ según comparadores; sin confirmar en IPID'),
      nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'generali', nombre: 'TERCEROS', alias: ['terceros', 'terceros basico'], revisado: false,
    coberturas: [
      si('rc_obligatoria', GEN_ACI), si('rc_voluntaria', GEN_ACI), si('defensa_juridica', GEN_ACI, 'con reclamación de daños'),
      nc('retirada_carnet'), nc('asistencia_viaje'), nc('conductor'),
      no('danos_propios', GEN_ACI),
      nc('lunas'), nc('robo'), nc('incendio'), nc('fenomenos_atmosfericos'), nc('colision_animales'), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'generali', nombre: 'TERCEROS AMPLIADO', alias: ['terceros ampliado', 'tercero ampliado'], revisado: false,
    coberturas: [
      nc('rc_obligatoria'), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'), nc('asistencia_viaje'),
      si('lunas', GEN_ACI), si('robo', GEN_ACI), si('incendio', GEN_ACI),
      nc('fenomenos_atmosfericos'), // las fuentes no coinciden
      nc('colision_animales'),
      nc('conductor'), // 10.000€ según una fuente, 30.000€ según otra
      nc('danos_propios'), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'generali', nombre: 'TERCEROS COMPLETO', alias: ['terceros completo'], revisado: false,
    coberturas: [
      nc('rc_obligatoria'), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'), nc('asistencia_viaje'),
      nc('lunas'), nc('robo'), nc('incendio'), nc('fenomenos_atmosfericos'), nc('colision_animales'),
      si('conductor', GEN_CHK, 'hasta 30.000€ por fallecimiento o invalidez (una sola fuente)'),
      nc('danos_propios'), nc('vehiculo_sustitucion'),
    ],
  },
  {
    compania: 'generali', nombre: 'TODO RIESGO CON FRANQUICIA', alias: ['todo riesgo con franquicia', 'todo riesgo con franq'], revisado: false,
    coberturas: [
      nc('rc_obligatoria'), nc('rc_voluntaria'), nc('defensa_juridica'), nc('retirada_carnet'),
      nc('asistencia_viaje'), // Acierto la da por incluida; fuente única
      nc('lunas'), nc('robo'), nc('incendio'), nc('fenomenos_atmosfericos'), nc('colision_animales'), nc('conductor'),
      si('danos_propios', GEN_RK, 'con franquicia; importe no confirmado'),
      nc('vehiculo_sustitucion'),
    ],
  },
]

function companiaDe(compania: string | null | undefined): CompaniaPaquetes | null {
  const c = normalizarTexto(compania ?? '')
  if (!c) return null
  // «Allianz Direct» es OTRA entidad (venta directa, otros productos): nunca hereda este catálogo.
  if (/\bdirect\b/.test(c)) return null
  for (const k of ['allianz', 'mapfre', 'generali'] as const) if (new RegExp(`\\b${k}\\b`).test(c)) return k
  return null
}

/**
 * Qué cubre el paquete que devolvió el bot, o `null` si la compañía o el paquete no están en el catálogo
 * (null = «no sé», no «no cubre nada»). Igualdad exacta del nombre normalizado: sin parecidos.
 */
export function coberturasDePaquete(compania: string | null | undefined, nombrePaquete: string | null | undefined): PaqueteAuto | null {
  const c = companiaDe(compania)
  const n = normalizarTexto(nombrePaquete ?? '')
  if (!c || !n) return null
  return PAQUETES_AUTO.find((p) => p.compania === c && p.alias.includes(n)) ?? null
}
