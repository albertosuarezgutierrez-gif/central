// El CALENDARIO ÚNICO (26/10/2026): de lo que ya lee el portal a las filas que compone
// `componerCalendario` (`@central/module-seguros-portal`, pura). PURO: sin prisma, sin sesión, sin reloj. Quien llama
// ya acotó cada lista a lo que ESTA sesión ve (cartera por `portal_vinculo`/`portal_autorizacion`, patrimonio por
// `accesosPatrimonio`, recordatorios y avisos por `identidadId`): aquí no se lee nada nuevo.
//
// Tres estados: una lista vacía es «se miró y no hay»; el «no se ha podido leer» (`null`) lo decide quien llama
// ANTES de llegar aquí y se queda como `null`. Una fecha que no se sabe se queda `null` y se dice, no se inventa.
import {
  TIPOS_AVISO_CON_FECHA,
  reciboAlCobro,
  tonoSituacionRecibo,
  type Aviso,
  type EntradaCalendarioCruda,
  type ReciboHistorial,
} from '@central/module-seguros-portal'

import type { PolizaPortal } from './cartera-lectura.ts'
import { eur } from './dinero.ts'
import { puedeOfrecerMejorarPrecio } from './vencimientos.ts'

/** Lo mínimo de una póliza de la cartera que el calendario lee (`PolizaPortal` lo cumple). */
export type PolizaCalendario = Pick<
  PolizaPortal,
  'id' | 'compania' | 'vigencia' | 'renovacionSinConfirmar' | 'sustituidaPor' | 'fechaVencimiento'
> & {
  recibos: { historial: readonly ReciboHistorial[] } | null
  /** Para decidir «Revisar mi seguro» (en vigor para actuar = vigente y no sustituida). Ausente = no se ofrece. */
  sustituidaAt?: Date | null
}

/** `YYYY-MM-DD` de una columna `date` (medianoche UTC) o `null`. */
export function diaIso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/** Un titular tal como lo trae la cartera: lo mínimo que el calendario necesita. */
export type TitularParaCalendario<P extends PolizaCalendario = PolizaCalendario> = {
  nombre: string
  /** `true` = es de otra persona que ha autorizado a esta (se dice de quién es). */
  ajeno: boolean
  /** Nivel del vínculo (solo las PROPIAS pueden «Revisar mi seguro»). Ausente = no se ofrece. */
  nivel?: string
  polizas: readonly P[]
}

/**
 * Los vencimientos de los seguros que la sesión ve. Fuera lo que la compañía da por terminado (`no_vigente`) y las
 * ya sustituidas. 🚨 Una renovación sin confirmar NO es «vencida»: no se sabe si renovó, así que va SIN fecha y lo dice.
 */
export function vencimientosDeSeguros<P extends PolizaCalendario>(
  titulares: readonly TitularParaCalendario<P>[],
  titulo: (p: P) => string,
): EntradaCalendarioCruda[] {
  const filas: EntradaCalendarioCruda[] = []
  for (const t of titulares) {
    for (const p of t.polizas) {
      if (p.vigencia === 'no_vigente' && !p.renovacionSinConfirmar) continue
      if (p.sustituidaPor !== null) continue
      const venc = diaIso(p.fechaVencimiento)
      const de = t.ajeno ? ` · de ${t.nombre}` : ''
      filas.push({
        clave: `seguro:${p.id}`,
        titulo: `Vence ${p.compania} · ${titulo(p)}`,
        fecha: p.renovacionSinConfirmar ? null : venc,
        detalle: p.renovacionSinConfirmar
          ? `La compañía aún no ha confirmado la renovación${venc ? ` (vencía el ${fechaEs(venc)})` : ''}${de}`
          : venc === null
            ? `No tenemos la fecha de vencimiento${de}`
            : t.ajeno
              ? `De ${t.nombre}`
              : null,
        href: `/boveda/poliza/${p.id}`,
        // Misma regla que la ficha (`hrefRevisarPrecio`): solo propias, con nivel que opera, en vigor para actuar, con
        // fecha y sin renovación pendiente de confirmar. Si la página no la atendería, no se enlaza.
        ...(!t.ajeno &&
        t.nivel !== undefined &&
        !p.renovacionSinConfirmar &&
        puedeOfrecerMejorarPrecio({ id: p.id, vigencia: p.vigencia, sustituidaAt: p.sustituidaAt ?? null, fechaVencimiento: p.fechaVencimiento }, t.nivel, null)
          ? { accion: { texto: 'Revisar mi seguro', href: `/boveda/mejorar/${p.id}` } }
          : {}),
      })
    }
  }
  return filas
}

/**
 * Los recibos que piden algo: al cobro y devueltos. Solo de las pólizas cuyo bloque de recibos SE VE en este nivel
 * (`recibos === null` = no visible: se omite, no se dice «sin recibos»). Un anulado no entra.
 */
export function recibosPendientes<P extends PolizaCalendario>(
  titulares: readonly TitularParaCalendario<P>[],
  titulo: (p: P) => string,
): EntradaCalendarioCruda[] {
  const filas: EntradaCalendarioCruda[] = []
  for (const t of titulares) {
    for (const p of t.polizas) {
      if (p.recibos === null) continue
      p.recibos.historial.forEach((r, i) => {
        const devuelto = tonoSituacionRecibo(r.situacion) === 'devuelto'
        if (!devuelto && !reciboAlCobro(r.situacion)) return
        const venc = diaIso(r.fechaVencimiento)
        filas.push({
          clave: `recibo:${p.id}:${i}:${venc ?? 'sin_fecha'}`,
          titulo: `${devuelto ? 'Recibo devuelto' : 'Recibo pendiente de cobro'} · ${titulo(p)}`,
          fecha: venc,
          detalle: [r.importe === null ? null : eur(r.importe), t.ajeno ? `De ${t.nombre}` : null].filter(Boolean).join(' · ') || null,
          href: '/boveda?vista=recibos',
          urgente: devuelto,
        })
      })
    }
  }
  return filas
}

/** Una fila del calendario del patrimonio, tal como la compone `calendarioDeIdentidad`. */
export type VencimientoPatrimonioParaCalendario = {
  clave: string
  etiqueta: string
  inmueble: string
  vence: string | null
  estado: string
  falta: string | null
  detalle?: string | null
  contratoId: string | null
  inmuebleId: string
}

/** Las fechas del patrimonio. Lo ya hecho (`cumplida`) no es una fecha por delante y no entra. */
export function fechasDePatrimonio(vs: readonly VencimientoPatrimonioParaCalendario[]): EntradaCalendarioCruda[] {
  return vs
    .filter((v) => v.estado !== 'cumplida')
    .map((v) => ({
      clave: `patrimonio:${v.clave}`,
      titulo: `${v.etiqueta} · ${v.inmueble}`,
      fecha: v.vence,
      detalle: (v.estado === 'sin_dato' ? v.falta : v.detalle) ?? v.detalle ?? null,
      href: v.contratoId ? `/patrimonio/contrato/${v.contratoId}` : `/patrimonio/inmueble/${v.inmuebleId}`,
      urgente: v.estado === 'vencida',
    }))
}

/** Un recordatorio propio, tal como lo lee `recordatoriosDeIdentidad`. */
export type RecordatorioParaCalendario = {
  id: string
  titulo: string
  fechaEvento: Date
  repiteCadaMeses: number | null
}

/** Los recordatorios propios. El enlace lleva al editor (`#tus-recordatorios`), que está en la misma pantalla. */
export function fechasDeRecordatorios(rs: readonly RecordatorioParaCalendario[]): EntradaCalendarioCruda[] {
  return rs.map((r) => ({
    clave: `recordatorio:${r.id}`,
    titulo: r.titulo,
    fecha: diaIso(r.fechaEvento),
    detalle: r.repiteCadaMeses === null ? 'Recordatorio tuyo' : 'Recordatorio tuyo · se repite',
    href: '#tus-recordatorios',
  }))
}

/** Los avisos de la campana que son una fecha (los demás no son calendario). Sin fecha propia: el texto la lleva. */
export function avisosConFecha(avisos: readonly Aviso[]): EntradaCalendarioCruda[] {
  const con = TIPOS_AVISO_CON_FECHA as readonly string[]
  return avisos
    .filter((a) => con.includes(a.tipo))
    .map((a) => ({ clave: `aviso:${a.clave}`, titulo: a.titulo, detalle: a.detalle, fecha: null, href: a.href }))
}
