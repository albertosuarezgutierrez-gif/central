// «Ordenar agenda» (05/10/2026): informe SOLO LECTURA sobre la agenda de Google de Alberto para que la
// limpie él (Google tiene «Fusionar y corregir»; se deshace en ⚙️ → Deshacer cambios, 30 días). Lógica
// PURA con la MISMA lectura que la simulación (listado completo); nada se escribe.
//   1. duplicados por teléfono E.164 FUERA de la etiqueta (y si el número está escrito distinto);
//   2. contactos sin nombre; 3. teléfonos que no normalizan a E.164;
//   4. fichas del CRM que tiene guardadas con OTRO nombre (→ cola / «Unificar»), del plan real;
//   5. contactos fuera del CRM que PARECEN de trabajo (seguro/s, taller, correduría, perito, o el
//      nombre de una compañía del catálogo): candidatos a dar de alta, nunca alta automática.
// PII mínima: nombre visible y teléfono enmascarado (3 últimas cifras). Listas: totales + ejemplos.

import { aE164 } from './telefono-e164.ts'
import {
  enGrupo, nombreVisible, normNombre, planificarSync, TIPO_ID_EXTERNO,
  type EntradaPlan, type PersonaGoogle,
} from './google-contactos.ts'
import { enmascararTelefono, type Lista } from './google-contactos-simulacion.ts'
import type { MotivoDuplicado } from './google-contactos-revision.ts'

export const MAX_EJEMPLOS_ORDENAR = 500

export type ContactoAgenda = { resourceName: string; nombre: string; telefono: string | null }
export type GrupoDuplicado = { telefono: string | null; contactos: ContactoAgenda[]; escritoDistinto: boolean }
export type FichaOtroNombre = { clienteId: string; nombreCrm: string; nombreEnAgenda: string; motivo: MotivoDuplicado }
export type PareceTrabajo = ContactoAgenda & { pista: string }

export type InformeOrdenar = {
  contactosLeidos: number
  duplicadosTelefono: Lista<GrupoDuplicado>
  sinNombre: Lista<ContactoAgenda>
  noE164: Lista<ContactoAgenda>
  fichasOtroNombre: Lista<FichaOtroNombre>
  pareceTrabajo: Lista<PareceTrabajo>
}

/** Palabras que delatan un contacto de trabajo (se comparan sin tildes ni mayúsculas, palabra entera). */
export const PALABRAS_TRABAJO = ['seguro', 'seguros', 'taller', 'correduria', 'perito', 'aseguradora', 'mediador'] as const

const lista = <T>(xs: T[], max: number): Lista<T> => ({ total: xs.length, ejemplos: xs.slice(0, max) })

function visible(p: PersonaGoogle): string {
  return nombreVisible(p) ?? '(sin nombre)'
}

function primerTel(p: PersonaGoogle): string | null {
  return enmascararTelefono((p.phoneNumbers ?? []).find((t) => (t.value ?? '').trim())?.value)
}

function contacto(p: PersonaGoogle): ContactoAgenda {
  return { resourceName: p.resourceName, nombre: visible(p), telefono: primerTel(p) }
}

/** Texto comparable (nombre + empresa): sin tildes ni mayúsculas, palabras separadas por un espacio. */
function plano(v: string): string {
  return ` ${normNombre(v).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
}

/**
 * La pista de trabajo de un contacto: la primera palabra clave o compañía que aparece ENTERA en su
 * nombre o su empresa. Compañías de menos de 3 letras no cuentan (falsos positivos).
 */
export function pistaTrabajo(p: PersonaGoogle, companias: readonly string[]): string | null {
  const t = plano([visible(p), ...(p.organizations ?? []).map((o) => o.name ?? '')].join(' '))
  for (const w of PALABRAS_TRABAJO) if (t.includes(` ${w} `)) return w
  for (const c of companias) {
    const k = plano(c).trim()
    if (k.length >= 3 && t.includes(` ${k} `)) return c
  }
  return null
}

export function informeOrdenarAgenda(
  e: Omit<EntradaPlan, 'grupoResourceName' | 'modo'> & { grupoResourceName: string | null },
  opts: { companias: readonly string[]; maxEjemplos?: number },
): InformeOrdenar {
  const max = opts.maxEjemplos ?? MAX_EJEMPLOS_ORDENAR
  const grupo = e.grupoResourceName ?? 'contactGroups/(aún-no-existe)'
  const vivos = e.google.filter((p) => !p.metadata?.deleted)
  const fuera = vivos.filter((p) => !enGrupo(p, grupo))
  const vinculados = new Set(e.vinculos.map((v) => v.resourceName))

  // 1 y 3: teléfonos.
  const porTel = new Map<string, { p: PersonaGoogle; crudo: string }[]>()
  const noE164: ContactoAgenda[] = []
  for (const p of vivos) {
    const tels = (p.phoneNumbers ?? []).filter((t) => (t.value ?? '').trim())
    if (tels.length === 0) continue
    let alguno = false
    for (const t of tels) {
      const c = (t.canonicalForm ?? '').trim() || aE164(t.value!)
      if (!c) continue
      alguno = true
      if (!enGrupo(p, grupo)) porTel.set(c, [...(porTel.get(c) ?? []), { p, crudo: t.value!.replace(/\s+/g, '') }])
    }
    if (!alguno) noE164.push(contacto(p))
  }
  const duplicados: GrupoDuplicado[] = []
  for (const [tel, xs] of porTel) {
    const unicos = [...new Map(xs.map((x) => [x.p.resourceName, x])).values()]
    if (unicos.length < 2) continue
    duplicados.push({ telefono: enmascararTelefono(tel), contactos: unicos.map((x) => contacto(x.p)), escritoDistinto: new Set(unicos.map((x) => x.crudo)).size > 1 })
  }
  // Primero los escritos distinto (los que Google no detecta solo), luego por tamaño.
  duplicados.sort((a, b) => Number(b.escritoDistinto) - Number(a.escritoDistinto) || b.contactos.length - a.contactos.length)

  // 2: sin nombre.
  const sinNombre = vivos.filter((p) => nombreVisible(p) === null).map(contacto)

  // 4: fichas guardadas con otro nombre — del plan REAL (lo que irá / está en la cola).
  const plan = planificarSync({ ...e, grupoResourceName: grupo, modo: 'completo' })
  const porRN = new Map(vivos.map((p) => [p.resourceName, p]))
  const nombreFicha = new Map(e.crm.map((c) => [c.clienteId, `${c.nombre ?? ''} ${c.apellidos ?? ''}`.replace(/\s+/g, ' ').trim()]))
  const otroNombre: FichaOtroNombre[] = plan.revisiones.flatMap((r) => {
    if (r.tipo !== 'duplicado_ambiguo' || !r.clienteId || !r.motivo) return []
    if (r.motivo !== 'nombre_distinto' && r.motivo !== 'mismo_email' && r.motivo !== 'mismo_nombre') return []
    const p = porRN.get(r.resourceName)
    return [{ clienteId: r.clienteId, nombreCrm: nombreFicha.get(r.clienteId) || '(sin nombre)', nombreEnAgenda: p ? visible(p) : '(desconocido)', motivo: r.motivo }]
  })

  // 5: fuera de la etiqueta, sin vínculo, sin nuestro id y sin casar con ninguna ficha en el plan.
  const tocados = new Set([...plan.actualizar.map((a) => a.resourceName), ...plan.revisiones.map((r) => r.resourceName)])
  const trabajo: PareceTrabajo[] = fuera.flatMap((p) => {
    if (vinculados.has(p.resourceName) || tocados.has(p.resourceName)) return []
    if ((p.externalIds ?? []).some((x) => x.type === TIPO_ID_EXTERNO)) return []
    const pista = pistaTrabajo(p, opts.companias)
    return pista ? [{ ...contacto(p), pista }] : []
  })

  return {
    contactosLeidos: vivos.length,
    duplicadosTelefono: lista(duplicados, max),
    sinNombre: lista(sinNombre, max),
    noE164: lista(noE164, max),
    fichasOtroNombre: lista(otroNombre, max),
    pareceTrabajo: lista(trabajo, max),
  }
}
