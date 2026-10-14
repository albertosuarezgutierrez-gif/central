// Registro de «Bots (gratis)» por ramo (14/10/2026). PURO: sin red ni envs, importable desde 'use client' y desde tests.
// Cada ramo con bot RPA aporta un ADAPTADOR: cómo pasar lo que sabe su cotizador (el formulario) al `riesgo` que valida
// asegura. Las compañías NO se listan aquí: salen de `/api/correduria/tarificador/integraciones` (una compañía nueva con bot
// en ese ramo aparece sola). Un ramo nuevo = un adaptador en `ADAPTADORES`; sin adaptador el bloque dice «Sin bots para este
// ramo todavía» y no pinta botones.
//
// 🚨 TARIFICAR ≠ EMITIR: solo precio. Los avisos dicen QUÉ falta, jamás el valor (dato personal).
import { formularioBotMoto, type CampoDeFicha, type EntradaBotMoto } from './tarificador-moto-formulario.ts'
import { formularioBotAuto, type EntradaBotAuto } from './tarificador-auto-formulario.ts'

/** Un dato que el formulario del cotizador no tiene y la persona completa en el bloque (p. ej. la cilindrada de moto). */
export type CampoExtraBot = { clave: string; etiqueta: string; ayuda?: string; placeholder?: string }

export type ResultadoAdaptadorBot =
  | { ok: true; riesgo: Record<string, unknown>; completarDesdeFicha: CampoDeFicha[] }
  | { ok: false; faltan: string[] }

export type AdaptadorBot = {
  ramo: string
  /** Campos que se completan en el propio bloque (vacío si el formulario ya lo trae todo). */
  campos: readonly CampoExtraBot[]
  /** Formulario del cotizador del ramo + campos extra → riesgo, o QUÉ falta. */
  construir: (formulario: unknown, extra: Record<string, string>) => ResultadoAdaptadorBot
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
  campos: [],
  construir: (formulario) => {
    const r = formularioBotAuto(formulario as FormularioBotsAuto)
    return r.ok ? { ok: true, riesgo: r.riesgo, completarDesdeFicha: r.completarDesdeFicha } : { ok: false, faltan: r.faltan }
  },
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
