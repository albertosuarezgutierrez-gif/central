// La ficha de hogar, en filas listas para pintar.
//
// PURO: no sabe de React, ni de base de datos, ni de quién la mira. Entra una
// precalificación (`desde-cartera-hogar.ts`) y salen las filas con su etiqueta,
// su valor legible, de dónde sale y si se puede tocar. Esa es la pieza que van a
// compartir las tres puertas del expediente (corredor, agente y web): la
// pantalla cambia, las filas no.
//
// ─── Por qué la procedencia va en cada fila ─────────────────────────────────
// Un m² que teclearon a mano en 2023 y un m² del Catastro de hoy no merecen la
// misma confianza, y quien mira la ficha tiene que poder distinguirlos de un
// vistazo. Por eso cada fila dice de dónde viene su valor, y cuando es un
// supuesto lleva además el porqué entero: es la letra pequeña del precio.
//
// ─── Nivel de detalle ───────────────────────────────────────────────────────
// El mismo resumen se le puede enseñar a un cliente, pero contando menos: un
// desconocido no tiene por qué ver que su superficie sale de una copia del
// volcado de su póliza anterior. `nivel: 'cliente'` recorta la procedencia y
// los porqués, sin cambiar ni una fila.

import { eur } from '../dinero.ts'
import type { CatalogoHogar } from './catalogos.ts'
import type { Opcion } from './opciones.ts'
import type { DatosHogar } from './peticion-hogar.ts'
import type { CatalogoResuelto, PrecalificacionHogar } from './desde-cartera-hogar.ts'

/** Los nueve desplegables de catálogo que pinta la pantalla, en orden de lectura. */
export const CATALOGOS_PANTALLA = [
  'property-types',
  'uses',
  'occupancy-types',
  'locations',
  'settlement-types',
  'build-materials',
  'build-qualities',
  'door-types',
  'alarm-types',
] as const satisfies readonly CatalogoHogar[]

export type CatalogoPantalla = (typeof CATALOGOS_PANTALLA)[number]

/** Del nombre del catálogo del vendor al campo nuestro que rellena. */
export const CAMPO_DE_CATALOGO: Record<CatalogoPantalla, Exclude<CatalogoResuelto, 'tipoVia'>> = {
  'property-types': 'tipoVivienda',
  uses: 'uso',
  'occupancy-types': 'ocupacion',
  locations: 'ubicacion',
  'settlement-types': 'asentamiento',
  'build-materials': 'material',
  'build-qualities': 'calidad',
  'door-types': 'puertasSecundarias',
  'alarm-types': 'alarma',
}

/** El catálogo del que se surte cada campo, para pintar su desplegable. */
export const CATALOGO_DE_CAMPO = Object.fromEntries(
  Object.entries(CAMPO_DE_CATALOGO).map(([cat, campo]) => [campo, cat as CatalogoPantalla]),
) as Record<string, CatalogoPantalla>

export type Grupo = 'tomador' | 'donde' | 'como' | 'protecciones' | 'capitales' | 'cotizacion'

export const GRUPOS: { id: Grupo; titulo: string; nota: string | null }[] = [
  { id: 'donde', titulo: 'Dónde está', nota: 'La compañía exige la calle entera, no solo el código postal.' },
  { id: 'como', titulo: 'Cómo es', nota: null },
  { id: 'protecciones', titulo: 'Protecciones', nota: 'Cada una que tengas baja el precio. Lo que no sepamos va como «no».' },
  { id: 'capitales', titulo: 'Qué se asegura', nota: null },
  { id: 'tomador', titulo: 'El tomador', nota: 'Nada de aquí se supone: o está en la ficha o falta.' },
  { id: 'cotizacion', titulo: 'La cotización', nota: null },
]

/** De dónde salió el valor. `null` = no hay valor todavía. */
export type Procedencia = 'poliza' | 'volcado' | 'catastro' | 'ficha' | 'supuesto' | 'corregido' | null

export const PROCEDENCIAS: Record<Exclude<Procedencia, null>, string> = {
  poliza: 'de la póliza',
  volcado: 'del volcado de 2026',
  catastro: 'del Catastro',
  ficha: 'de la ficha del cliente',
  supuesto: 'supuesto',
  corregido: 'lo has puesto tú',
}

/** Qué control pinta la pantalla para esa fila. */
export type Control = 'texto' | 'numero' | 'euros' | 'fecha' | 'opcion' | 'siNo' | 'siNoNoSe' | 'municipio'

export type Fila = {
  campo: keyof DatosHogar
  grupo: Grupo
  etiqueta: string
  /** El valor crudo, tal como viajará al vendor. */
  valor: unknown
  /** Ya formateado para leerlo: euros en español, m², el nombre de la opción. */
  legible: string
  procedencia: Procedencia
  /** El porqué del supuesto, entero. `null` si no es un supuesto. */
  porque: string | null
  /** El supuesto abarata el precio, así que el real puede subir. */
  optimista: boolean
  /** Motivo por el que falta. `null` si no falta. */
  falta: string | null
  editable: boolean
  control: Control
  /** Solo en los de tipo `opcion`: de qué catálogo se surte. */
  catalogo?: CatalogoPantalla
}

export type Resumen = {
  filas: Fila[]
  faltan: Fila[]
  supuestos: Fila[]
  /** Los supuestos que ABARATAN: si el cliente los desmiente, el precio sube. */
  optimistas: Fila[]
  listo: boolean
}

type Definicion = {
  campo: keyof DatosHogar
  grupo: Grupo
  etiqueta: string
  control: Control
  editable?: boolean
  /** Procedencia cuando el valor NO es un supuesto ni una corrección. */
  fuente?: 'ficha' | 'riesgo'
  /** Solo para el corredor: al cliente no se le enseña. */
  interno?: boolean
}

/**
 * El orden de la ficha es el orden en que se mira una casa: dónde está, cómo
 * es, qué la protege, cuánto vale, quién la asegura y desde cuándo.
 */
const DEFINICIONES: Definicion[] = [
  // ── Dónde está ──
  { campo: 'tipoViaId', grupo: 'donde', etiqueta: 'Tipo de vía', control: 'texto', fuente: 'riesgo' },
  { campo: 'nombreVia', grupo: 'donde', etiqueta: 'Calle', control: 'texto', fuente: 'riesgo' },
  { campo: 'numeroVia', grupo: 'donde', etiqueta: 'Número', control: 'texto', fuente: 'riesgo' },
  { campo: 'planta', grupo: 'donde', etiqueta: 'Planta', control: 'texto', fuente: 'riesgo' },
  { campo: 'puertaVivienda', grupo: 'donde', etiqueta: 'Puerta', control: 'texto', fuente: 'riesgo' },
  { campo: 'cp', grupo: 'donde', etiqueta: 'Código postal', control: 'texto', fuente: 'riesgo' },
  { campo: 'municipioId', grupo: 'donde', etiqueta: 'Municipio', control: 'municipio', fuente: 'riesgo' },
  { campo: 'referenciaCatastral', grupo: 'donde', etiqueta: 'Referencia catastral', control: 'texto', fuente: 'riesgo' },

  // ── Cómo es ──
  { campo: 'metrosCuadrados', grupo: 'como', etiqueta: 'Superficie', control: 'numero', fuente: 'riesgo' },
  { campo: 'anioConstruccion', grupo: 'como', etiqueta: 'Año de construcción', control: 'numero', fuente: 'riesgo' },
  { campo: 'habitaciones', grupo: 'como', etiqueta: 'Habitaciones', control: 'numero' },
  { campo: 'anioUltimaReforma', grupo: 'como', etiqueta: 'Año de la última reforma', control: 'numero' },
  { campo: 'tipoVivienda', grupo: 'como', etiqueta: 'Tipo de vivienda', control: 'opcion' },
  { campo: 'uso', grupo: 'como', etiqueta: 'Régimen (propietario o inquilino)', control: 'opcion' },
  { campo: 'ocupacion', grupo: 'como', etiqueta: 'Uso (habitual o segunda residencia)', control: 'opcion' },
  { campo: 'ubicacion', grupo: 'como', etiqueta: 'Ubicación', control: 'opcion' },
  { campo: 'material', grupo: 'como', etiqueta: 'Material de construcción', control: 'opcion' },
  { campo: 'calidad', grupo: 'como', etiqueta: 'Calidad de construcción', control: 'opcion' },
  { campo: 'asentamiento', grupo: 'como', etiqueta: 'Liquidación del siniestro', control: 'opcion' },

  // ── Protecciones ──
  { campo: 'puertaPrincipalBlindada', grupo: 'protecciones', etiqueta: 'Puerta principal blindada', control: 'siNo' },
  { campo: 'puertasSecundarias', grupo: 'protecciones', etiqueta: 'Puertas secundarias', control: 'opcion' },
  { campo: 'ventanasSeguras', grupo: 'protecciones', etiqueta: 'Ventanas con rejas o seguridad', control: 'siNo' },
  { campo: 'alarma', grupo: 'protecciones', etiqueta: 'Alarma', control: 'opcion' },
  { campo: 'urbanizacionCerrada', grupo: 'protecciones', etiqueta: 'Urbanización cerrada', control: 'siNo' },
  { campo: 'vigilante', grupo: 'protecciones', etiqueta: 'Vigilante de seguridad', control: 'siNoNoSe' },

  // ── Qué se asegura ──
  { campo: 'capitalContinente', grupo: 'capitales', etiqueta: 'Continente (la casa)', control: 'euros', fuente: 'riesgo' },
  { campo: 'capitalContenido', grupo: 'capitales', etiqueta: 'Contenido (lo de dentro)', control: 'euros', fuente: 'riesgo' },
  { campo: 'joyasEnCajaFuerte', grupo: 'capitales', etiqueta: 'Joyas en caja fuerte', control: 'euros' },
  { campo: 'joyasFueraDeCaja', grupo: 'capitales', etiqueta: 'Joyas fuera de caja fuerte', control: 'euros' },
  { campo: 'objetosDeValor', grupo: 'capitales', etiqueta: 'Objetos de valor', control: 'euros' },
  { campo: 'perrosPeligrosos', grupo: 'capitales', etiqueta: 'Perros potencialmente peligrosos', control: 'numero' },

  // ── El tomador ──
  { campo: 'nombre', grupo: 'tomador', etiqueta: 'Nombre', control: 'texto', fuente: 'ficha', editable: false },
  { campo: 'apellido1', grupo: 'tomador', etiqueta: 'Primer apellido', control: 'texto', fuente: 'ficha', editable: false },
  { campo: 'apellido2', grupo: 'tomador', etiqueta: 'Segundo apellido', control: 'texto', fuente: 'ficha', editable: false },
  { campo: 'dni', grupo: 'tomador', etiqueta: 'DNI', control: 'texto', fuente: 'ficha', editable: false, interno: true },
  { campo: 'fechaNacimiento', grupo: 'tomador', etiqueta: 'Fecha de nacimiento', control: 'fecha', fuente: 'ficha', editable: false, interno: true },
  { campo: 'telefono', grupo: 'tomador', etiqueta: 'Teléfono', control: 'texto', fuente: 'ficha', editable: false, interno: true },
  { campo: 'estadoCivil', grupo: 'tomador', etiqueta: 'Estado civil', control: 'opcion', fuente: 'ficha' },
  { campo: 'propietarioEsTomador', grupo: 'tomador', etiqueta: 'El tomador es el propietario', control: 'siNo' },

  // ── La cotización ──
  { campo: 'fechaEfecto', grupo: 'cotizacion', etiqueta: 'Precio con efecto', control: 'fecha' },
]

export type OpcionesResumen = {
  /** Los catálogos vivos, para traducir un id a su nombre. */
  catalogos?: Partial<Record<CatalogoPantalla, Opcion[]>>
  estadosCiviles?: Opcion[]
  municipios?: Opcion[]
  /** Campos que el corredor o el cliente han tocado a mano. */
  corregidos?: ReadonlySet<string>
  /** `cliente` recorta la procedencia y los porqués, y esconde lo interno. */
  nivel?: 'corredor' | 'cliente'
}

/**
 * Arma la ficha. No decide nada sobre el precio: solo cuenta lo que hay, lo que
 * se ha supuesto y lo que falta.
 */
export function resumen(pre: PrecalificacionHogar, opciones: OpcionesResumen = {}): Resumen {
  const nivel = opciones.nivel ?? 'corredor'
  const corregidos = opciones.corregidos ?? new Set<string>()
  const supuestoDe = new Map(pre.supuestos.map((s) => [s.campo as string, s]))
  const faltaDe = new Map(pre.faltan.map((f) => [f.campo as string, f.motivo]))
  const datos = pre.datos as Record<string, unknown>

  const filas: Fila[] = []
  for (const d of DEFINICIONES) {
    if (nivel === 'cliente' && d.interno) continue

    const valor = datos[d.campo] ?? null
    const supuesto = supuestoDe.get(d.campo)
    const falta = faltaDe.get(d.campo) ?? null

    // Ojo con el orden: un campo del RIESGO que además lleva una nota (por
    // ejemplo «esto sale del volcado de 2026») sigue siendo un dato real, no un
    // supuesto. La nota explica de dónde viene; no lo convierte en inventado.
    // Solo es supuesto de verdad lo que la precalificación se ha sacado de la
    // manga porque la ficha no lo tenía.
    let procedencia: Procedencia = null
    if (corregidos.has(d.campo)) procedencia = 'corregido'
    else if (valor !== null && valor !== undefined) {
      if (d.fuente === 'ficha') procedencia = 'ficha'
      else if (d.fuente === 'riesgo') procedencia = procedenciaDelRiesgo(pre) ?? (supuesto ? 'supuesto' : null)
      else procedencia = supuesto ? 'supuesto' : null
    }

    filas.push({
      campo: d.campo,
      grupo: d.grupo,
      etiqueta: d.etiqueta,
      valor,
      legible: legible(valor, d.control, d.campo, opciones),
      procedencia: nivel === 'cliente' && procedencia !== 'corregido' ? null : procedencia,
      porque: nivel === 'cliente' ? null : (supuesto?.porque ?? null),
      optimista: supuesto?.optimista === true,
      falta,
      editable: d.editable !== false,
      control: d.control,
      ...(d.control === 'opcion' && CATALOGO_DE_CAMPO[d.campo] ? { catalogo: CATALOGO_DE_CAMPO[d.campo] } : {}),
    })
  }

  // Los supuestos se cuentan por lo que dice la precalificación, no por cómo se
  // haya rotulado la fila: al cliente se le esconde el porqué, pero el aviso de
  // que el precio se apoya en supuestos tiene que seguir saliendo.
  return {
    filas,
    faltan: filas.filter((f) => f.falta !== null),
    supuestos: filas.filter((f) => supuestoDe.has(f.campo as string)),
    optimistas: filas.filter((f) => f.optimista),
    listo: pre.faltan.length === 0,
  }
}

/** `gemela` es jerga nuestra; en pantalla se dice «el volcado de 2026». */
function procedenciaDelRiesgo(pre: PrecalificacionHogar): Procedencia {
  if (pre.fuenteRiesgo === 'gemela') return 'volcado'
  if (pre.fuenteRiesgo === 'poliza') return 'poliza'
  if (pre.fuenteRiesgo === 'catastro') return 'catastro'
  return null
}

function legible(valor: unknown, control: Control, campo: string, o: OpcionesResumen): string {
  // El «no se sabe» va ANTES del guion: en un campo de tres estados, la
  // ausencia de valor es una respuesta, no un hueco.
  if (control === 'siNoNoSe') return typeof valor === 'boolean' ? (valor ? 'Sí' : 'No') : 'No se sabe'
  if (valor === null || valor === undefined || valor === '') return '—'
  switch (control) {
    case 'euros':
      return typeof valor === 'number' ? eur(valor) : String(valor)
    case 'numero':
      return campo === 'metrosCuadrados' ? `${valor} m²` : String(valor)
    case 'siNo':
      return valor === true ? 'Sí' : 'No'
    case 'municipio':
      return nombreDe(o.municipios, valor) ?? String(valor)
    case 'opcion': {
      if (campo === 'estadoCivil') return nombreDe(o.estadosCiviles, valor) ?? String(valor)
      const cat = CATALOGO_DE_CAMPO[campo]
      return nombreDe(cat ? o.catalogos?.[cat] : undefined, valor) ?? String(valor)
    }
    default:
      return String(valor)
  }
}

function nombreDe(lista: Opcion[] | undefined, valor: unknown): string | null {
  if (!lista) return null
  const encontrada = lista.find((op) => op.id === String(valor))
  return encontrada ? encontrada.nombre : null
}
