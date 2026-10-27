// «Bots (gratis)» de HOGAR (19/10/2026) — lo PURO: de los datos de la vivienda de la oportunidad (`info_riesgo.datosVivienda`) y de
// las elecciones del corredor al `riesgo` de hogar que valida asegura (`ramo: 'hogar'`, sin tomador). Mismo patrón que moto y coche
// (`tarificador-moto-formulario.ts`, `tarificador-auto-formulario.ts`): sin red ni envs, importable desde 'use client' y desde tests.
//
// 🚨 TARIFICAR ≠ EMITIR: solo precio. 🚨 Tres estados: `null`/'' = «no consta» o «no contestado»; nunca un valor por defecto.
// USO, RÉGIMEN, TIPO de vivienda y MADERA deciden la tarifa de Allianz: los elige una persona EXPLÍCITAMENTE. Se precargan solo
// si el dato guardado casa EXACTAMENTE con una opción (`claveHogarDeCatalogo`); si no, "Elegir…" y el botón no encola.
// 🚨 Datos personales: el DNI/NIE y el nacimiento del tomador NO están aquí ni viajan desde plataforma; asegura los lee de la ficha
// al encolar y los inyecta al entregar el trabajo. Los avisos dicen QUÉ falta, jamás el valor.
import {
  type DatosViviendaBot, type EleccionesHogar, type EntradaBotHogar, type FormularioBotHogar, type RiesgoParaBotsHogar, type CatalogosHogarLeidos,
  formularioBotHogar, datosViviendaParaBot, eleccionesInicialesHogar,
} from '@central/module-tarificacion'
// Constructor movido a `@central/module-tarificacion` (27/10/2026) para que asegura («Probar») use el MISMO que este botón.
export { formularioBotHogar, datosViviendaParaBot, eleccionesInicialesHogar }
export type { DatosViviendaBot, EleccionesHogar, EntradaBotHogar, FormularioBotHogar, RiesgoParaBotsHogar, CatalogosHogarLeidos }

/** Opciones del bloque (etiqueta para la persona, clave cerrada para el bot). La primera, vacía, es «sin elegir». */
const ELEGIR = { valor: '', etiqueta: 'Elegir…' } as const
export const OPCIONES_USO_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'habitual', etiqueta: 'Vivienda habitual' }, { valor: 'secundaria', etiqueta: 'Segunda residencia' },
  { valor: 'alquiler', etiqueta: 'Alquiler' }, { valor: 'turistico', etiqueta: 'Turístico o vacacional' },
]
export const OPCIONES_REGIMEN_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'propietario', etiqueta: 'Propietario' }, { valor: 'inquilino', etiqueta: 'Inquilino' },
]
export const OPCIONES_TIPO_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'piso', etiqueta: 'Piso' }, { valor: 'planta_baja', etiqueta: 'Planta baja (o piso con ventanas a menos de 3 m del suelo)' },
  { valor: 'atico', etiqueta: 'Ático' }, { valor: 'adosada', etiqueta: 'Vivienda adosada' }, { valor: 'independiente', etiqueta: 'Vivienda independiente' },
]
export const OPCIONES_MADERA_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'no', etiqueta: 'Sin madera' }, { valor: 'si', etiqueta: 'Con madera' },
]


/**
 * Los campos de `datosVivienda` (module-seguros, `CAMPOS_VIVIENDA`) que lee el bot de hogar. UNA sola fuente de verdad: el bot no
 * guarda la vivienda en otro sitio; un test comprueba que todos existen en `CAMPOS_VIVIENDA` (renombrar uno allí lo pone en rojo).
 */
export const CAMPOS_VIVIENDA_DEL_BOT = [
  'cp', 'municipio', 'nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'anioConstruccion', 'anioUltimaReforma', 'metrosCuadrados',
  'referenciaCatastral', 'capitalContinente', 'capitalContenido', 'puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada',
  'vigilante', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'tipoVivienda', 'uso', 'ocupacion', 'conMadera',
] as const

/** Id de la ficha del tomador (la figura `tomador`; sin ella, el cliente de la oportunidad). */
export function tomadorDeRiesgoHogar(r: RiesgoParaBotsHogar & { oportunidad: { clienteId: string } }): string {
  return r.figuras.find((f) => f.rol === 'tomador')?.clienteId ?? r.oportunidad.clienteId
}

/**
 * Lo que a la FICHA del tomador le falta para que asegura pueda entregar al bot su DNI/NIE y su nacimiento (lo comprueba al encolar:
 * 422 `falta_datos_tomador`, sin gastar máquina). `null` = no se pudo leer la ficha (no se afirma que falte). PURA.
 */
export function faltanFichaTomadorParaHogar(r: Pick<RiesgoParaBotsHogar, 'figuras'>): string[] | null {
  const t = r.figuras.find((f) => f.rol === 'tomador') ?? null
  if (!t || t.faltan == null) return null
  if (t.empresa) return ['una persona física con DNI/NIE (el hogar de Allianz no admite empresas)']
  const k = new Set(t.faltan)
  const out: string[] = []
  if (k.has('dni')) out.push('el DNI/NIE')
  if (k.has('fechaNacimiento') || k.has('fechaNacimiento_invalida')) out.push('la fecha de nacimiento')
  return out
}

/**
 * «Falta el DNI/NIE y la fecha de nacimiento en la ficha del tomador…» o `null` si no falta nada (o no se sabe). `bot` = el nombre
 * del bot que los pide (21/10/2026: también Mapfre Hogar, que los toma igual de la ficha). PURA.
 */
export function avisoFichaTomadorParaHogar(faltan: readonly string[] | null, bot = 'Allianz Hogar'): string | null {
  if (!faltan || faltan.length === 0) return null
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`
  return `Falta ${lista} en la ficha del tomador: ${bot} los pide en su primera pantalla y los toma de la ficha. Complétalo en la ficha.`
}

/**
 * Riesgo de hogar para encolar sin datos del tomador (19/10/2026): quita `tomador` y cualquier dni/nif/nie/documento/nacimiento
 * (en cualquier nivel) que el navegador haya mandado. El DNI y el nacimiento los lee asegura de la ficha. No muta la entrada.
 */
export function riesgoHogarSinTomador(riesgo: Record<string, unknown>): Record<string, unknown> {
  // 21/10/2026: también `datosTomador` (nombre y apellidos de Mapfre Hogar: los pone asegura desde la ficha, nunca plataforma).
  const PROHIBIDA = /^(tomador|datostomador|dni|nif|nie|documento(identidad)?|fechanacimiento|nacimiento)$/i
  const limpiar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(limpiar)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !PROHIBIDA.test(k)).map(([k, x]) => [k, limpiar(x)]))
    }
    return v
  }
  return limpiar(riesgo) as Record<string, unknown>
}
