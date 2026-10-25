// P17 (26/10/2026) — adaptador con BD del lado del INQUILINO (puertos de `inquilino-api.ts`). SQL:
// `2026-10-26_portal_patrimonio_inquilino_acceso.sql`.
//
// 🚨 Este fichero NO parte de `accesosPatrimonio` (eso es del propietario): parte de los ACCESOS del inquilino
// (`portal_patrimonio_inquilino_acceso` filtrado por la `identidadId` de la COOKIE). Cada lectura lleva el par (contrato, inquilino)
// del acceso ya resuelto por `accesoParaContrato`, y NUNCA un id de la request. El titular se lee del contrato del acceso, jamás
// llega de fuera. Sin DELETE: revocar es un sello. Esta es la ÚNICA consulta por token de todo el flujo (`enlacePorHash`): filtra por
// el HASH de 256 bits y solo devuelve el estado del enlace.
// El inquilino NO lee: gastos, rentabilidad, fianza, otros inmuebles, otros inquilinos, ni PII del propietario o de nadie.
import { sumarDias, DIAS_ENLACE_TRAS_TERMINAR, rentaParaInquilino, vistaContratoParaInquilino } from '@central/module-patrimonio'

import { hashCanal } from '../auth'
import { prisma } from '../db'
import { inicioDiaMadrid } from '../patrimonio/dia-madrid'
import { guardarConTope, type TxMin } from '../patrimonio/documentos-tx'
import { fechaDe } from '../patrimonio/lectura'
import { fechaMadrid } from '../patrimonio/dia-madrid'
import type { TipoFactura } from '../patrimonio/tipo-fichero'
import { getIdentidad } from '../session'
import { MAX_JUSTIFICANTES_DIA, type PuertosInquilino } from './inquilino-api.ts'

/** Carpeta del inquilino a la que SÍ sube (y que SÍ ve): `carpetas.ts` la marca `titularPuedeSubir/Ver`. */
const CARPETA_JUSTIFICANTES = 'recibos'

export function puertosInquilino(identidadId: string, ahora: () => Date = () => new Date()): PuertosInquilino {
  /** El contrato del acceso, vivo, con el inquilino todavía dentro y dentro del margen tras terminar. `null` = ya no abre nada. */
  async function contratoVivo(contratoId: string, inquilinoId: string) {
    const c = await prisma.portalPatrimonioContrato.findFirst({
      where: { id: contratoId, archivadoEn: null },
      select: {
        id: true,
        titularId: true,
        inicio: true,
        fin: true,
        terminadoEn: true,
        rentaMensualCent: true,
        seguroInquilinoExigido: true,
        seguroInquilinoVence: true,
        inmueble: { select: { alias: true, direccionNormalizada: true } },
        actualizaciones: { select: { desde: true, rentaMensualCent: true, notificadaEn: true } },
      },
    })
    if (!c) return null
    const par = await prisma.portalPatrimonioContratoInquilino.findFirst({
      where: { contratoId, inquilinoId, archivadoEn: null },
      select: { id: true },
    })
    if (!par) return null
    const termino = fechaDe(c.terminadoEn)
    if (termino !== null && fechaMadrid(ahora()) > sumarDias(termino, DIAS_ENLACE_TRAS_TERMINAR)) return null
    return c
  }

  return {
    identidadId,
    ahora,
    hashToken: hashCanal,

    async enlacePorHash(tokenHash) {
      const e = await prisma.portalPatrimonioEnlaceInquilino.findUnique({
        where: { tokenHash },
        select: { id: true, contratoId: true, inquilinoId: true, anuladoEn: true, caducaEn: true },
      })
      if (!e) return null
      const acceso = await prisma.portalPatrimonioInquilinoAcceso.findUnique({ where: { enlaceId: e.id }, select: { id: true } })
      return { ...e, usado: acceso !== null }
    },

    async canjear(enlaceId) {
      const e = await prisma.portalPatrimonioEnlaceInquilino.findUnique({
        where: { id: enlaceId },
        select: { id: true, contratoId: true, inquilinoId: true, anuladoEn: true },
      })
      if (!e || e.anuladoEn !== null) return { ok: false, motivo: 'no_valido' }
      // El inquilino sigue en el contrato y el contrato sigue vivo.
      if (!(await contratoVivo(e.contratoId, e.inquilinoId))) return { ok: false, motivo: 'no_valido' }
      try {
        await prisma.$transaction([
          // El índice único de `enlace_id` decide si dos canjes simultáneos pasan: solo uno.
          prisma.portalPatrimonioInquilinoAcceso.create({ data: { enlaceId: e.id, contratoId: e.contratoId, inquilinoId: e.inquilinoId, identidadId } }),
          prisma.portalPatrimonioEnlaceInquilino.updateMany({ where: { id: e.id }, data: { ultimoUsoEn: ahora() } }),
        ])
      } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') return { ok: false, motivo: 'ya_usado' }
        throw err
      }
      return { ok: true, contratoId: e.contratoId }
    },

    async accesos() {
      // Defensa en profundidad: si la sesión no es la de `identidadId` (o es una vista de corredor), no hay accesos.
      const sesion = await getIdentidad()
      if (!sesion || sesion.id !== identidadId || sesion.corredor) return []
      return prisma.portalPatrimonioInquilinoAcceso.findMany({
        where: { identidadId },
        orderBy: { aceptadoEn: 'desc' },
        take: 50,
        select: { id: true, contratoId: true, inquilinoId: true, identidadId: true, revocadoEn: true },
      })
    },

    async vista(acceso) {
      // Defensa en profundidad: el acceso es de ESTA identidad y sigue vivo.
      const propio = await prisma.portalPatrimonioInquilinoAcceso.findFirst({
        where: { id: acceso.id, identidadId, revocadoEn: null },
        select: { enlaceId: true },
      })
      if (!propio) return null
      const c = await contratoVivo(acceso.contratoId, acceso.inquilinoId)
      if (!c) return null
      const enlace = await prisma.portalPatrimonioEnlaceInquilino.findUnique({ where: { id: propio.enlaceId }, select: { contactoNombre: true } })
      const compartidos = await prisma.portalPatrimonioReciboCompartido.findMany({
        where: { contratoId: acceso.contratoId, inquilinoId: acceso.inquilinoId, retiradoEn: null },
        select: { documentoId: true },
      })
      const recibos = compartidos.length === 0
        ? []
        : await prisma.portalPatrimonioDocumento.findMany({
            where: { id: { in: compartidos.map((x) => x.documentoId) }, titularId: c.titularId, inquilinoId: acceso.inquilinoId, borradoEn: null },
            orderBy: { creadoEn: 'desc' },
            take: 50,
            // 🚨 Sin `contenido`: la lista no lee el fichero.
            select: { id: true, nombre: true, creadoEn: true },
          })
      const hoy = fechaMadrid(ahora())
      return vistaContratoParaInquilino({
        contacto: enlace?.contactoNombre ?? 'Tu propietario',
        direccion: c.inmueble.direccionNormalizada,
        alias: c.inmueble.alias,
        inicio: fechaDe(c.inicio) ?? '',
        fin: fechaDe(c.fin),
        terminadoEn: fechaDe(c.terminadoEn),
        rentaMensualCent: rentaParaInquilino(
          Number(c.rentaMensualCent),
          c.actualizaciones.flatMap((a) => {
            const desde = fechaDe(a.desde)
            return desde === null ? [] : [{ desde, rentaMensualCent: Number(a.rentaMensualCent), notificada: a.notificadaEn !== null }]
          }),
          hoy,
        ),
        seguroExigido: c.seguroInquilinoExigido,
        seguroVence: fechaDe(c.seguroInquilinoVence),
        recibos: recibos.map((r) => ({ id: r.id, nombre: r.nombre, creadoEn: r.creadoEn.toISOString() })),
      })
    },

    async misJustificantes(acceso) {
      const c = await contratoVivo(acceso.contratoId, acceso.inquilinoId)
      if (!c) return []
      const docs = await prisma.portalPatrimonioDocumento.findMany({
        where: { titularId: c.titularId, inquilinoId: acceso.inquilinoId, creadoPorIdentidadId: identidadId, borradoEn: null },
        orderBy: { creadoEn: 'desc' },
        take: 50,
        select: { id: true, nombre: true, creadoEn: true },
      })
      return docs.map((d) => ({ id: d.id, nombre: d.nombre, creadoEn: d.creadoEn.toISOString() }))
    },

    async guardarJustificante({ acceso, nombre, mime, sha256, contenido, ahora: ya }) {
      const propio = await prisma.portalPatrimonioInquilinoAcceso.findFirst({ where: { id: acceso.id, identidadId, revocadoEn: null }, select: { id: true } })
      const c = propio ? await contratoVivo(acceso.contratoId, acceso.inquilinoId) : null
      if (!c) return { ok: false, motivo: 'no_encontrado' }
      const desde = inicioDiaMadrid(ya)
      return prisma.$transaction(async (tx) =>
        guardarConTope(tx as unknown as TxMin, {
          identidadId,
          titularId: c.titularId,
          owner: { tipo: 'inquilino', id: acceso.inquilinoId },
          carpeta: CARPETA_JUSTIFICANTES,
          nombre,
          mime,
          sha256,
          contenido,
          desde,
          max: MAX_JUSTIFICANTES_DIA,
        }),
      )
    },

    async descargar(acceso, documentoId) {
      const propio = await prisma.portalPatrimonioInquilinoAcceso.findFirst({ where: { id: acceso.id, identidadId, revocadoEn: null }, select: { id: true } })
      const c = propio ? await contratoVivo(acceso.contratoId, acceso.inquilinoId) : null
      if (!c) return null
      // O me lo ha compartido el propietario (para ESTE contrato e inquilino), o lo subí yo.
      const compartido = await prisma.portalPatrimonioReciboCompartido.findFirst({
        where: { contratoId: acceso.contratoId, inquilinoId: acceso.inquilinoId, documentoId, retiradoEn: null },
        select: { id: true },
      })
      const d = await prisma.portalPatrimonioDocumento.findFirst({
        where: {
          id: documentoId,
          titularId: c.titularId,
          inquilinoId: acceso.inquilinoId,
          borradoEn: null,
          ...(compartido ? {} : { creadoPorIdentidadId: identidadId }),
        },
        select: { nombre: true, mime: true, contenido: true },
      })
      return d ? { nombre: d.nombre, mime: d.mime as TipoFactura, contenido: Buffer.from(d.contenido) } : null
    },

    async consentimientos() {
      return prisma.portalPatrimonioInquilinoConsentimiento.findMany({
        where: { identidadId },
        orderBy: { creadoEn: 'desc' },
        take: 20,
        select: { concedido: true, versionTexto: true, creadoEn: true },
      })
    },

    async registrarConsentimiento({ acceso, concedido, versionTexto }) {
      await prisma.portalPatrimonioInquilinoConsentimiento.create({ data: { accesoId: acceso.id, identidadId, concedido, versionTexto } })
    },

    async revocar(acceso) {
      const r = await prisma.portalPatrimonioInquilinoAcceso.updateMany({
        where: { id: acceso.id, identidadId, revocadoEn: null },
        data: { revocadoEn: ahora(), revocadoPor: 'inquilino' },
      })
      return r.count > 0
    },
  }
}
