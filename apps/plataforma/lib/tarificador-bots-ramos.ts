// Registro de «Bots (gratis)» por ramo (14/10/2026). PURO: sin red ni envs, importable desde 'use client' y desde tests.
// Cada ramo con bot RPA aporta un ADAPTADOR: cómo pasar lo que sabe su cotizador (el formulario) al `riesgo` que valida
// asegura. Las compañías NO se listan aquí: salen de `/api/correduria/tarificador/integraciones` (una compañía nueva con bot
// en ese ramo aparece sola). Un ramo nuevo = un adaptador en `ADAPTADORES`; sin adaptador el bloque dice «Sin bots para este
// ramo todavía» y no pinta botones.
//
// 🚨 TARIFICAR ≠ EMITIR: solo precio. Los avisos dicen QUÉ falta, jamás el valor (dato personal).
import { faltaCompaniaAnterior, MAX_COMPANIA_ANTERIOR } from '@central/module-tarificacion'
import { formularioBotMoto, historialBot, type CampoDeFicha, type EntradaBotMoto } from './tarificador-moto-formulario.ts'
import { formularioBotAuto, OPCIONES_AMBITO_CIRCULACION, OPCIONES_CLASE_PERMISO, OPCIONES_USO_VEHICULO, type EntradaBotAuto } from './tarificador-auto-formulario.ts'

/** Un dato que el formulario del cotizador no tiene y la persona completa en el bloque (p. ej. la cilindrada de moto). */
export type CampoExtraBot = {
  clave: string; etiqueta: string; ayuda?: string; placeholder?: string
  /** Con `opciones` el campo es un desplegable (valor cerrado) y `porDefecto` es lo que muestra mientras no se toque. */
  opciones?: readonly { valor: string; etiqueta: string }[]
  porDefecto?: string
  /** Texto libre (no numérico): sin `opciones`, el campo es numérico salvo que lleve `texto`. `maxLength` limita lo tecleado. */
  texto?: boolean
  maxLength?: number
}

export type ResultadoAdaptadorBot =
  | { ok: true; riesgo: Record<string, unknown>; completarDesdeFicha: CampoDeFicha[] }
  | { ok: false; faltan: string[] }

export type AdaptadorBot = {
  ramo: string
  /** Campos que se completan en el propio bloque (vacío si el formulario ya lo trae todo). */
  campos: readonly CampoExtraBot[]
  /** Formulario del cotizador del ramo + campos extra → riesgo, o QUÉ falta. */
  construir: (formulario: unknown, extra: Record<string, string>) => ResultadoAdaptadorBot
  /**
   * Dato que falta SOLO para esa compañía (p. ej. Mapfre pide la compañía anterior), en castellano y sin valores; `null` =
   * nada que decir (o no se sabe). Se enseña bajo el botón de esa compañía y lo deja sin encolar.
   */
  faltaPorCompania?: (formulario: unknown, extra: Record<string, string>, compania: string) => string | null
}

/** Lo que el cotizador de moto le da al bloque (todo de `EntradaBotMoto` salvo la cilindrada, que se completa aquí). */
export type FormularioBotsMoto = Omit<EntradaBotMoto, 'cilindrada'>

const adaptadorMoto: AdaptadorBot = {
  ramo: 'moto',
  campos: [{ clave: 'cilindrada', etiqueta: 'Cilindrada (cc)', ayuda: 'el bot separa Moto y Ciclomotor', placeholder: 'p. ej. 125' }],
  construir: (formulario, extra) => {
    const r = formularioBotMoto({ ...(formulario as FormularioBotsMoto), cilindrada: extra.cilindrada ?? '' })
    return r.ok ? { ok: true, riesgo: r.riesgo, completarDesdeFicha: r.completarDesdeFicha } : { ok: false, faltan: r.faltan }
  },
}

/** Lo que el cotizador de coche le da al bloque (14/10/2026): todo; no hay campos extra (Mapfre confirma el coche por matrícula). */
export type FormularioBotsAuto = EntradaBotAuto

const adaptadorAuto: AdaptadorBot = {
  ramo: 'auto',
  // Mat-select del paso 2 de Mapfre (14/10/2026): el corredor puede cambiarlos antes de pedir precio. Defecto de coche.
  campos: [
    { clave: 'usoVehiculo', etiqueta: 'Uso del vehículo', opciones: OPCIONES_USO_VEHICULO, porDefecto: 'particular' },
    { clave: 'ambitoCirculacion', etiqueta: 'Ámbito de circulación', opciones: OPCIONES_AMBITO_CIRCULACION, porDefecto: 'espana' },
    { clave: 'clasePermiso', etiqueta: 'Clase del permiso del conductor', opciones: OPCIONES_CLASE_PERMISO, porDefecto: 'b' },
    // Mapfre la pide en «Figuras» si hubo seguro anterior (el riesgo guarda el código DGS, no el nombre): se teclea aquí.
    { clave: 'companiaAnterior', etiqueta: 'Compañía anterior', ayuda: 'obligatoria en Mapfre si tuvo seguro anterior', placeholder: 'p. ej. Línea Directa', texto: true, maxLength: MAX_COMPANIA_ANTERIOR },
  ],
  construir: (formulario, extra) => {
    const r = formularioBotAuto(entradaAuto(formulario, extra))
    return r.ok ? { ok: true, riesgo: r.riesgo, completarDesdeFicha: r.completarDesdeFicha } : { ok: false, faltan: r.faltan }
  },
  faltaPorCompania: (formulario, extra, compania) => {
    const e = entradaAuto(formulario, extra)
    // Solo con seguro actual declarado cuentan los años (`historialBot` da `null` sin él: «no se sabe», otra regla lo dirá).
    const falta = faltaCompaniaAnterior(compania, 'auto', historialBot(e).aniosAseguradoAnterior, e.companiaAnterior)
    return falta ? `Falta ${falta}. Indícala en «Compañía anterior».` : null
  },
}

/** Formulario del cotizador + campos extra → entrada del adaptador. Un campo extra TOCADO (aunque vacío) manda sobre el del riesgo. */
function entradaAuto(formulario: unknown, extra: Record<string, string>): EntradaBotAuto {
  const f = formulario as FormularioBotsAuto
  return {
    ...f, usoVehiculo: extra.usoVehiculo, ambitoCirculacion: extra.ambitoCirculacion, clasePermiso: extra.clasePermiso,
    companiaAnterior: extra.companiaAnterior !== undefined ? extra.companiaAnterior : f.companiaAnterior,
  }
}

const ADAPTADORES: Readonly<Record<string, AdaptadorBot>> = { moto: adaptadorMoto, auto: adaptadorAuto }

/** Adaptador del ramo, o `null` si ese ramo aún no tiene bots (ramo ausente, desconocido o de otro tipo → `null`). */
export function adaptadorDeRamo(ramo: string | null | undefined): AdaptadorBot | null {
  return typeof ramo === 'string' && Object.hasOwn(ADAPTADORES, ramo) ? ADAPTADORES[ramo]! : null
}

/** Ramos con adaptador (para saber qué anfitrión monta el bloque). */
export function ramosConBots(): string[] {
  return Object.keys(ADAPTADORES)
}
