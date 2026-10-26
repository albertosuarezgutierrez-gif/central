// Aviso por Telegram cuando el cliente COMPLETA el enlace de datos de un ramo que NO es hogar (26/10/2026, fase 2). PURO.
//
// Hermano de `aviso-datos-hogar.ts`: el resumen para tarificar sin abrir nada, por ramo:
//   auto/moto        → vehículo (y si eligió la versión del catálogo), garaje, km, seguro actual y años sin siniestros;
//   vida             → capital, fumador, hipoteca (🔴 si está vinculada: el banco va de beneficiario);
//   salud/decesos    → cuántos y qué edades;
//   accidentes       → profesión;  mascotas → el animal;  comercio → actividad;  el resto → qué quiere asegurar.
// Más: seguro actual, efecto deseado, comentario, lo que queda «a preguntar» y qué se pasó al riesgo (o por qué no).
//
// Va a la conversación de Alberto (no a terceros). Nunca lleva DNI, fecha de nacimiento ni matrícula entera (solo los
// últimos 3 caracteres), ni el microchip. Todo lo tecleado, escapado. `null` = el cliente no lo dijo: «sin dato».

import { escapeHtml } from '@central/core-telegram'
import {
  ESPECIES_MASCOTA_SOLICITUD,
  GARAJES_SOLICITUD,
  camposAPreguntar,
  claveVehiculo,
  grupoSolicitud,
  nombreRamoSolicitud,
  type CampoSolicitud,
  type RamoSolicitud,
  type Respuesta,
} from '@central/module-seguros'
import { eur } from './dinero.ts'

const fechaEs = (v: Respuesta | undefined): string | null => {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}
const txt = (v: Respuesta | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const siNo = (v: Respuesta | undefined): string => (v === true ? 'sí' : v === false ? 'no' : 'sin dato')
const num = (v: Respuesta | undefined): string => (typeof v === 'number' ? v.toLocaleString('es-ES') : 'sin dato')
const etiqueta = (lista: readonly { valor: string; etiqueta: string }[], v: Respuesta | undefined): string =>
  lista.find((o) => o.valor === v)?.etiqueta ?? 'sin dato'

export type EntradaAvisoDatosRiesgo = {
  ramo: RamoSolicitud
  respuestas: Record<string, Respuesta>
  campos?: readonly CampoSolicitud[]
  enlaceFicha: string
  tercero: boolean
  /** Campos escritos en el riesgo; `null` = no se pudo. */
  anotados: number | null
  conflictos?: string[]
  confirmado?: boolean
  /** Campos del riesgo que YA tenían valor y se han reescrito (revisión del PR #5080): entonces no se dice «no se ha tocado». */
  cambiados?: string[]
  /** Vehículo: la versión del catálogo que eligió, comprobada contra el catálogo (`false` = no casa: no se escribió). */
  catalogoComprobado?: boolean | null
  /** Vehículo: código DGS de la compañía actual, si se resolvió sin duda. */
  companiaDgs?: string | null
}

const ICONO: Record<string, string> = { vehiculo: '🚗', personas: '👪', mascota: '🐾', generico: '📋' }

export function textoAvisoDatosRiesgo(e: EntradaAvisoDatosRiesgo): string {
  const r = e.respuestas
  const g = grupoSolicitud(e.ramo)
  const l: string[] = [`${e.ramo === 'moto' ? '🏍️' : ICONO[g] ?? '📋'} <b>${escapeHtml(nombreRamoSolicitud(e.ramo))}: ${e.tercero ? 'datos de la otra persona recibidos' : 'el cliente completó sus datos'}</b>`]

  if (g === 'vehiculo') {
    const mat = txt(r.matricula)
    const version = txt(r[claveVehiculo('versionCatalogo', 'Version')])
    l.push(`🚘 ${escapeHtml([txt(r.marca), txt(r.modelo)].filter(Boolean).join(' ') || 'vehículo sin dato')}${mat ? ` · matrícula …${escapeHtml(mat.slice(-3))}` : ''} · matriculado: ${fechaEs(r.fechaMatriculacion) ?? 'sin dato'}`)
    if (txt(r[claveVehiculo('versionCatalogo', 'Codigo')])) {
      l.push(`📚 Versión del catálogo: ${version ? escapeHtml(version) : 'elegida'}${e.catalogoComprobado === true ? ' (comprobada)' : e.catalogoComprobado === false ? ' ⚠️ no casa con el catálogo: no se ha anotado' : ' (sin comprobar)'}`)
    } else {
      l.push('📚 Versión del catálogo: no la eligió (hay que buscarla al pedir precio)')
    }
    l.push(`🅿️ ${etiqueta(GARAJES_SOLICITUD, r.garaje)} · ${typeof r.kmAnuales === 'number' ? `${num(r.kmAnuales)} km/año` : 'km sin dato'} · años sin partes con culpa: ${num(r.aniosSinSiniestros)}`)
  } else if (e.ramo === 'vida') {
    l.push(`💶 Capital: ${typeof r.capitalDeseado === 'number' ? eur(r.capitalDeseado) : 'sin dato (verlo con él)'} · fuma: ${siNo(r.fumador)}`)
    if (r.hipoteca === true) {
      const banco = txt(r.entidadHipoteca)
      const pendiente = typeof r.capitalPendienteHipoteca === 'number' ? ` · pendiente ${eur(r.capitalPendienteHipoteca)}` : ''
      if (r.paraBanco === true) l.push(`🔴 <b>Vinculada a la hipoteca</b>: ${banco ? `${escapeHtml(banco)} de beneficiario` : 'entidad SIN DATO (pídesela)'}${pendiente}`)
      else l.push(`🏦 Hipoteca: sí${banco ? ` (${escapeHtml(banco)})` : ''}${pendiente} · ${r.paraBanco === false ? 'no la pide el banco' : '¿la pide el banco? sin dato'}`)
    } else {
      l.push(`🏦 Hipoteca: ${siNo(r.hipoteca)}`)
    }
  } else if (g === 'personas' && e.ramo !== 'accidentes') {
    l.push(`👥 Personas: ${num(r.personasAsegurar)} · edades: ${txt(r.edades) ? escapeHtml(txt(r.edades)!) : 'sin dato'}`)
  } else if (e.ramo === 'accidentes') {
    l.push(`🛠️ Profesión: ${txt(r.profesion) ? escapeHtml(txt(r.profesion)!) : 'sin dato'}`)
  } else if (g === 'mascota') {
    l.push(`🐾 ${etiqueta(ESPECIES_MASCOTA_SOLICITUD, r.especieMascota)} · ${txt(r.razaMascota) ? escapeHtml(txt(r.razaMascota)!) : 'raza sin dato'} · nacido: ${fechaEs(r.fechaNacimientoMascota) ?? 'sin dato'} · PPP: ${siNo(r.ppp)} · microchip: ${txt(r.microchip) ? 'sí' : 'sin dato'}`)
  } else {
    const d = txt(r.descripcionRiesgo)
    l.push(`${e.ramo === 'comercio' ? '🏪 Actividad' : '📝 Qué quiere asegurar'}: ${d ? escapeHtml(d.slice(0, 300)) : 'sin dato'}`)
  }

  if (r.tieneSeguro === true) {
    const comp = txt(r.companiaActual)
    l.push(`📄 Seguro actual: ${comp ? escapeHtml(comp) : 'compañía sin dato'}${e.companiaDgs ? ` (${escapeHtml(e.companiaDgs)})` : ''} · ${fechaEs(r.vencimientoActual) ? `vence el ${fechaEs(r.vencimientoActual)}` : 'vencimiento sin dato'}`)
  } else {
    l.push(`📄 Seguro actual: ${r.tieneSeguro === false ? 'no tiene' : 'sin dato'}`)
  }
  if ('fechaEfecto' in r) l.push(`📅 Efecto deseado: ${fechaEs(r.fechaEfecto) ?? 'sin fecha'}`)
  const comentario = txt(r.comentario)
  if (comentario) l.push(`💬 ${escapeHtml(comentario.slice(0, 300))}`)
  if (e.campos) {
    const a = camposAPreguntar(e.campos, r)
    if (a.noLoSabe.length > 0) l.push(`❓ No lo sabe (a preguntar): ${escapeHtml(a.noLoSabe.join(' · ').slice(0, 600))}`)
    if (a.sinContestar.length > 0) l.push(`📞 Sin contestar (a preguntar): ${escapeHtml(a.sinContestar.join(' · ').slice(0, 600))}`)
  }
  for (const c of e.conflictos ?? []) l.push(`⚠️ ${escapeHtml(c)}`)
  if (e.confirmado) l.push('🔒 Datos del riesgo confirmados: no se han tocado (lo declarado está en «Datos pedidos»).')
  else if (e.anotados === null) l.push('⚠️ No se han podido pasar al riesgo de la oportunidad: están en «Datos pedidos».')
  else if (e.anotados > 0) {
    const cambiados = e.cambiados ?? []
    l.push(`✍️ ${e.anotados} dato${e.anotados === 1 ? '' : 's'} pasados al riesgo (sin confirmar; ${cambiados.length === 0 ? 'lo que ya tenías no se ha tocado' : `⚠️ se ha cambiado lo que ya había en: ${escapeHtml(cambiados.join(', '))}`}).`)
  }
  l.push(`👉 <a href="${escapeHtml(e.enlaceFicha)}">abrir ficha</a>`)
  return l.join('\n')
}
