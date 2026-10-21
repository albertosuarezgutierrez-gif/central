// Pendientes del presupuesto de MOTOR por BLOQUE (20/10/2026): personas · riesgo · poliza. PURO: sin red ni envs, importable desde
// 'use client'. Cada bloque de la pantalla muestra SOLO lo que falta o hay que confirmar: la UNIÓN (sin repetir clave) de lo que
// piden todas las compañías activas. La fuente de qué pide cada bot es `checklistBot` (tarificador-bots-ramos.ts) →
// `checklistCompania` (tarificador-checklist.ts) → `obligatoriosPara` de `@central/module-tarificacion`; aquí solo se reagrupa.
//
// 🚨 Sin datos personales: claves, etiquetas y compañías, jamás valores. 🚨 Lo que viene de la ficha NO es pendiente (estado
// `ficha`: «se toma de la ficha», nunca se pinta su valor). 🚨 Lo SUPUESTO es para confirmar: nunca cuenta como «listo».
// 🚨 Compañía sin declaración = `no_disponible`, nunca «listo». La compañía anterior solo aparece si `aplica` (años asegurado > 0).
import type { BloqueObligatorio } from '@central/module-tarificacion'
import { obligatoriosPara } from '@central/module-tarificacion'
import { checklistBot, type AdaptadorBot } from './tarificador-bots-ramos.ts'
import { BLOQUE_REGLA_PREVIA } from './tarificador-reglas-previas.ts'

export type EstadoPendiente = 'falta' | 'supuesto' | 'ficha'

export type Pendiente = {
  clave: string
  etiqueta: string
  bloque: BloqueObligatorio
  /** El más urgente entre las compañías: falta > supuesto > ficha. */
  estado: EstadoPendiente
  /** Compañías (en el orden recibido) que piden este dato y aún no lo tienen como dato del riesgo. */
  companias: string[]
  /** Clave del campo suelto del adaptador (`adaptador.campos`) donde se completa, si lo hay (p. ej. `cilindrada`). */
  campoExtra?: string
}

/** Chip por compañía. `listo` solo si está evaluada y NO queda nada que pedir ni confirmar (lo de la ficha no cuenta). */
export type ResumenCompania = {
  compania: string
  estado: 'listo' | 'faltan' | 'no_disponible'
  /** Datos por pedir + por confirmar (`falta` + `supuesto`). 0 en `listo` y en `no_disponible`. */
  faltan: number
  /** De `faltan`, cuántos son solo supuestos a confirmar. */
  supuestos: number
}

export type PendientesPorBloque = {
  bloques: Record<BloqueObligatorio, Pendiente[]>
  companias: ResumenCompania[]
  /** Datos generales que impiden construir el riesgo (el formulario aún no vale); sin ellos ninguna compañía se evalúa. */
  generales: string[]
  /**
   * ¿Se sabe de verdad qué piden los bots? `false` con datos generales por completar (el riesgo no se construye y ninguna compañía
   * se evalúa) o si NINGUNA compañía está evaluada (todas `no_disponible`): entonces «no hay pendientes» NO significa «listo»
   * (dato no evaluado ≠ listo) y ningún bloque se declara listo ni se pliega.
   */
  evaluado: boolean
}

export type EntradaPendientes = {
  adaptador: AdaptadorBot
  /** El formulario del cotizador del ramo (el mismo que recibe `checklistBot`). */
  formulario: unknown
  /** Campos sueltos del bloque de bots (cilindrada, sexo, compañía anterior…). */
  extra: Record<string, string>
  /** Compañías ACTIVAS con bot en este ramo. */
  companias: readonly string[]
}

/** Clave del obligatorio → campo suelto del adaptador donde se completa (si el adaptador lo tiene). */
const CAMPO_EXTRA_DE_CLAVE: Readonly<Record<string, string>> = {
  'seleccionVehiculo.cilindradaCc': 'cilindrada',
  'conductor.sexo': 'sexo',
  companiaAnterior: 'companiaAnterior',
  fechaAdquisicion: 'fechaAdquisicion',
  polizaAnteriorUltimos5: 'polizaAnteriorUltimos5',
  fotocopiaAnterior: 'fotocopiaAnterior',
}

const PESO: Record<EstadoPendiente, number> = { ficha: 1, supuesto: 2, falta: 3 }

/**
 * Pendientes por bloque + chips por compañía. PURA.
 * Las filas `ok` no son pendientes; `ficha` se lista (para decir «de la ficha») pero no cuenta en `faltan`.
 */
export function pendientesPorBloque(entrada: EntradaPendientes): PendientesPorBloque {
  const { adaptador, formulario, extra } = entrada
  const bloques: Record<BloqueObligatorio, Pendiente[]> = { personas: [], riesgo: [], poliza: [] }
  const porClave = new Map<string, Pendiente>()
  const companias: ResumenCompania[] = []
  const construido = adaptador.construir(formulario, extra)
  const generales = construido.ok ? [] : construido.faltan

  for (const compania of [...new Set(entrada.companias)]) {
    const c = checklistBot(adaptador, formulario, extra, compania)
    if (c.estado === 'no_disponible') { companias.push({ compania, estado: 'no_disponible', faltan: 0, supuestos: 0 }); continue }
    if (c.estado === 'sin_formulario') { companias.push({ compania, estado: 'faltan', faltan: Math.max(1, generales.length), supuestos: 0 }); continue }
    const bloqueDe = new Map((obligatoriosPara(compania, adaptador.ramo) ?? []).map((o) => [o.clave, o.bloque]))
    let faltan = 0
    let supuestos = 0
    for (const fila of c.filas) {
      if (fila.estado === 'ok') continue
      if (fila.estado === 'falta') faltan++
      if (fila.estado === 'supuesto') { faltan++; supuestos++ }
      const estado: EstadoPendiente = fila.estado
      const previo = porClave.get(fila.clave)
      if (previo) {
        if (PESO[estado] > PESO[previo.estado]) previo.estado = estado
        if (!previo.companias.includes(compania)) previo.companias.push(compania)
        continue
      }
      // `bloqueDe` siempre lo trae (el cepo de obligatorios.test.ts exige bloque a todo campo declarado).
      const bloque = bloqueDe.get(fila.clave) ?? BLOQUE_REGLA_PREVIA[fila.clave] ?? 'riesgo'
      const campoExtra = CAMPO_EXTRA_DE_CLAVE[fila.clave]
      const p: Pendiente = { clave: fila.clave, etiqueta: fila.etiqueta, bloque, estado, companias: [compania] }
      if (campoExtra && adaptador.campos.some((x) => x.clave === campoExtra)) p.campoExtra = campoExtra
      porClave.set(fila.clave, p)
      bloques[bloque].push(p)
    }
    companias.push({ compania, estado: faltan > 0 ? 'faltan' : 'listo', faltan, supuestos })
  }
  const evaluado = generales.length === 0 && companias.some((c) => c.estado !== 'no_disponible')
  return { bloques, companias, generales, evaluado }
}
