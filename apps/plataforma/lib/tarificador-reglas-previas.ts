// Reglas PREVIAS al bot de motor (20/10/2026): lo que un portal exige (o no cotiza) y `obligatorios.ts` no declara, para que la ficha
// lo AVISE antes de lanzar y no el bot ya dentro del portal. PURO: sin red ni envs, importable desde 'use client'. Cada regla es una
// función pura con su test; `reglasPrevias` las reúne por compañía × ramo y `checklistBot` (tarificador-bots-ramos.ts) las añade al
// checklist como filas `falta` (así llegan solas a los pendientes por bloque, los chips y el bloqueo del botón).
//
// Por qué aquí y no en `obligatorios.ts` de module-tarificacion: ese fichero también lo evalúa el worker y asegura al encolar; declarar
// de más rechazaría trabajos que hoy corren (leads de Telegram, Mapfre solo exige el nº de póliza SI el portal lo marca). Estas reglas
// viven en la ficha, que es donde se avisa.
//
// 🚨 Sin datos personales: etiquetas con números sueltos (edad, mínimo), jamás fechas ni valores. 🚨 Dato que no se sabe ≠ dato que
// falta: una fecha «de la ficha» (la lee el servidor) NO se evalúa aquí; solo las fechas que el formulario ya trae.
import type { BloqueObligatorio } from '@central/module-tarificacion'
import { claveCompania, conAntecedentesFavorables, supuestosAuto } from '@central/module-tarificacion'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Una regla incumplida: se pinta como fila `falta` del checklist de esa compañía. */
export type ReglaPrevia = { clave: string; etiqueta: string; bloque: BloqueObligatorio }

/** Dónde se pinta cada clave de regla previa (los pendientes buscan el bloque en `obligatoriosPara`, que no las conoce). */
export const BLOQUE_REGLA_PREVIA: Readonly<Record<string, BloqueObligatorio>> = {
  'conductor.fechaCarne.edad': 'personas',
  documentoTomador: 'personas',
  'tomador.codigoPostal': 'personas',
  polizaAnteriorUltimos5: 'poliza',
  fechaMatriculacion: 'riesgo',
  'siniestrosUltimos5Anios.moto': 'poliza',
}

// ─── Edad y carné ───────────────────────────────────────────────────────────

function partes(iso: unknown): { y: number; m: number; d: number } | null {
  if (typeof iso !== 'string' || !ISO.test(iso.trim())) return null
  const t = iso.trim()
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)), d = Number(t.slice(8, 10))
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === t ? { y, m, d } : null
}

/**
 * Años cumplidos en `fecha` por quien nació en `nacimiento` (ISO). Quien nació un 29/02 cumple el 1/03 en los años no bisiestos
 * (el mismo criterio que el bot de Allianz, que compara `nacimiento + 18 años` como texto). Fecha inválida → `null`; puede salir
 * negativa si `fecha` es anterior al nacimiento. PURA.
 */
export function edadEnFecha(nacimiento: unknown, fecha: unknown): number | null {
  const n = partes(nacimiento)
  const f = partes(fecha)
  if (!n || !f) return null
  // Nacido el 29/02: en un año no bisiesto no existe ese día, así que el 28/02 aún no ha cumplido y el 1/03 sí (sale solo de comparar mes y día).
  const antes = f.m < n.m || (f.m === n.m && f.d < n.d)
  return f.y - n.y - (antes ? 1 : 0)
}

/** Edad mínima para sacarse el carné: 18 años; 16 con las clases A1 o AM (motos pequeñas). PURA. */
export function edadMinimaCarne(clasePermiso?: string | null): number {
  const c = (clasePermiso ?? '').trim().toLowerCase()
  return c === 'a1' || c === 'am' ? 16 : 18
}

/**
 * ¿El conductor era demasiado joven al sacarse el carné? Solo con las DOS fechas ISO reales; si falta una (o viene «de la ficha»),
 * `null`: no se sabe. Carné anterior al nacimiento → `null` (eso ya lo rechaza el validador de forma). PURA.
 */
export function carneDemasiadoJoven(a: { fechaNacimiento: unknown; fechaCarne: unknown; clasePermiso?: string | null }): { edad: number; minima: number } | null {
  const edad = edadEnFecha(a.fechaNacimiento, a.fechaCarne)
  if (edad === null || edad < 0) return null
  const minima = edadMinimaCarne(a.clasePermiso)
  return edad < minima ? { edad, minima } : null
}

/** Texto del aviso (solo la edad y el mínimo, nunca las fechas). PURA. */
export function etiquetaCarneJoven(c: { edad: number; minima: number }): string {
  return `fecha del carné: da ${c.edad} ${c.edad === 1 ? 'año' : 'años'} al sacarlo y el conductor debe tener ${c.minima} o más (revisa la fecha de carné y la de nacimiento)`
}

// ─── Reglas por compañía × ramo ────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const hay = (v: unknown): boolean => typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null

/** ¿Hubo seguro anterior? Años asegurado con el supuesto favorable aplicado: solo `0` años (o declarado sin seguro) es «no». PURA. */
export function huboSeguroAnterior(riesgo: Record<string, unknown>): boolean {
  const anios = conAntecedentesFavorables(riesgo).formulario.aniosAseguradoAnterior
  return typeof anios !== 'number' || anios > 0
}

/**
 * Huecos 1: Allianz Turismos (v0.6.11, `HUECO_POLIZA_ACTUAL`) pide las 5 últimas cifras de la póliza anterior cuando hubo seguro
 * anterior, solo con «ya lo tenía (cambio de seguro)»; Allianz Moto ya lo declara `obligatorios.ts`. Mapfre NO
 * (decisión 20/10/2026: su bot no escribe el dato y Mapfre moto ya cotizó sin él). PURA: `hoy` inyectado (la compra de Turismos depende de la fecha).
 */
export function reglaPolizaAnterior(compania: string, ramo: string, riesgo: Record<string, unknown>, hoy: Date): ReglaPrevia | null {
  const c = claveCompania(compania)
  const aplicaAllianz = c === 'allianz' && ramo === 'auto'
  if (!aplicaAllianz) return null
  if (!huboSeguroAnterior(riesgo)) return null
  if (supuestosAuto(riesgo as Parameters<typeof supuestosAuto>[0], hoy).compra.valor !== 'ya_lo_tenia') return null
  if (/^\d{5}$/.test(typeof riesgo.polizaAnteriorUltimos5 === 'string' ? riesgo.polizaAnteriorUltimos5.trim() : '')) return null
  return {
    clave: 'polizaAnteriorUltimos5',
    etiqueta: 'número de póliza anterior: últimas 5 cifras (Allianz Turismos lo pide si hubo seguro anterior)',
    bloque: 'poliza',
  }
}

/** Hueco 2: Generali auto exige la fecha de 1.ª matriculación (`generali/auto.ts`: sin ella, `datos`). Normalmente viene del vendor por matrícula. PURA. */
export function reglaMatriculacionGenerali(compania: string, ramo: string, riesgo: Record<string, unknown>): ReglaPrevia | null {
  if (claveCompania(compania) !== 'generali' || ramo !== 'auto') return null
  const f = typeof riesgo.fechaMatriculacion === 'string' ? riesgo.fechaMatriculacion.trim() : ''
  return partes(f) ? null : { clave: 'fechaMatriculacion', etiqueta: 'fecha de 1.ª matriculación del vehículo (Generali la exige; suele venir del vendor por matrícula)', bloque: 'riesgo' }
}

/** Qué de la ficha del TOMADOR sabemos que no está (de la precalificación de la ficha: claves `dni` y `cp`). `null` = no se pudo leer → no se afirma nada. PURA. */
export function tomadorSinEnFicha(faltan: readonly string[] | null | undefined): ('documento' | 'codigoPostal')[] | undefined {
  if (!faltan) return undefined
  const out: ('documento' | 'codigoPostal')[] = []
  if (faltan.includes('dni')) out.push('documento')
  if (faltan.includes('cp')) out.push('codigoPostal')
  return out.length ? out : undefined
}

/**
 * Hueco 4: Allianz Turismos teclea el documento y el CP + localidad del TOMADOR (`planDatosTurismos`). Los pone asegura desde la
 * ficha al entregar, así que solo se avisa cuando la precalificación ya sabe que la ficha NO los tiene y el riesgo tampoco. PURA.
 */
export function reglasTomadorAllianzTurismos(compania: string, ramo: string, riesgo: Record<string, unknown>, sinEnFicha: readonly string[] | undefined): ReglaPrevia[] {
  if (claveCompania(compania) !== 'allianz' || ramo !== 'auto' || !sinEnFicha?.length) return []
  const tomador = obj(riesgo.tomador)
  const ficha = obj(riesgo.fichaTomador)
  const out: ReglaPrevia[] = []
  if (sinEnFicha.includes('documento') && !hay(riesgo.documentoTomador) && !hay(tomador?.documentoIdentidad) && !hay(ficha?.documento)) {
    out.push({ clave: 'documentoTomador', etiqueta: 'NIF/CIF del tomador (Allianz Turismos lo teclea; la ficha del cliente no lo tiene)', bloque: 'personas' })
  }
  if (sinEnFicha.includes('codigoPostal') && !hay(tomador?.codigoPostal) && !hay(ficha?.codigoPostal)) {
    out.push({ clave: 'tomador.codigoPostal', etiqueta: 'CP y localidad del tomador (Allianz Turismos los teclea; la ficha del cliente no tiene el CP)', bloque: 'personas' })
  }
  return out
}

/** Hueco 3: carné con menos de 18 años (16 con A1/AM) en la fecha del carné. Todas las compañías de auto y moto. PURA. */
export function reglaCarne(ramo: string, riesgo: Record<string, unknown>): ReglaPrevia | null {
  if (ramo !== 'auto' && ramo !== 'moto') return null
  const conductor = obj(riesgo.conductor)
  const joven = carneDemasiadoJoven({
    fechaNacimiento: conductor?.fechaNacimiento,
    fechaCarne: conductor?.fechaCarne,
    clasePermiso: typeof riesgo.clasePermiso === 'string' ? riesgo.clasePermiso : null,
  })
  return joven ? { clave: 'conductor.fechaCarne.edad', etiqueta: etiquetaCarneJoven(joven), bloque: 'personas' } : null
}

/**
 * Hueco 7: moto con siniestros en 5 años > 0. Allianz Moto (`planDatosBasicosMoto`) y Mapfre moto sin bloque de historial
 * (`planFigurasSinHistorial`) paran con hueco de mapa: hoy no se cotizan automáticamente. PURA.
 */
export function reglaSiniestrosMoto(compania: string, ramo: string, riesgo: Record<string, unknown>): ReglaPrevia | null {
  const c = claveCompania(compania)
  if (ramo !== 'moto' || (c !== 'allianz' && c !== 'mapfre')) return null
  const s = riesgo.siniestrosUltimos5Anios
  if (typeof s !== 'number' || !(s > 0)) return null
  return {
    clave: 'siniestrosUltimos5Anios.moto',
    etiqueta: 'siniestros con culpa en 5 años: Allianz y Mapfre moto no los cotizan automáticamente hoy (el bot se detiene en el portal): se tarifica a mano',
    bloque: 'poliza',
  }
}

/** Todas las reglas previas de una compañía × ramo sobre el riesgo que construyó el adaptador. `formulario` aporta lo que no viaja en el riesgo. PURA. */
export function reglasPrevias(a: { compania: string; ramo: string; riesgo: Record<string, unknown>; formulario?: unknown; hoy?: Date }): ReglaPrevia[] {
  const hoy = a.hoy ?? new Date()
  const sinEnFicha = (obj(a.formulario)?.tomadorSinEnFicha as readonly string[] | undefined) ?? undefined
  return [
    reglaCarne(a.ramo, a.riesgo),
    ...reglasTomadorAllianzTurismos(a.compania, a.ramo, a.riesgo, Array.isArray(sinEnFicha) ? sinEnFicha : undefined),
    reglaPolizaAnterior(a.compania, a.ramo, a.riesgo, hoy),
    reglaMatriculacionGenerali(a.compania, a.ramo, a.riesgo),
    reglaSiniestrosMoto(a.compania, a.ramo, a.riesgo),
  ].filter((r): r is ReglaPrevia => r !== null)
}
