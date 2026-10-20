// Presentación de los pendientes del presupuesto de MOTOR (20/10/2026). PURO: sin red ni DOM, importable desde 'use client'.
// Texto de los chips por compañía, qué se pinta arriba de cada bloque (Personas · Riesgo · Póliza), qué se pliega y cómo se
// dice un error de guardado. Los datos vienen de `pendientesPorBloque` (tarificador-pendientes.ts).
//
// 🚨 Sin datos personales: solo etiquetas y compañías. Lo de la ficha se dice («se toma de la ficha»), nunca se pinta su valor.
// 🚨 Lo SUPUESTO es para confirmar: cuenta como pendiente en el chip. Lo de la ficha NO cuenta.
import type { BloqueObligatorio } from '@central/module-tarificacion'
import type { AdaptadorBot } from './tarificador-bots-ramos.ts'
import type { EstadoPendiente, Pendiente, PendientesPorBloque, ResumenCompania } from './tarificador-pendientes.ts'

export const BLOQUES_VISTA: readonly BloqueObligatorio[] = ['personas', 'riesgo', 'poliza']

export const ROTULO_BLOQUE: Readonly<Record<BloqueObligatorio, string>> = {
  personas: 'Personas',
  riesgo: 'Riesgo',
  poliza: 'Póliza actual y bonificaciones',
}

/** Id del DOM del bloque (ancla de los chips y de «completar abajo»). */
export function idBloqueMotor(bloque: BloqueObligatorio): string {
  return `motor-bloque-${bloque}`
}

const ROTULO_ESTADO: Readonly<Record<EstadoPendiente, string>> = {
  falta: 'Falta',
  supuesto: 'Confirmar',
  ficha: 'Se toma de la ficha',
}
export function rotuloEstadoPendiente(e: EstadoPendiente): string {
  return ROTULO_ESTADO[e]
}

/** Texto del chip de una compañía: «Allianz listo» · «Mapfre faltan 2» · «Generali no disponible». `nombre` ya rotulado. */
export function textoChip(r: ResumenCompania, nombre: string, bloqueo?: string | null): string {
  // Sin nada por pedir, pero su bot no puede encolar con esta ficha (p. ej. falta el nombre del tomador): NO es «listo».
  if (r.estado === 'listo') return bloqueo ? `${nombre} bloqueada` : `${nombre} listo`
  if (r.estado === 'no_disponible') return `${nombre} no disponible`
  return `${nombre} ${r.faltan === 1 ? 'falta' : 'faltan'} ${r.faltan}`
}

/** `title` del chip: qué le falta (etiquetas, nunca valores) y qué hay que confirmar. */
export function tituloChip(r: ResumenCompania, pendientes: PendientesPorBloque, nombre: string, bloqueo?: string | null): string {
  const base = tituloChipBase(r, pendientes, nombre)
  return bloqueo && r.estado !== 'no_disponible' ? `${base} ${bloqueo}`.trim() : base
}

function tituloChipBase(r: ResumenCompania, pendientes: PendientesPorBloque, nombre: string): string {
  if (r.estado === 'listo') return `${nombre}: no queda nada por pedir ni confirmar de los datos del presupuesto.`
  if (r.estado === 'no_disponible') return `${nombre}: aún no se sabe qué datos pide: no se puede asegurar que tenga todo.`
  const suyos = BLOQUES_VISTA.flatMap((b) => pendientes.bloques[b]).filter((p) => p.estado !== 'ficha' && p.companias.includes(r.compania))
  if (suyos.length === 0) return `${nombre}: faltan datos generales del formulario (mira el aviso de arriba).`
  const faltan = suyos.filter((p) => p.estado === 'falta').map((p) => p.etiqueta)
  const confirmar = suyos.filter((p) => p.estado === 'supuesto').map((p) => p.etiqueta)
  return [faltan.length ? `${nombre}: falta ${faltan.join(', ')}.` : `${nombre}:`, confirmar.length ? `Confirmar: ${confirmar.join(', ')}.` : ''].filter(Boolean).join(' ')
}

/** Bloque al que lleva el chip: el primero (personas > riesgo > póliza) con algo por pedir/confirmar de esa compañía. */
export function bloqueDeChip(r: ResumenCompania, pendientes: PendientesPorBloque): BloqueObligatorio | null {
  if (r.estado !== 'faltan') return null
  return BLOQUES_VISTA.find((b) => pendientes.bloques[b].some((p) => p.estado !== 'ficha' && p.companias.includes(r.compania))) ?? null
}

export type VistaBloque = {
  /** Por pedir (`falta`) y por confirmar (`supuesto`): se editan arriba. */
  aEditar: Pendiente[]
  /** Lo que la compañía toma de la ficha: solo se nombra. */
  deLaFicha: Pendiente[]
  /** ¿Hay algo que hacer en este bloque? */
  hayPendiente: boolean
  /** Lo completo va plegado SIEMPRE que se sabe qué falta (con o sin pendientes): arriba solo lo pendiente. */
  plegarCompleto: boolean
  /** Insignia del encabezado: «2 por completar» · «1 por confirmar» · «Todo listo». */
  resumen: string
}

/** Qué pinta un bloque. `pendientes === null` = aún no se sabe qué falta: NO se pliega nada (se ve el bloque entero, como antes). */
export function vistaBloque(pendientes: readonly Pendiente[] | null): VistaBloque {
  if (pendientes === null) return { aEditar: [], deLaFicha: [], hayPendiente: false, plegarCompleto: false, resumen: '' }
  const aEditar = pendientes.filter((p) => p.estado !== 'ficha')
  const deLaFicha = pendientes.filter((p) => p.estado === 'ficha')
  const faltan = aEditar.filter((p) => p.estado === 'falta').length
  const confirmar = aEditar.length - faltan
  const partes = [faltan ? `${faltan} por completar` : '', confirmar ? `${confirmar} por confirmar` : ''].filter(Boolean)
  return { aEditar, deLaFicha, hayPendiente: aEditar.length > 0, plegarCompleto: true, resumen: partes.length ? partes.join(' · ') : 'Todo listo' }
}

/** Rótulo del desplegable de lo completo: «Personas · completo». */
export function rotuloCompleto(bloque: BloqueObligatorio): string {
  return `${ROTULO_BLOQUE[bloque]} · completo`
}

const SENSIBLE = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // correo
  /\b[A-Z]{2}\d{2}[ ]?(?:\d{4}[ ]?){2,6}\d{0,4}\b/gi, // IBAN
  /\b[XYZ]?\d{7,8}[ -]?[A-Z]\b/gi, // DNI / NIE
  /\b\d[\d .-]{7,}\d\b/g, // teléfonos y números largos
]

/**
 * Texto de un guardado fallido para mostrarlo: el del servidor (`motivo`/`mensaje`/`error`) saneado (sin correos, DNI/NIE, IBAN ni
 * números largos, una sola línea, ≤160 caracteres) o, sin texto utilizable, uno por estado. NUNCA dice que se guardó. PURA.
 */
export function textoErrorGuardado(status: number, json: unknown): string {
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
  const crudo = [o.motivo, o.mensaje, o.error].find((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (crudo) {
    let t = crudo.replace(/\s+/g, ' ').trim()
    for (const re of SENSIBLE) t = t.replace(re, '…')
    if (t.length > 160) t = `${t.slice(0, 157).trimEnd()}…`
    return t
  }
  if (status === 422) return 'El servidor lo rechaza porque no cuadra con lo ya guardado de esta oportunidad.'
  if (status === 0 || status >= 500) return 'No se ha podido conectar para guardarlo.'
  return 'El servidor no lo ha aceptado.'
}

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Con el formulario aún incompleto, `pendientesPorBloque` no evalúa compañías y solo trae `generales` (textos libres del adaptador,
 * p. ej. «Cilindrada en cc (…)»). Cada general que EMPIEZA por la clave de un campo suelto del adaptador se vuelve un pendiente
 * `falta` de ESE campo, en el bloque del campo (para pedirlo ahí, editable); lo demás (matrícula, marca…) queda en `sueltos`. PURA.
 */
export function pendientesConGenerales(base: PendientesPorBloque, adaptador: AdaptadorBot): { pendientes: PendientesPorBloque; sueltos: string[] } {
  const bloques = { personas: [...base.bloques.personas], riesgo: [...base.bloques.riesgo], poliza: [...base.bloques.poliza] }
  const sueltos: string[] = []
  for (const g of base.generales) {
    const n = norm(g)
    const campo = adaptador.campos.find((c) => n.startsWith(norm(c.clave)) || n.startsWith(norm(c.etiqueta.replace(/\(.*?\)/g, ''))))
    if (!campo) { sueltos.push(g); continue }
    if (BLOQUES_VISTA.some((b) => bloques[b].some((x) => x.campoExtra === campo.clave))) continue
    bloques[campo.bloque].push({ clave: `general.${campo.clave}`, etiqueta: campo.etiqueta, bloque: campo.bloque, estado: 'falta', companias: [], campoExtra: campo.clave })
  }
  return { pendientes: { ...base, bloques }, sueltos }
}
