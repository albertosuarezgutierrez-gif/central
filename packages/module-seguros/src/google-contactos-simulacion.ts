// Simulación de la sincronización CRM → Google Contacts (05/10/2026). Lógica PURA: con la MISMA
// entrada que el cron (`planificarSync`), dice qué PASARÍA, sin escribir nada. Alberto ya volcó
// la cartera a su agenda a mano (el .vcf de contactos-movil): en su Google hay clientes SIN
// nuestro externalId, FUERA de la etiqueta «Grupo ASegura», a veces duplicados entre sí.
//
// 🚨 La regla de la sincronización es «solo se tocan contactos de la etiqueta» (no se reabre aquí):
// un contacto de la agenda FUERA de la etiqueta jamás se vincula. Por eso el informe calcula DOS
// planes con la misma lógica:
//   · el REAL (la etiqueta tal como está hoy): es lo que hará la primera pasada;
//   · el de «agenda entera» (como si todos los contactos estuvieran en la etiqueta), solo para
//     las fichas que el real va a CREAR: si ahí se vincularían, es que la persona YA está en la
//     agenda y la primera pasada la DUPLICARÍA (`fueraDeEtiqueta: true`). Remedio: meter esos
//     contactos en la etiqueta en Google y volver a simular.
//
// PII mínima: nombre (como quedará en Google, con su 🟢/🟡) y teléfono enmascarado salvo los 3
// últimos dígitos. Listas acotadas (`maxEjemplos`); los contadores son siempre los totales.

import { aE164 } from './telefono-e164.ts'
import {
  camposDeCrm, camposDeGoogle, excesoLimite, nombreEnGoogle, planificarSync, seleccionUnica,
  type EntradaPlan, type PersonaGoogle, type Plan,
} from './google-contactos.ts'

export const MAX_EJEMPLOS_SIMULACION = 50

export type EjemploFicha = {
  clienteId: string
  /** Cómo quedará en Google: «🟢 Juan Pérez». */
  nombre: string
  telefono: string | null
  /** El contacto que ya hay está FUERA de la etiqueta: hoy la sincronización lo DUPLICARÍA. */
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
  /** Mismo teléfono E.164 y mismo nombre (sin tildes/mayúsculas/emoji). `fueraDeEtiqueta` = hoy se duplicaría. */
  vincular: Lista<EjemploFicha>
  /** Mismo teléfono, OTRO nombre: iría a la cola (o, fuera de la etiqueta, se duplicaría). */
  conflictosNombre: Lista<EjemploFicha>
  /** Varios contactos de Google (o varias fichas) con el mismo número. */
  ambiguos: Lista<EjemploFicha>
  /** Contactos de la agenda cuyo primer teléfono (el que se empareja) no es E.164 válido. */
  telefonosNoNormalizables: Lista<EjemploAgenda>
  /** Números E.164 que tienen ya 2+ contactos en la agenda (duplicados previos a la sync). */
  telefonosRepetidosEnAgenda: number
  /** Lo que la primera pasada REAL hará, en cifras. */
  real: {
    crear: number
    /** De esos, cuántos ya están en la agenda fuera de la etiqueta (duplicados que se crearían). */
    duplicariaFueraDeEtiqueta: number
    vincular: number
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

  // Teléfonos de la agenda: no normalizables y repetidos (el PRIMERO, que es el que se empareja).
  const noNormalizables: EjemploAgenda[] = []
  const porTel = new Map<string, PersonaGoogle[]>()
  for (const p of vivos) {
    const tel = p.phoneNumbers?.[0]
    if (!tel || !(tel.value ?? '').trim()) continue
    const canon = (tel.canonicalForm ?? '').trim() || aE164(tel.value)
    if (!canon) {
      noNormalizables.push({ nombre: nombreAgenda(p), telefono: enmascararTelefono(tel.value) })
      continue
    }
    porTel.set(canon, [...(porTel.get(canon) ?? []), p])
  }
  const telefonosRepetidosEnAgenda = [...porTel.values()].filter((ps) => ps.length > 1).length

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
      ...base, contactosTras: previo.tras, superaTope: true, crear: vacia, vincular: vacia, conflictosNombre: vacia, ambiguos: vacia,
      real: { crear: 0, duplicariaFueraDeEtiqueta: 0, vincular: 0, actualizarVinculados: 0, aRevision: 0, propuestasLead: 0, retirar: 0, ilegibles: 0 },
      avisos: [`La selección del CRM (${crm.length}) ya pasa del tope de Google: no se ha calculado el plan.`],
    }
  }

  const real = planificarSync(entrada)
  // «Agenda entera»: todos los contactos vivos como si estuvieran en la etiqueta.
  const todos = e.google.map((p) => (p.metadata?.deleted ? p : { ...p, memberships: [...(p.memberships ?? []), { contactGroupMembership: { contactGroupResourceName: grupo } }] }))
  const agenda = planificarSync({ ...entrada, google: todos })

  const camposPorId = new Map(crm.map((c) => [c.clienteId, camposDeCrm(c)]))
  const personaPorRN = new Map(e.google.map((p) => [p.resourceName, p]))
  const vinculados = new Set(e.vinculos.map((v) => v.clienteId))
  const ejemplo = (clienteId: string, fueraDeEtiqueta: boolean): EjemploFicha => {
    const c = camposPorId.get(clienteId)
    return { clienteId, nombre: c ? nombreEnGoogle(c) : '(ilegible)', telefono: enmascararTelefono(c?.telefono), fueraDeEtiqueta }
  }

  const crear: EjemploFicha[] = []
  const vincular: EjemploFicha[] = []
  const conflictos: EjemploFicha[] = []
  const ambiguos: EjemploFicha[] = []

  // Índices por ficha de cada plan (miles de fichas: nada de `find` dentro del bucle).
  const indice = (plan: Plan) => ({
    vincula: new Set(plan.actualizar.filter((x) => !vinculados.has(x.clienteId) && (x.origen === 'vinculado_telefono' || x.origen === 'vinculado_id')).map((x) => x.clienteId)),
    ambiguo: new Map(plan.revisiones.filter((x) => x.tipo === 'duplicado_ambiguo' && x.clienteId).map((x) => [x.clienteId!, x])),
  })
  const iReal = indice(real)
  const iAgenda = indice(agenda)
  const porTelEtiqueta = new Map<string, number>()
  for (const p of enEtiqueta) {
    const t = camposDeGoogle(p).telefono
    if (t) porTelEtiqueta.set(t, (porTelEtiqueta.get(t) ?? 0) + 1)
  }
  const porTelAgenda = new Map<string, number>()
  for (const p of vivos) {
    const t = camposDeGoogle(p).telefono
    if (t) porTelAgenda.set(t, (porTelAgenda.get(t) ?? 0) + 1)
  }

  const clasificar = (i: ReturnType<typeof indice>, clienteId: string, fuera: boolean): boolean => {
    if (i.vincula.has(clienteId)) {
      vincular.push(ejemplo(clienteId, fuera))
      return true
    }
    const r = i.ambiguo.get(clienteId)
    if (!r) return false
    const ej = ejemplo(clienteId, fuera)
    if (r.motivo === 'nombre_distinto') {
      const p = personaPorRN.get(r.resourceName)
      conflictos.push({ ...ej, nombreEnAgenda: p ? nombreAgenda(p) : '(desconocido)' })
    } else {
      const tel = camposPorId.get(clienteId)?.telefono
      ambiguos.push({ ...ej, contactosConEseTelefono: tel ? ((fuera ? porTelAgenda : porTelEtiqueta).get(tel) ?? 0) : 0 })
    }
    return true
  }

  const crearReal = new Set(real.crear.map((c) => c.clienteId))
  for (const c of crm) {
    if (crearReal.has(c.clienteId)) {
      if (!clasificar(iAgenda, c.clienteId, true)) crear.push(ejemplo(c.clienteId, false))
    } else {
      clasificar(iReal, c.clienteId, false)
    }
  }

  const duplicaria = [...vincular, ...conflictos, ...ambiguos].filter((x) => x.fueraDeEtiqueta).length
  const aSincronizar = real.crear.length + e.vinculos.length
  const tope = excesoLimite({ aSincronizar, vinculados: e.vinculos.length, totalCuenta: opts.totalCuenta })
  const avisos = [...real.avisos]
  if (duplicaria > 0) {
    avisos.push(
      `${duplicaria} ficha(s) ya están en la agenda FUERA de la etiqueta «Grupo ASegura»: la primera sincronización ` +
        'las DUPLICARÍA. Mételas en la etiqueta en Google Contacts y vuelve a simular: entonces se vincularán.',
    )
  }
  if (!e.grupoResourceName) avisos.push('La etiqueta «Grupo ASegura» aún no existe en Google: la creará la primera sincronización.')

  return {
    ...base,
    contactosTras: tope.tras,
    superaTope: tope.supera,
    crear: lista(crear, max),
    vincular: lista(vincular, max),
    conflictosNombre: lista(conflictos, max),
    ambiguos: lista(ambiguos, max),
    real: {
      crear: real.crear.length,
      duplicariaFueraDeEtiqueta: duplicaria,
      vincular: iReal.vincula.size,
      actualizarVinculados: real.actualizar.filter((a) => vinculados.has(a.clienteId)).length,
      aRevision: real.revisiones.filter((r) => r.tipo !== 'propuesta_lead').length,
      propuestasLead: real.revisiones.filter((r) => r.tipo === 'propuesta_lead').length,
      retirar: real.retirar.length,
      ilegibles: real.ilegibles,
    },
    avisos,
  }
}
