// Patrimonio (27/10/2026) — adaptador con BD de `autorizar-tercero-api.ts` (el titular autoriza a otra persona sobre su patrimonio).
// SQL: `2026-10-27_portal_invitacion_patrimonio.sql` (amplía el CHECK de alcance de `portal_invitacion`; `portal_autorizacion` ya
// admite los dos alcances desde `2026-10-22_portal_patrimonio.sql` §15).
//
// 🚨 Frontera: los titulares salen de `titularesAutorizables(identidadId)` (cookie + `portal_vinculo`, que a su vez pasa por
// `accesosPatrimonio`): ningún `clienteId` de la request consulta nada. Toda lectura de `portal_invitacion`/`portal_autorizacion`
// lleva DENTRO del `where` o esos titulares o la identidad de la sesión. Sin RLS que rescate un olvido.
// 🚨 Nada se borra: retirar y revocar son sellos.
import { randomBytes } from 'node:crypto'

import { ALCANCES_PATRIMONIO, alcancePatrimonio } from '@central/module-patrimonio'
import { BYTES_TOKEN_INVITACION, caducidadInvitacion, estadoAutorizacion } from '@central/module-seguros-portal'

import { hashCanal } from '../auth'
import { enlaceDeInvitacion, enviarInvitacion } from '../correo-invitacion'
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { fichasDeTitulares, titularesAutorizables } from './accesos'
import type { AccesoConcedido, AccesoRecibido, InvitacionPendiente, PuertosAutorizarPatrimonio } from './autorizar-tercero-api.ts'

/** Un `in []` nunca deja un `where` sin filtro si alguien lo mueve a un `OR`. */
const NINGUNA = '00000000-0000-0000-0000-000000000000'
const ALCANCES = [...ALCANCES_PATRIMONIO]

const esChoqueDeUnico = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'

export function puertosAutorizarPatrimonio(
  identidadId: string,
  extra: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
  ahora: () => Date = () => new Date(),
): PuertosAutorizarPatrimonio {
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId` (lo repite `titularesAutorizables`).
  const sesionOk = async () => (await getIdentidad())?.id === identidadId
  let cache: Promise<string[]> | null = null
  const autorizablesIds = () => (cache ??= titularesAutorizables(identidadId))

  return {
    ahora,
    async autorizables() {
      const ids = await autorizablesIds()
      const fichas = await fichasDeTitulares(identidadId, ids)
      return ids.map((clienteId) => ({ clienteId, nombre: fichas.get(clienteId)?.nombre ?? null }))
    },

    async concedidos(clientesIds) {
      const filas = await prisma.portalAutorizacion.findMany({
        where: {
          otorganteClienteId: { in: clientesIds.length > 0 ? [...clientesIds] : [NINGUNA] },
          alcance: { in: ALCANCES },
          polizaId: null,
          revocadoEn: null,
        },
        select: { id: true, otorganteClienteId: true, alcance: true, otorgadoEn: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
        orderBy: { otorgadoEn: 'desc' },
        take: 100,
      })
      const hoy = ahora()
      const vivas = filas.filter((f) => {
        const e = estadoAutorizacion(f, hoy)
        return e === 'vigente' || e === 'pendiente'
      })
      // Cómo lo llamó el titular al invitar (no hay otro nombre: el autorizado es una IDENTIDAD, sin ficha).
      const invitaciones = vivas.length === 0
        ? []
        : await prisma.portalInvitacion.findMany({
            where: { autorizacionId: { in: vivas.map((f) => f.id) }, otorganteClienteId: { in: [...clientesIds] } },
            select: { autorizacionId: true, invitadoNombre: true },
          })
      const nombrePor = new Map(invitaciones.map((i) => [i.autorizacionId, i.invitadoNombre]))
      return vivas.flatMap((f): AccesoConcedido[] => {
        const alcance = alcancePatrimonio(f.alcance)
        if (alcance === null) return []
        return [{ id: f.id, clienteId: f.otorganteClienteId, alcance, nombre: nombrePor.get(f.id) ?? null, desde: f.aceptadoEn ?? f.otorgadoEn }]
      })
    },

    async pendientes(clientesIds) {
      const filas = await prisma.portalInvitacion.findMany({
        where: {
          otorgadaPorIdentidadId: identidadId,
          otorganteClienteId: { in: clientesIds.length > 0 ? [...clientesIds] : [NINGUNA] },
          alcance: { in: ALCANCES },
          aceptadaEn: null,
          rechazadaEn: null,
          retiradaEn: null,
          caducaEn: { gt: ahora() },
        },
        select: { id: true, otorganteClienteId: true, alcance: true, invitadoNombre: true, caducaEn: true },
        orderBy: { creadaEn: 'desc' },
        take: 50,
      })
      return filas.flatMap((f): InvitacionPendiente[] => {
        const alcance = alcancePatrimonio(f.alcance)
        return alcance === null ? [] : [{ id: f.id, clienteId: f.otorganteClienteId, alcance, nombre: f.invitadoNombre, caducaEn: f.caducaEn }]
      })
    },

    async recibidos() {
      if (!(await sesionOk())) return []
      const filas = await prisma.portalAutorizacion.findMany({
        where: { autorizadoIdentidadId: identidadId, alcance: { in: ALCANCES }, polizaId: null, revocadoEn: null },
        select: { id: true, otorganteClienteId: true, alcance: true, otorgadoEn: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
        take: 50,
      })
      const hoy = ahora()
      const vigentes = filas.filter((f) => estadoAutorizacion(f, hoy) === 'vigente')
      // El nombre del titular solo si su patrimonio está ABIERTO para mí (`fichasDeTitulares` lo lee dentro de `accesosPatrimonio`):
      // una ficha fusionada o dada de baja ya no abre nada y aquí se calla su nombre.
      const fichas = await fichasDeTitulares(identidadId, vigentes.map((f) => f.otorganteClienteId))
      return vigentes.flatMap((f): AccesoRecibido[] => {
        const alcance = alcancePatrimonio(f.alcance)
        return alcance === null ? [] : [{ id: f.id, alcance, titular: fichas.get(f.otorganteClienteId)?.nombre ?? null, desde: f.aceptadoEn ?? f.otorgadoEn }]
      })
    },

    // 256 bits de `randomBytes`, nunca `Math.random`: adivinar un token es entrar en la invitación de otro.
    token: () => randomBytes(BYTES_TOKEN_INVITACION).toString('hex'),
    enlace: (token) => enlaceDeInvitacion(token),
    hashCanal: (email) => hashCanal(email),
    // Misma pimienta que el canal, como `lib/invitaciones.ts` (`hashToken`): el token ya es hex en minúsculas.
    hashToken: (token) => hashCanal(token),

    enviadasDesde: (desde) =>
      prisma.portalInvitacion.count({ where: { otorgadaPorIdentidadId: identidadId, creadaEn: { gte: desde } } }),

    async esMiCorreo(canalHash) {
      const c = await prisma.portalCanal.findFirst({ where: { identidadId, valorHash: canalHash }, select: { id: true } })
      return c !== null
    },

    async yaAutorizado({ clienteId, alcance, canalHash }) {
      const destino = await prisma.portalCanal.findFirst({ where: { valorHash: canalHash }, select: { identidadId: true } })
      if (destino === null) return false
      const previas = await prisma.portalAutorizacion.findMany({
        where: { otorganteClienteId: clienteId, autorizadoIdentidadId: destino.identidadId, alcance, polizaId: null, revocadoEn: null },
        select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
      })
      const hoy = ahora()
      return previas.some((p) => {
        const e = estadoAutorizacion(p, hoy)
        return e === 'vigente' || e === 'pendiente'
      })
    },

    async crearInvitacion(x) {
      // Solo un titular YA autorizable (lo comprobó la API; aquí se repite: es una escritura).
      if (!(await autorizablesIds()).includes(x.clienteId)) throw new Error('titular no autorizable')
      const ficha = (await fichasDeTitulares(identidadId, [x.clienteId])).get(x.clienteId)
      if (!ficha) throw new Error('ficha del titular no viva')
      try {
        const fila = await prisma.portalInvitacion.create({
          data: {
            correduriaId: ficha.correduriaId,
            otorganteClienteId: x.clienteId,
            otorgadaPorIdentidadId: identidadId,
            destinatarioCanalHash: x.canalHash,
            tokenHash: x.tokenHash,
            alcance: x.alcance,
            // Del titular ENTERO: CHECK `portal_invitacion_patrimonio_entera`.
            polizaId: null,
            mensaje: x.mensaje,
            invitadoNombre: x.invitadoNombre,
            relacion: null,
            creadaEn: x.creadaEn,
            caducaEn: caducidadInvitacion(x.creadaEn),
            ip: extra.ip,
            userAgent: extra.userAgent,
          },
          select: { id: true },
        })
        return { id: fila.id }
      } catch (e) {
        if (esChoqueDeUnico(e)) return 'ya_invitado'
        throw e
      }
    },

    enviarCorreo: (email, x) =>
      enviarInvitacion(email, {
        invitante: x.invitante,
        invitado: x.invitado,
        abreAcceso: true,
        patrimonio: x.alcance === 'patrimonio_total' ? 'total' : 'gestion',
        mensaje: x.mensaje,
        enlace: x.enlace,
      }),

    async revocar({ autorizacionId, clientesIds }) {
      if (!(await sesionOk())) return 'no_encontrada'
      // El lado va DENTRO del `where`, junto al id: con el uuid de un acceso ajeno la lectura no encuentra nada (404).
      const fila = await prisma.portalAutorizacion.findFirst({
        where: {
          id: autorizacionId,
          alcance: { in: ALCANCES },
          OR: [
            { otorganteClienteId: { in: clientesIds.length > 0 ? [...clientesIds] : [NINGUNA] } },
            { autorizadoIdentidadId: identidadId },
          ],
        },
        select: { id: true, otorganteClienteId: true },
      })
      if (fila === null) return 'no_encontrada'
      const soyTitular = clientesIds.includes(fila.otorganteClienteId)
      const { count } = await prisma.portalAutorizacion.updateMany({
        where: { id: fila.id, revocadoEn: null },
        data: { revocadoEn: ahora(), revocadoPor: soyTitular ? 'otorgante' : 'autorizado', revocadoPorIdentidadId: identidadId },
      })
      return count === 0 ? 'ya_revocada' : 'ok'
    },
  }
}
