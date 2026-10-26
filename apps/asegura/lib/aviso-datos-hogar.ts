// Aviso por Telegram cuando el cliente COMPLETA el enlace de datos de HOGAR (25/10/2026). PURO.
//
// El aviso general («📝 El cliente completó los datos para su presupuesto de …», por el aviso de actividad) sale
// para todos los ramos; este añade, solo para hogar, el resumen para tarificar sin abrir nada: dirección, Catastro,
// régimen/uso, contenido, alarma, hipoteca (🔴 si el seguro es para el certificado del banco: va de beneficiario),
// seguro actual con su vencimiento y efecto deseado.
//
// Va a la conversación de Alberto (no a terceros). Nunca lleva DNI ni fecha de nacimiento. Todo lo tecleado, escapado.
// `null` = el cliente no lo dijo: se escribe «sin dato», nunca «no» ni 0.

import { escapeHtml } from '@central/core-telegram'
import {
  REGIMENES_HOGAR_SOLICITUD,
  TIPOS_VIVIENDA_SOLICITUD,
  TRAMOS_CONTENIDO,
  TRAMOS_CONTINENTE,
  USOS_HOGAR_SOLICITUD,
  camposAPreguntar,
  type CampoSolicitud,
  direccionDeRespuestas,
  direccionLegible,
  textoCatastroSolicitud,
  type CatastroSolicitud,
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
const etiqueta = (lista: readonly { valor: string; etiqueta: string }[], v: Respuesta | undefined): string =>
  lista.find((o) => o.valor === v)?.etiqueta ?? 'sin dato'

export type EntradaAvisoDatosHogar = {
  respuestas: Record<string, Respuesta>
  catastro: CatastroSolicitud | null
  /** Tipo de vivienda deducido del Catastro (26/10/2026); `null`/ausente = no se dedujo. */
  deducida?: { tipo: string | null; aviso: string | null; ultimoPiso?: string | null } | null
  /** Campos que se pidieron: para listar lo que queda «a preguntar» (vacíos y «No lo sé»). */
  campos?: readonly CampoSolicitud[]
  /** Enlace a la ficha en plataforma (`/correduria/cliente/<id>`). */
  enlaceFicha: string
  /** Los datos son de otra persona del riesgo (con su consentimiento). */
  tercero: boolean
  /** Qué se ha podido escribir en el riesgo de la oportunidad (`null` = no se pudo). */
  anotados: number | null
  /** Lo que NO se escribió por chocar con lo guardado (dirección o referencia distintas…). */
  conflictos?: string[]
  /** Los datos de la vivienda estaban confirmados por Alberto: no se han tocado. */
  confirmado?: boolean
}

/** El tipo: lo que dijo el cliente, o lo deducido del Catastro (y si lo confirmó). */
function tipoTexto(r: Record<string, Respuesta>, d: { tipo: string | null } | null): string {
  const del = (v: unknown) => TIPOS_VIVIENDA_SOLICITUD.find((o) => o.valor === v)?.etiqueta ?? (v === 'unifamiliar' ? 'Casa (adosada o independiente)' : null)
  const dicho = del(r.tipoVivienda)
  if (dicho) return `${dicho} (declarado)`
  const deducido = d ? del(d.tipo) : null
  if (!deducido) return 'sin dato'
  return `${deducido} (Catastro, ${r.confirmaCatastro === true ? 'confirmado por el cliente' : 'sin confirmar'})`
}

/** Un capital: el importe tecleado (enlaces de antes) o el tramo elegido con lo que se anota. */
function capitalTexto(importe: Respuesta | undefined, tramos: readonly { valor: string; etiqueta: string; importe: number | null }[], tramo: Respuesta | undefined): string {
  if (typeof importe === 'number') return eur(importe)
  const t = tramos.find((x) => x.valor === tramo)
  if (!t) return 'sin dato'
  return t.importe === null ? `${t.etiqueta} (a calcular)` : `${t.etiqueta} (se anota ${eur(t.importe)})`
}

/** `true` si el seguro es para el certificado del banco: es lo que más prisa corre y lo que más se equivoca. */
export function esParaBanco(r: Record<string, Respuesta>): boolean {
  return r.hipoteca === true && r.paraBanco === true
}

export function textoAvisoDatosHogar(e: EntradaAvisoDatosHogar): string {
  const r = e.respuestas
  const lineas: string[] = [`🏠 <b>Hogar: ${e.tercero ? 'datos de la otra persona recibidos' : 'el cliente completó sus datos'}</b>`]
  const d = direccionDeRespuestas(r)
  lineas.push(`📍 ${d ? escapeHtml(direccionLegible(d)) : 'sin dirección'}${d && !(d.viaTipo && d.viaNombre) ? ' (calle escrita a mano, por validar)' : ''}`)
  lineas.push(`🗺️ ${escapeHtml(textoCatastroSolicitud(e.catastro))}`)
  // «Último piso» ≠ «ático» (26/10/2026): un último piso numérico es un piso, y se dice aparte.
  lineas.push(`🏠 Tipo: ${tipoTexto(r, e.deducida ?? null)}${e.deducida?.ultimoPiso === 'ultimo' && (r.tipoVivienda ?? e.deducida.tipo) === 'piso' ? ' · último piso del edificio (Catastro)' : ''}`)
  if (e.deducida?.aviso) lineas.push(escapeHtml(e.deducida.aviso))
  lineas.push(`🏷️ ${etiqueta(REGIMENES_HOGAR_SOLICITUD, r.regimen)} · ${etiqueta(USOS_HOGAR_SOLICITUD, r.usoVivienda)} · habitaciones: ${typeof r.habitaciones === 'number' ? r.habitaciones : 'sin dato'}`)
  lineas.push(`🛋️ Contenido: ${capitalTexto(r.valorContenido, TRAMOS_CONTENIDO, r.tramoContenido)} · continente: ${capitalTexto(null, TRAMOS_CONTINENTE, r.tramoContinente)}`)
  lineas.push(`🔐 Alarma: ${siNo(r.alarma)} · puerta blindada: ${siNo(r.puertaPrincipalBlindada)} · rejas: ${siNo(r.ventanasSeguras)} · urb. cerrada: ${siNo(r.urbanizacionCerrada)}`)
  if (r.hipoteca === true) {
    const banco = txt(r.entidadHipoteca)
    if (esParaBanco(r)) {
      lineas.push(`🔴 <b>Para el certificado del banco</b>: ${banco ? `${escapeHtml(banco)} de beneficiario` : 'entidad SIN DATO (pídesela)'}`)
    } else {
      lineas.push(`🏦 Hipoteca: sí${banco ? ` (${escapeHtml(banco)})` : ''} · ${r.paraBanco === false ? 'no es para el banco' : '¿para el banco? sin dato'}`)
    }
  } else {
    lineas.push(`🏦 Hipoteca: ${siNo(r.hipoteca)}`)
  }
  if (r.tieneSeguro === true) {
    const comp = txt(r.companiaActual)
    const vence = fechaEs(r.vencimientoActual)
    lineas.push(`📄 Seguro actual: ${comp ? escapeHtml(comp) : 'compañía sin dato'} · ${vence ? `vence el ${vence}` : 'vencimiento sin dato'}`)
  } else {
    lineas.push(`📄 Seguro actual: ${r.tieneSeguro === false ? 'no tiene' : 'sin dato'}`)
  }
  const efecto = fechaEs(r.fechaEfecto)
  lineas.push(`📅 Efecto deseado: ${efecto ?? 'sin fecha'}`)
  const comentario = txt(r.comentario)
  if (comentario) lineas.push(`💬 ${escapeHtml(comentario.slice(0, 300))}`)
  if (e.campos) {
    const a = camposAPreguntar(e.campos, r)
    if (a.noLoSabe.length > 0) lineas.push(`❓ No lo sabe (a preguntar): ${escapeHtml(a.noLoSabe.join(' · ').slice(0, 600))}`)
    if (a.sinContestar.length > 0) lineas.push(`📞 Sin contestar (a preguntar): ${escapeHtml(a.sinContestar.join(' · ').slice(0, 600))}`)
  }
  for (const c of e.conflictos ?? []) lineas.push(`⚠️ ${escapeHtml(c)}`)
  if (e.confirmado) lineas.push('🔒 Datos de la vivienda confirmados: no se han tocado (lo declarado está en «Datos pedidos»).')
  else if (e.anotados === null) lineas.push('⚠️ No se han podido pasar al riesgo de la oportunidad: están en «Datos pedidos».')
  else if (e.anotados > 0) lineas.push(`✍️ ${e.anotados} dato${e.anotados === 1 ? '' : 's'} pasados al riesgo (sin confirmar; lo que ya tenías no se ha tocado).`)
  lineas.push(`👉 <a href="${escapeHtml(e.enlaceFicha)}">abrir ficha</a>`)
  return lineas.join('\n')
}
