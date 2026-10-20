// Aviso de Telegram para un correo de COMPAÑÍA que no es una devolución (14/10/2026). PURO.
//
// El triaje lee el correo (`leerCorreoEventoAseguradora`: siniestro, pre-anulación, impago, anulación,
// suplemento, emisión, solicitud), asegura lo aplica a la cartera (`POST /api/operador/correo/evento`) y este aviso dice
// QUÉ SE HIZO con cada elemento: «siniestro 43000001 abierto en la ficha», «tarea creada, vence
// 15/10/2026», «póliza no encontrada → bandeja». Si el puerto no contestó, el aviso sale igual con lo
// leído del correo y lo dice (nunca se da por hecho lo que no consta).
//
// Sin IBAN ni NIF: el lector ya los quita; aquí solo se pintan números de póliza/recibo/siniestro,
// importes, fechas y el nombre del tomador que devuelve asegura (como el aviso de devoluciones).

import type { EventoAseguradora } from '@central/module-seguros'
import { eur } from '../dinero.ts'

export type EstadoEventoPuerto = 'aplicado' | 'duplicado_cima' | 'sin_resolver' | 'procesando'

export type ResultadoPuertoEvento = {
  clave: string
  estado: EstadoEventoPuerto
  repetido: boolean
  resumen: string | null
  motivo: string | null
  clienteId: string | null
  cliente: string | null
  numeroPoliza: string | null
  tareaVence: string | null
}

const ESTADOS: readonly EstadoEventoPuerto[] = ['aplicado', 'duplicado_cima', 'sin_resolver', 'procesando']

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Lee la respuesta del puerto sin fiarse de su forma: una fila rara se descarta, no se inventa. */
export function leerResultadosEvento(json: unknown): ResultadoPuertoEvento[] | null {
  if (typeof json !== 'object' || json === null) return null
  const r = (json as Record<string, unknown>).resultados
  if (!Array.isArray(r)) return null
  const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
  return r.flatMap((x): ResultadoPuertoEvento[] => {
    if (typeof x !== 'object' || x === null) return []
    const o = x as Record<string, unknown>
    const estado = ESTADOS.find((e) => e === o.estado)
    const clave = txt(o.clave)
    if (!estado || !clave) return []
    const vence = txt(o.tareaVence)
    return [{
      clave, estado, repetido: o.repetido === true, resumen: txt(o.resumen), motivo: txt(o.motivo),
      clienteId: txt(o.clienteId), cliente: txt(o.cliente), numeroPoliza: txt(o.numeroPoliza),
      tareaVence: vence && /^\d{4}-\d{2}-\d{2}$/.test(vence) ? vence : null,
    }]
  })
}

/**
 * ¿asegura CONFIRMÓ que el aviso quedó en la ficha? Solo `aplicado` o `duplicado_cima`. Con todo
 * `sin_resolver`/`procesando` (o sin respuesta) la cartera no tiene nada: el triaje deja su nota genérica
 * como red, que es lo que había antes de los eventos.
 */
export function eventoConfirmado(resultados: readonly ResultadoPuertoEvento[] | null): boolean {
  return resultados !== null && resultados.some((r) => r.estado === 'aplicado' || r.estado === 'duplicado_cima')
}

const COMPANIA: Record<string, string> = { reale: 'Reale', occident: 'Occident', mapfre: 'Mapfre', allianz: 'Allianz' }

/** Lo leído del correo, elemento a elemento (con la MISMA clave que usa asegura). */
type Leido = { clave: string; linea: string }

function leidos(e: EventoAseguradora): Leido[] {
  if (e.tipo === 'siniestro') {
    return e.siniestros.map((s) => ({
      clave: s.numeroSiniestro,
      linea: `Siniestro ${esc(s.numeroSiniestro)} (${s.subtipo === 'apertura' ? 'apertura' : s.subtipo === 'cierre' ? 'cierre' : 'actualización'})${s.numeroPoliza ? ` · póliza ${esc(s.numeroPoliza)}` : ''}${s.accion ? ` · ${esc(s.accion.slice(0, 120))}` : ''}`,
    }))
  }
  if (e.tipo === 'pre_anulacion' || e.tipo === 'impago') {
    return e.recibos.map((r) => ({
      clave: r.idRecibo ? `${r.numeroPoliza}/${r.idRecibo}` : r.numeroPoliza,
      linea: `Póliza ${esc(r.numeroPoliza)}${r.idRecibo ? ` · recibo ${esc(r.idRecibo)}` : ''}${r.importe !== null ? ` · ${eur(r.importe)}` : ''}${r.fechaLimite ? ` · ${e.tipo === 'pre_anulacion' ? 'anula' : 'plazo'} ${fechaEs(r.fechaLimite)}` : ''}`,
    }))
  }
  if (e.tipo === 'anulacion') {
    return [{
      clave: e.numeroPoliza ?? 'sin-poliza',
      linea: `Póliza ${e.numeroPoliza ? esc(e.numeroPoliza) : '(sin nº)'}${e.fechaEfecto ? ` · efecto ${fechaEs(e.fechaEfecto)}` : ''}${e.motivo ? ` · ${esc(e.motivo)}` : ''}`,
    }]
  }
  if (e.tipo === 'solicitud') {
    // Estado de una solicitud en la compañía: asegura la casa con la OPORTUNIDAD que lleva ese nº (no con una póliza).
    // La clave es el nº SIN ceros de relleno (la misma que usa asegura).
    return [{
      clave: e.numeroSolicitud.replace(/^0+/, ''),
      linea: `Solicitud ${esc(e.numeroSolicitud)}${e.ramo ? ` · ${esc(e.ramo)}` : ''}${e.url ? ` · <a href="${esc(e.url)}">abrir en ${COMPANIA[e.compania] ?? esc(e.compania)}</a>` : ''}`,
    }]
  }
  if (e.tipo === 'emision') {
    // Póliza NUEVA: asegura no la crea (CIMA es la fuente); solo dice si CIMA ya la trae.
    return e.polizas.map((p) => ({
      clave: p.numeroPoliza,
      linea: `Póliza nueva emitida: ${esc(p.numeroPoliza)}${p.producto ? ` · ${esc(p.producto)}` : ''}${p.fechaEfecto ? ` · efecto ${fechaEs(p.fechaEfecto)}` : ''}${p.prima !== null ? ` · ${eur(p.prima)}` : ''}`,
    }))
  }
  return [{ clave: e.numeroPoliza, linea: `Póliza ${esc(e.numeroPoliza)}${e.descripcion ? ` · ${esc(e.descripcion.slice(0, 120))}` : ''}` }]
}

function titulo(e: EventoAseguradora): string {
  if (e.tipo === 'siniestro') return e.siniestros.length === 1 ? 'Siniestro' : `${e.siniestros.length} siniestros`
  if (e.tipo === 'pre_anulacion') return e.recibos.length === 1 ? 'Recibo a punto de ANULARSE' : `${e.recibos.length} recibos a punto de ANULARSE`
  if (e.tipo === 'impago') return 'Impago: la compañía DELEGA el cobro'
  if (e.tipo === 'anulacion') return 'Póliza ANULADA por la compañía'
  if (e.tipo === 'emision') return e.polizas.length === 1 ? 'Póliza nueva emitida' : `${e.polizas.length} pólizas nuevas emitidas`
  if (e.tipo === 'solicitud') return 'Solicitud en la compañía'
  return 'Suplemento'
}

function lineaResultado(r: ResultadoPuertoEvento, urlFicha: (id: string) => string): string {
  const marca = r.estado === 'aplicado' ? (r.tareaVence ? '📞' : '✅') : r.estado === 'duplicado_cima' ? 'ℹ️' : r.estado === 'sin_resolver' ? '❔' : '⚠️'
  const quien = r.cliente ? `<b>${esc(r.cliente)}</b>: ` : ''
  const que = r.resumen
    ?? (r.estado === 'sin_resolver' ? 'póliza no encontrada → bandeja' : r.estado === 'procesando' ? 'sin desenlace confirmado: míralo' : 'hecho')
  const ficha = r.clienteId ? ` · <a href="${esc(urlFicha(r.clienteId))}">ficha</a>` : ''
  const rep = r.repetido ? ' · (correo ya procesado antes)' : ''
  return `  ${marca} ${quien}${esc(que)}${ficha}${rep}`
}

/**
 * `resultados === null` = el puerto no contestó (o falta config/migración): se avisa con lo leído y se
 * dice que la cartera NO lo sabe.
 */
export function textoAvisoEvento(
  evento: EventoAseguradora,
  asunto: string,
  resultados: ResultadoPuertoEvento[] | null,
  urlFicha: (clienteId: string) => string,
  fallo: { estado: 'rechazado' | 'sin_respuesta'; motivo: string } | null = null,
): string {
  const cia = COMPANIA[evento.compania] ?? esc(evento.compania)
  // Solicitud (20/10/2026): «📨 Occident · Solicitud N · <tomador> · <estado>». El tomador sale del asunto (que el
  // aviso ya pinta en los demás tipos) y NO se guarda en asegura.
  const lineas: string[] = evento.tipo === 'solicitud'
    ? [[`📨 <b>${cia}</b>`, `Solicitud ${esc(evento.numeroSolicitud)}`, evento.tomador ? esc(evento.tomador) : null, evento.estado ? `<b>${esc(evento.estado)}</b>` : 'estado no reconocido (míralo en el correo)']
        .filter((x): x is string => x !== null).join(' · ')]
    : [`🏢 <b>${titulo(evento)}</b> — ${cia}`, esc(asunto.slice(0, 160))]
  const items = leidos(evento)
  for (const i of items) {
    lineas.push(`• ${i.linea}`)
    if (resultados === null) continue
    const r = resultados.find((x) => x.clave === i.clave)
    lineas.push(r ? lineaResultado(r, urlFicha) : '  ⚠️ asegura no devolvió este elemento: míralo en el correo.')
  }
  if (items.length === 0) lineas.push('⚠️ No he sabido leer ningún elemento del correo: míralo.')
  if (evento.ilegibles > 0) lineas.push(`⚠️ ${evento.ilegibles} trozo(s) del correo no se han sabido leer: míralo.`)
  const sinResolver = resultados?.filter((r) => r.estado === 'sin_resolver' || r.estado === 'procesando').length ?? 0
  if (sinResolver > 0) {
    lineas.push(evento.tipo === 'solicitud'
      ? '➡️ Ninguna oportunidad lleva ese nº: apúntalo en la oportunidad (Mi mesa → «Nº solicitud…») y el correo se engancha solo.'
      : `➡️ ${sinResolver === 1 ? 'Queda 1' : `Quedan ${sinResolver}`} en «Correos de compañía» de Mi mesa.`)
  }
  if (resultados === null && items.length > 0) {
    lineas.push(fallo?.estado === 'rechazado'
      ? `⚠️ asegura RECHAZÓ el aviso (${esc(fallo.motivo)}): la cartera NO lo sabe. Anótalo a mano.`
      : `⚠️ No se pudo confirmar en la cartera (${esc(fallo?.motivo ?? 'asegura no contestó')}): puede que no se haya guardado nada. Revisa la ficha.`)
  }
  return lineas.join('\n')
}
