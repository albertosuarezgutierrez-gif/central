// Simulación de la sincronización CRM → Google Contacts (05/10/2026). Lógica PURA: con la MISMA
// entrada que el cron (`planificarSync`), dice qué PASARÍA, sin escribir nada. Alberto ya volcó
// la cartera a su agenda a mano (el .vcf de contactos-movil): en su Google hay clientes SIN
// nuestro externalId, FUERA de la etiqueta «Grupo ASegura», a veces duplicados entre sí.
//
// Desde el 05/10/2026 la sincronización ADOPTA esos contactos (`planificarSync`, fase de adopción):
// fuera de la etiqueta, mismo teléfono y (mismo nombre o sufijo «· AS …» del .vcf) → se vincula y
// se mete en la etiqueta; mismo teléfono y otro nombre, o varios contactos con ese número → a la
// cola, sin crear. Así que el informe es UN plan, el real: lo que hará la primera pasada.
//
// PII mínima: nombre (como quedará en Google, con su 🟢/🟡) y teléfono enmascarado salvo los 3
// últimos dígitos. Listas acotadas (`maxEjemplos`); los contadores son siempre los totales.

import { aE164 } from './telefono-e164.ts'
import {
  camposDeCrm, camposDeGoogle, excesoLimite, nombreEnGoogle, planificarSync, seleccionUnica,
  type EntradaPlan, type PersonaGoogle,
} from './google-contactos.ts'

export const MAX_EJEMPLOS_SIMULACION = 50

export type EjemploFicha = {
  clienteId: string
  /** Cómo quedará en Google: «🟢 Juan Pérez». */
  nombre: string
  telefono: string | null
  /** El contacto de la agenda que casa está FUERA de la etiqueta (se adoptará, o va a la cola). */
  fueraDeEtiqueta: boolean
  /** Conflicto de nombre: cómo está guardado en Google (sin el emoji). */
  nombreEnAgenda?: string
  /** Teléfono ambiguo: cuántos contactos de Google tienen ese número. */
  contactosConEseTelefono?: number
}
export type EjemploAgenda = { nombre: string; telefono: string | null }

export type Lista<T> = { total: number; ejemplos: T[] }

export type InformeSimulacion = {
  grupoExiste: boolean
  /** Contactos de Google leídos (sin los borrados). */
  contactosLeidos: number
  contactosEnEtiqueta: number
  /** Total de la cuenta según Google (`totalPeople`); `null` = Google no lo dijo. */
  totalCuenta: number | null
  /** Contactos que tendría la cuenta tras la primera pasada y si se pasaría del tope de 25.000. */
  contactosTras: number
  superaTope: boolean
  fichasCrm: number
  /** La selección vino a medias (alguna consulta falló): no se retiraría nada. */
  seleccionIncompleta: boolean
  /** Ficha nueva en Google y NADIE en la agenda con ese teléfono. */
  crear: Lista<EjemploFicha>
  /** En la etiqueta, mismo teléfono E.164 y mismo nombre (sin tildes/mayúsculas/emoji): se vincula. */
  vincular: Lista<EjemploFicha>
  /** FUERA de la etiqueta (volcado del .vcf): mismo teléfono y mismo nombre o sufijo «· AS …» → se ADOPTA. */
  adoptar: Lista<EjemploFicha>
  /** Mismo teléfono, OTRO nombre: a la cola, sin pisar ni crear (fuera de la etiqueta, probable contacto personal). */
  conflictosNombre: Lista<EjemploFicha>
  /** Varios contactos de Google (o varias fichas) con el mismo número. */
  ambiguos: Lista<EjemploFicha>
  /** Contactos de la agenda con teléfono pero NINGUNO E.164 válido (no se pueden emparejar). */
  telefonosNoNormalizables: Lista<EjemploAgenda>
  /** Números E.164 que tienen ya 2+ contactos en la agenda (duplicados previos a la sync). */
  telefonosRepetidosEnAgenda: number
  /** Lo que la primera pasada REAL hará, en cifras. */
  real: {
    crear: number
    vincular: number
    /** Contactos de fuera de la etiqueta que se adoptan (se vinculan y entran en ella). */
    adoptar: number
    actualizarVinculados: number
    aRevision: number
    propuestasLead: number
    retirar: number
    ilegibles: number
  }
  avisos: string[]
}

/** «•••••••233»: solo los 3 últimos dígitos. Con 3 o menos, todo oculto. */
export function enmascararTelefono(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '')
  if (d === '') return null
  if (d.length <= 3) return '•'.repeat(d.length)
  return '•'.repeat(d.length - 3) + d.slice(-3)
}

function nombreAgenda(p: PersonaGoogle): string {
  const c = camposDeGoogle(p)
  return `${c.nombre} ${c.apellidos}`.trim() || '(sin nombre)'
}

function lista<T>(xs: T[], max: number): Lista<T> {
  return { total: xs.length, ejemplos: xs.slice(0, max) }
}

const SIN_GRUPO = 'contactGroups/(aún-no-existe)'

/**
 * El informe. `e.grupoResourceName` = `null` si la etiqueta aún no existe en Google (la simulación
 * no la crea). `totalCuenta` = el `totalPeople` del listado completo.
 */
export function informeSimulacion(
  e: Omit<EntradaPlan, 'grupoResourceName' | 'modo'> & { grupoResourceName: string | null },
  opts: { totalCuenta: number | null; maxEjemplos?: number },
): InformeSimulacion {
  const max = opts.maxEjemplos ?? MAX_EJEMPLOS_SIMULACION
  const grupo = e.grupoResourceName ?? SIN_GRUPO
  const entrada: EntradaPlan = { ...e, grupoResourceName: grupo, modo: 'completo' }
  const vivos = e.google.filter((p) => !p.metadata?.deleted)
  const enEtiqueta = vivos.filter((p) => (p.memberships ?? []).some((m) => m.contactGroupMembership?.contactGroupResourceName === grupo))

  // Teléfonos de la agenda (TODOS los de cada contacto): sin ninguno normalizable, y repetidos.
  const noNormalizables: EjemploAgenda[] = []
  const porTel = new Map<string, number>()
  for (const p of vivos) {
    const tels = (p.phoneNumbers ?? []).filter((t) => (t.value ?? '').trim())
    if (tels.length === 0) continue
    const canon = [...new Set(tels.flatMap((t) => { const c = (t.canonicalForm ?? '').trim() || aE164(t.value); return c ? [c] : [] }))]
    if (canon.length === 0) {
      noNormalizables.push({ nombre: nombreAgenda(p), telefono: enmascararTelefono(tels[0].value) })
      continue
    }
    for (const c of canon) porTel.set(c, (porTel.get(c) ?? 0) + 1)
  }
  const telefonosRepetidosEnAgenda = [...porTel.values()].filter((n) => n > 1).length

  const crm = seleccionUnica(e.crm, e.fusiones)
  const base = {
    grupoExiste: e.grupoResourceName !== null,
    contactosLeidos: vivos.length,
    contactosEnEtiqueta: enEtiqueta.length,
    totalCuenta: opts.totalCuenta,
    fichasCrm: crm.length,
    seleccionIncompleta: !e.seleccionCompleta,
    telefonosNoNormalizables: lista(noNormalizables, max),
    telefonosRepetidosEnAgenda,
  }
  const previo = excesoLimite({ aSincronizar: crm.length, vinculados: e.vinculos.length, totalCuenta: null })
  if (previo.supera) {
    // `planificarSync` lanzaría: ni se calcula el plan.
    const vacia = lista<EjemploFicha>([], max)
    return {
      ...base, contactosTras: previo.tras, superaTope: true, crear: vacia, vincular: vacia, adoptar: vacia, conflictosNombre: vacia, ambiguos: vacia,
      real: { crear: 0, vincular: 0, adoptar: 0, actualizarVinculados: 0, aRevision: 0, propuestasLead: 0, retirar: 0, ilegibles: 0 },
      avisos: [`La selección del CRM (${crm.length}) ya pasa del tope de Google: no se ha calculado el plan.`],
    }
  }

  const real = planificarSync(entrada)
  const camposPorId = new Map(crm.map((c) => [c.clienteId, camposDeCrm(c)]))
  const personaPorRN = new Map(e.google.map((p) => [p.resourceName, p]))
  const enLaEtiqueta = new Set(enEtiqueta.map((p) => p.resourceName))
  const vinculados = new Set(e.vinculos.map((v) => v.clienteId))
  const ejemplo = (clienteId: string, fueraDeEtiqueta: boolean): EjemploFicha => {
    const c = camposPorId.get(clienteId)
    return { clienteId, nombre: c ? nombreEnGoogle(c) : '(ilegible)', telefono: enmascararTelefono(c?.telefono), fueraDeEtiqueta }
  }

  const nuevos = real.actualizar.filter((a) => !vinculados.has(a.clienteId))
  const crear = real.crear.map((c) => ejemplo(c.clienteId, false))
  const vincular = nuevos.filter((a) => a.origen === 'vinculado_telefono' || a.origen === 'vinculado_id').map((a) => ejemplo(a.clienteId, false))
  const adoptar = nuevos.filter((a) => a.origen === 'adoptado').map((a) => ejemplo(a.clienteId, true))
  const conflictos: EjemploFicha[] = []
  const ambiguos: EjemploFicha[] = []
  for (const r of real.revisiones) {
    if (r.tipo !== 'duplicado_ambiguo' || !r.clienteId) continue
    const ej = ejemplo(r.clienteId, !enLaEtiqueta.has(r.resourceName))
    if (r.motivo === 'nombre_distinto') {
      const p = personaPorRN.get(r.resourceName)
      conflictos.push({ ...ej, nombreEnAgenda: p ? nombreAgenda(p) : '(desconocido)' })
    } else {
      const tel = camposPorId.get(r.clienteId)?.telefono
      ambiguos.push({ ...ej, contactosConEseTelefono: tel ? (porTel.get(tel) ?? 0) : 0 })
    }
  }

  const aSincronizar = real.crear.length + e.vinculos.length
  const tope = excesoLimite({ aSincronizar, vinculados: e.vinculos.length, totalCuenta: opts.totalCuenta })
  const avisos = [...real.avisos]
  if (adoptar.length > 0) {
    avisos.push(
      `Se adoptarán ${adoptar.length} contacto(s) que ya tienes en la agenda fuera de la etiqueta (el volcado del .vcf): ` +
        'se meten en «Grupo ASegura» y pasa a gestionarlos el CRM, sin duplicarlos. No se borran nunca.',
    )
  }
  const fueraEnCola = [...conflictos, ...ambiguos].filter((x) => x.fueraDeEtiqueta).length
  if (fueraEnCola > 0) {
    avisos.push(`${fueraEnCola} ficha(s) casan por teléfono con contactos de tu agenda que NO son claramente suyos: van a la cola, ni se adoptan ni se crean.`)
  }
  if (!e.grupoResourceName) avisos.push('La etiqueta «Grupo ASegura» aún no existe en Google: la creará la primera sincronización.')

  return {
    ...base,
    contactosTras: tope.tras,
    superaTope: tope.supera,
    crear: lista(crear, max),
    vincular: lista(vincular, max),
    adoptar: lista(adoptar, max),
    conflictosNombre: lista(conflictos, max),
    ambiguos: lista(ambiguos, max),
    real: {
      crear: real.crear.length,
      vincular: vincular.length,
      adoptar: adoptar.length,
      actualizarVinculados: real.actualizar.filter((a) => vinculados.has(a.clienteId)).length,
      aRevision: real.revisiones.filter((r) => r.tipo !== 'propuesta_lead').length,
      propuestasLead: real.revisiones.filter((r) => r.tipo === 'propuesta_lead').length,
      retirar: real.retirar.length,
      ilegibles: real.ilegibles,
    },
    avisos,
  }
}
