// Acciones del día a día desde el asistente de la correduría por Telegram (27/09/2026) — parte PURA
// (sin `@/` ni prisma → node --test). La parte con BD y red vive en `correduria-asistente-telegram.ts`.
//
// Alberto: «tiene que ser mi asistente». Cinco acciones que hasta hoy solo se hacían en /correduria:
// crear una tarea, registrar una llamada, anotar una nota en la ficha, abrir un siniestro e invitar al
// portal. Mismo principio que emitir o corregir: la IA PROPONE, el servidor valida lo que puede
// validar aquí, lo ENSEÑA, y Alberto lo hace con un botón de un solo uso. La escritura va por los
// mismos puertos que la ficha, que vuelven a validar (el motivo de un 422 se le dice tal cual).
import { MOTIVOS_PERDIDA_VENTA, RESULTADOS_LLAMADA, TIPOS_SINIESTRO, TIPOS_TAREA } from '@central/module-seguros'

export type TipoAccion = 'tarea' | 'llamada' | 'nota' | 'siniestro' | 'portal'
export const TIPOS_ACCION: readonly TipoAccion[] = ['tarea', 'llamada', 'nota', 'siniestro', 'portal']

/** Motivos por los que no le interesa: los mismos que acepta el puerto (sin «error de alta»). */
export const MOTIVOS_NO_INTERESA = MOTIVOS_PERDIDA_VENTA

export type Accion = {
  tipo: TipoAccion
  /** Lo que se manda al puerto, SIN el actor (lo pone el servidor al pulsar). */
  cuerpo: Record<string, unknown>
  /** Las líneas del «qué voy a hacer» que ve Alberto antes de pulsar. */
  lineas: string[]
}

export type Preparacion = { ok: true; accion: Accion } | { ok: false; motivo: string }

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const FECHA_HORA = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?$/

function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null
}

function fechaValida(v: unknown): string | null {
  if (typeof v !== 'string' || !FECHA.test(v.trim())) return null
  const s = v.trim()
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Lo que manda la IA → el cuerpo del puerto y el resumen. Aquí se valida lo que no necesita la BD
 * (enums, fechas, textos vacíos); lo demás (que la oportunidad esté abierta, que la póliza sea de
 * esta correduría, que el correo resuelva a la ficha) lo dice el puerto al pulsar.
 */
export function prepararAccion(tipo: TipoAccion, args: Record<string, unknown>, hoy: string): Preparacion {
  switch (tipo) {
    case 'tarea': {
      const t = TIPOS_TAREA.find((x) => x === args.tipo) ?? 'llamada'
      const fecha = fechaValida(args.fecha)
      if (!fecha) return { ok: false, motivo: 'falta la fecha de la tarea (aaaa-mm-dd): pregúntale cuándo' }
      if (fecha < hoy) return { ok: false, motivo: 'la fecha de la tarea ya ha pasado' }
      const obs = texto(args.observaciones, 500)
      if (!obs) return { ok: false, motivo: 'falta qué hay que hacer (observaciones)' }
      return {
        ok: true,
        accion: {
          tipo,
          cuerpo: { oportunidadId: args.oportunidadId, tipo: t, fechaLimite: fecha, observaciones: obs, prioridad: 'media' },
          lineas: [`📌 Tarea (${t}) para el ${fechaEs(fecha)}`, `«${escapar(obs)}»`],
        },
      }
    }
    case 'llamada': {
      const resultado = RESULTADOS_LLAMADA.find((x) => x === args.resultado)
      if (!resultado) return { ok: false, motivo: `resultado no válido; uno de: ${RESULTADOS_LLAMADA.join(', ')}` }
      const nota = texto(args.nota, 500)
      const cuerpo: Record<string, unknown> = { oportunidadId: args.oportunidadId, resultado, nota }
      const l = [`📞 Llamada: ${ROTULO_RESULTADO[resultado]}`]
      if (resultado === 'otro_dia') {
        const v = fechaValida(args.volverEl)
        if (!v || v <= hoy) return { ok: false, motivo: 'para «otro día» hace falta la fecha en que volver a llamar (futura, aaaa-mm-dd)' }
        cuerpo.volverEl = v
        l.push(`Volver a llamar el ${fechaEs(v)}`)
      }
      if (resultado === 'no_interesa') {
        const m = MOTIVOS_NO_INTERESA.find((x) => x === args.motivo)
        if (!m) return { ok: false, motivo: `di por qué no le interesa; uno de: ${MOTIVOS_NO_INTERESA.join(', ')}` }
        if (m === 'otro' && !nota) return { ok: false, motivo: 'con motivo «otro» hace falta una nota que lo explique' }
        cuerpo.motivo = m
        l.push(`Motivo: ${m.replace('_', ' ')}`)
      }
      if (nota) l.push(`Nota: «${escapar(nota)}»`)
      return { ok: true, accion: { tipo, cuerpo, lineas: l } }
    }
    case 'nota': {
      const t = texto(args.texto, 1000)
      if (!t) return { ok: false, motivo: 'falta el texto de la nota' }
      const clase = args.tipoNota === 'contacto' || args.tipoNota === 'gestion' ? args.tipoNota : 'nota'
      return { ok: true, accion: { tipo, cuerpo: { clienteId: args.clienteId, tipo: clase, texto: t }, lineas: [`📝 Anotar en la ficha (${clase}):`, `«${escapar(t)}»`] } }
    }
    case 'siniestro': {
      const tipoS = TIPOS_SINIESTRO.find((x) => x.clave === args.tipo)
      if (!tipoS) return { ok: false, motivo: `tipo de siniestro no válido; uno de: ${TIPOS_SINIESTRO.map((x) => x.clave).join(', ')}` }
      const fh = typeof args.fechaHora === 'string' && FECHA_HORA.test(args.fechaHora.trim()) ? args.fechaHora.trim() : null
      if (!fh || !fechaValida(fh.slice(0, 10))) return { ok: false, motivo: 'falta cuándo pasó (aaaa-mm-dd o aaaa-mm-dd hh:mm)' }
      if (fh.slice(0, 10) > hoy) return { ok: false, motivo: 'la fecha del siniestro no puede ser futura' }
      const desc = texto(args.descripcion, 2000)
      if (!desc || desc.length < 10) return { ok: false, motivo: 'falta qué ha pasado (descripción de al menos una frase)' }
      const ciudad = texto(args.lugarCiudad, 120)
      const culpable = typeof args.seConsideraCulpable === 'boolean' ? args.seConsideraCulpable : null
      const cuerpo: Record<string, unknown> = {
        polizaId: args.polizaId, tipo: tipoS.clave, fechaHora: fh.length === 10 ? `${fh}T00:00` : fh.replace(' ', 'T'),
        descripcion: desc, lugarCiudad: ciudad, seConsideraCulpable: culpable,
      }
      const l = [`🚨 Abrir siniestro: ${escapar(tipoS.etiqueta)}`, `Cuándo: ${fechaEs(fh.slice(0, 10))}${fh.length > 10 ? ` ${fh.slice(11, 16)}` : ''}`]
      if (ciudad) l.push(`Dónde: ${escapar(ciudad)}`)
      if (culpable !== null) l.push(`¿Culpable?: ${culpable ? 'sí' : 'no'}`)
      l.push(`«${escapar(desc)}»`)
      return { ok: true, accion: { tipo, cuerpo, lineas: l } }
    }
    case 'portal':
      return { ok: true, accion: { tipo, cuerpo: { clienteId: args.clienteId }, lineas: ['🔑 Mandarle por correo el enlace al portal del cliente (sus seguros, recibos y partes).'] } }
  }
}

const ROTULO_RESULTADO: Record<(typeof RESULTADOS_LLAMADA)[number], string> = {
  quiere_precio: 'quiere precio (tarea: preparar la comparativa)',
  otro_dia: 'que le llame otro día',
  no_contesta: 'no contesta (se reintenta sola)',
  no_interesa: 'no le interesa (se aparca)',
}

/** El mensaje con el botón. `quien` es lo que identifica la ficha (nombre, póliza, ramo…). */
export function textoAccion(quien: string, a: Accion): string {
  const aviso = a.tipo === 'portal' ? '\n⚠️ Esto SÍ manda un correo al cliente.' : ''
  return [`🧾 ¿Lo hago? · ${escapar(quien)}`, ...a.lineas].join('\n') + aviso
}

/** Qué se le dice a Alberto tras pulsar. Sin respuesta clara: «no sé si se ha hecho», nunca «no se ha hecho». */
export function resultadoAccion(
  tipo: TipoAccion, status: number, json: unknown, url: string,
): { estado: 'hecha' | 'rechazada' | 'incierta'; texto: string } {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  const motivo = typeof o?.motivo === 'string' ? o.motivo : typeof o?.estado === 'string' ? o.estado : null
  const bien = status >= 200 && status < 300 && (o?.estado === undefined || o?.estado === 'ok')
  if (bien) {
    const extra = tipo === 'siniestro' && typeof o?.aviso === 'string' && o.aviso ? `\n⚠️ ${escapar(o.aviso)}` : ''
    return { estado: 'hecha', texto: `✅ ${HECHO[tipo]}${extra}\n${url}` }
  }
  if (status === 0 || status >= 500) {
    const envio = tipo === 'portal' ? ' No lo repitas sin mirar: el cliente podría recibir dos correos.' : ''
    return { estado: 'incierta', texto: `⚠️ No sé si se ha hecho (la cartera no ha contestado bien${motivo ? `: ${escapar(motivo)}` : ''}). Míralo en la ficha.${envio}\n${url}` }
  }
  return { estado: 'rechazada', texto: `✋ No se ha hecho: ${escapar(motivo ?? `HTTP ${status}`)}\n${url}` }
}

const HECHO: Record<TipoAccion, string> = {
  tarea: 'Tarea creada: saldrá en «Hoy» el día que toque.',
  llamada: 'Llamada registrada, con su siguiente paso.',
  nota: 'Nota anotada en la ficha.',
  siniestro: 'Siniestro abierto en la ficha. Recuerda comunicarlo a la compañía.',
  portal: 'Invitación al portal enviada por correo.',
}
