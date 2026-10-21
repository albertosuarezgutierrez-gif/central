// A quién se le puede mandar el presupuesto por correo si el TOMADOR no tiene (21/10/2026, regla de Alberto). La REGLA
// es pura y vive en `@central/module-seguros` (`destinatarios-presupuesto.ts`); aquí solo se lee la BD, siempre con
// `correduriaId` explícito y sin fichas fusionadas. La usan:
//   · `GET /api/operador/presupuesto/destinatarios` (lo que pinta el selector de plataforma);
//   · `envio-presupuesto.ts`, que VUELVE a calcularla en el servidor antes de mandar: el `destinatarioClienteId` que
//     llega de la pantalla no se cree.
//
// `puedeVerPolizas` llega CALCULADO desde `portal_autorizacion` vigente (`filasDe` de `cartera-relaciones.ts`), que es
// lo que hoy significa «A autoriza a B a ver sus pólizas»; la columna homónima es dato muerto.

import {
  destinatariosPresupuesto, type CanalDestino, type DestinatariosPresupuesto, type EstadoCorreoPersona, type EstadoMovilPersona,
  type PersonaDestino, type TipoPersonaFicha,
} from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { filasDe } from './cartera-relaciones'
import { estadoEmailDeFicha, type EmailDeFicha } from './email-ficha'
import { movilDeFicha, type MovilDeFicha } from './presupuesto-codigo-whatsapp'

function correoDe(e: EmailDeFicha): EstadoCorreoPersona {
  if (e.estado === 'ok') return 'con_email'
  if (e.estado === 'baja_de_correo') return 'baja_de_correo'
  if (e.estado === 'sin_email') return 'sin_email'
  // `ilegible` (y `no_encontrado`, que aquí no llega: se filtra antes) = no se sabe, nunca «no tiene».
  return 'no_se_sabe'
}

function movilDe(m: MovilDeFicha): EstadoMovilPersona {
  // `ilegible` = no se sabe, nunca «no tiene» (se arregla en Vercel). `no_encontrado` se filtra antes.
  return m === 'ok' ? 'con_movil' : m === 'sin_movil' ? 'sin_movil' : 'no_se_sabe'
}

function tipoPersona(v: string | null | undefined): TipoPersonaFicha {
  return v === 'juridica' ? 'juridica' : v === 'fisica' ? 'fisica' : null
}

function nombreCompleto(c: { nombre: string | null; apellidos: string | null }): string | null {
  const n = [c.nombre, c.apellidos].filter((s) => typeof s === 'string' && s.trim() !== '').join(' ').trim()
  return n === '' ? null : n
}

export type LecturaDestinatarios = {
  destinatarios: DestinatariosPresupuesto
  /** El correo de cada ELEGIBLE (para que Alberto vea a qué dirección va; el puerto sí deja cruzar el email). */
  emails: Record<string, string>
  /** El tomador es empresa EXPLÍCITA (`tipo_persona = 'juridica'`; NULL no lo es). Cambia cómo se nombra al contacto. */
  tomadorJuridica: boolean
  /**
   * Solo por WhatsApp (21/10/2026, idea 4): ¿tiene el TOMADOR un móvil válido? Para que la pantalla diga si su chat se abre
   * con número. 🚨 Ningún TELÉFONO cruza aquí (ni el del tomador ni el de los contactos): el número del elegido solo sale
   * en el `wa.me` del envío, después de que asegura vuelva a validar la regla.
   */
  movilTomador?: EstadoMovilPersona
}

/**
 * `null` = el tomador no existe en esta correduría (o está fusionado). Un fallo de BD LANZA: no es «nadie».
 * `canal = 'whatsapp'`: la misma regla, mirando el MÓVIL de cada candidato en vez de su correo (`destinatarios-presupuesto.ts`
 * de module-seguros); `emails` va vacío.
 */
export async function leerDestinatarios(correduriaId: string, tomadorId: string, canal: CanalDestino = 'email'): Promise<LecturaDestinatarios | null> {
  const db = prismaAsegura()
  const t = await db.cliente.findFirst({ where: { id: tomadorId, correduriaId, mergedIntoClienteId: null }, select: { id: true, tipoPersona: true } })
  if (!t) return null
  const correoTomador = await estadoEmailDeFicha(correduriaId, tomadorId)
  if (correoTomador.estado === 'no_encontrado') return null
  const tomador = { clienteId: t.id, tipoPersona: tipoPersona(t.tipoPersona), correo: correoDe(correoTomador) }
  // Con correo del tomador (o ilegible, o de baja) no se lee a nadie más: la regla ya no mira terceros.
  const tomadorJuridica = tomador.tipoPersona === 'juridica'
  if (canal === 'whatsapp') return leerDestinatariosWhatsapp(correduriaId, tomador, tomadorJuridica)
  if (tomador.correo !== 'sin_email') return { destinatarios: destinatariosPresupuesto(tomador, [], []), emails: {}, tomadorJuridica }

  const filas = await filasDe(correduriaId, tomadorId)
  const ids = [...new Set(filas.flatMap((f) => [f.clienteAId, f.clienteBId]).filter((id) => id !== tomadorId))]
  const otros = ids.length === 0 ? [] : await db.cliente.findMany({
    where: { id: { in: ids }, correduriaId, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true, tipoPersona: true },
  })
  const emails: Record<string, string> = {}
  const personas: PersonaDestino[] = []
  for (const o of otros) {
    const e = await estadoEmailDeFicha(correduriaId, o.id)
    if (e.estado === 'no_encontrado') continue
    if (e.estado === 'ok') emails[o.id] = e.email
    personas.push({ clienteId: o.id, nombre: nombreCompleto(o), tipoPersona: tipoPersona(o.tipoPersona), correo: correoDe(e) })
  }
  const destinatarios = destinatariosPresupuesto(tomador, filas, personas)
  const elegibles = new Set(destinatarios.estado === 'contactos' ? destinatarios.elegibles.map((x) => x.clienteId) : [])
  // Solo cruza el correo de quien PUEDE recibir: el de los no elegibles no hace falta para nada.
  for (const id of Object.keys(emails)) if (!elegibles.has(id)) delete emails[id]
  return { destinatarios, emails, tomadorJuridica }
}

/**
 * Por WhatsApp: los mismos candidatos (relaciones vivas de esta correduría, sin fusionadas) con su estado de MÓVIL. El
 * correo de los candidatos no se mira (`correo: 'no_se_sabe'` = no mirado; por WhatsApp no cuenta).
 */
async function leerDestinatariosWhatsapp(
  correduriaId: string, tomador: { clienteId: string; tipoPersona: TipoPersonaFicha; correo: EstadoCorreoPersona }, tomadorJuridica: boolean,
): Promise<LecturaDestinatarios | null> {
  const db = prismaAsegura()
  const movilT = await movilDeFicha(correduriaId, tomador.clienteId)
  if (movilT === 'no_encontrado') return null
  const filas = await filasDe(correduriaId, tomador.clienteId)
  const ids = [...new Set(filas.flatMap((f) => [f.clienteAId, f.clienteBId]).filter((id) => id !== tomador.clienteId))]
  const otros = ids.length === 0 ? [] : await db.cliente.findMany({
    where: { id: { in: ids }, correduriaId, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true, tipoPersona: true },
  })
  const personas: PersonaDestino[] = []
  for (const o of otros) {
    const m = await movilDeFicha(correduriaId, o.id)
    if (m === 'no_encontrado') continue
    personas.push({ clienteId: o.id, nombre: nombreCompleto(o), tipoPersona: tipoPersona(o.tipoPersona), correo: 'no_se_sabe', movil: movilDe(m) })
  }
  return { destinatarios: destinatariosPresupuesto(tomador, filas, personas, 'whatsapp'), emails: {}, tomadorJuridica, movilTomador: movilDe(movilT) }
}
