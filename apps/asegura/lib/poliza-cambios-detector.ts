/**
 * El detector de «hay cambios en tu póliza» (27/09/2026). Corre al principio del cron de avisos de
 * la intranet (`avisos-intranet.ts`), así que el cambio que detecta hoy sale en el correo de hoy.
 *
 * Saca la foto de cada póliza de la CARTERA VIVA (no solo en vigor: la baja de una póliza es
 * justo uno de los cambios que hay que contar, y al darse de baja deja de estar en vigor), la
 * compara con la guardada y escribe un `portal_poliza_cambio` por póliza que haya cambiado en algo
 * que importe al cliente. Qué importa lo decide `camposCambiados()`, que es pura y tiene su test.
 *
 * 🚨 Nunca lanza hacia el cron: un fallo aquí no puede dejar sin correo el resto de avisos. Devuelve
 * el resumen con `error` y el cron lo expone.
 */
import {
  camposCambiados,
  cambioMasivo,
  fotoDePoliza,
  leerFoto,
  type FotoPoliza,
} from '@central/module-seguros-portal'
import { WHERE_CARTERA_VIVA } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

export type ResumenCambiosPoliza = {
  /** Pólizas fotografiadas en esta pasada. */
  polizas: number
  /** Primera foto (o de otra versión): se guardan sin avisar. */
  sembradas: number
  /** Cambios escritos (uno por póliza). */
  cambios: number
  /** `true` = demasiadas a la vez: se re-sembró todo sin avisar (`cambioMasivo`). */
  masivo: boolean
  /** Motivo si la pasada falló; `null` si fue bien. */
  error: string | null
}

export async function detectarCambiosPolizas(correduriaId: string): Promise<ResumenCambiosPoliza> {
  const resumen: ResumenCambiosPoliza = { polizas: 0, sembradas: 0, cambios: 0, masivo: false, error: null }
  try {
    const db = prismaAsegura()
    const polizas = await db.poliza.findMany({
      where: { correduriaId, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null },
      select: {
        id: true,
        clienteId: true,
        estado: true,
        fechaInicio: true,
        fechaVencimiento: true,
        primaAnual: true,
        primaBruta: true,
        fraccionamiento: true,
        coberturasRel: { select: { codigo: true, capitalAsegurado: true, franquicia: true } },
        siniestros: { select: { id: true, estado: true } },
      },
    })
    resumen.polizas = polizas.length
    if (polizas.length === 0) return resumen
    const ids = polizas.map((p) => p.id)

    const [docs, guardadas] = await Promise.all([
      // Solo lo que el cliente VE, y no lo que subió él mismo con un parte (eso ya lo sabe).
      db.documento.findMany({
        where: { correduriaId, polizaId: { in: ids }, visiblePorCliente: true, portalParteId: null },
        select: { id: true, polizaId: true },
      }),
      db.portalPolizaFoto.findMany({ where: { polizaId: { in: ids } }, select: { polizaId: true, foto: true } }),
    ])
    const docsPor = new Map<string, string[]>()
    for (const d of docs) if (d.polizaId) docsPor.set(d.polizaId, [...(docsPor.get(d.polizaId) ?? []), d.id])
    const fotoPor = new Map(guardadas.map((g) => [g.polizaId, leerFoto(g.foto)]))

    const nuevas: { polizaId: string; foto: FotoPoliza }[] = []
    const cambios: { polizaId: string; clienteId: string; campos: string[]; estadoNuevo: string | null }[] = []
    let comparadas = 0
    for (const p of polizas) {
      const ahora = fotoDePoliza({
        estado: String(p.estado),
        fechaInicio: p.fechaInicio,
        fechaVencimiento: p.fechaVencimiento,
        primaAnual: p.primaAnual,
        primaBruta: p.primaBruta,
        fraccionamiento: p.fraccionamiento ? String(p.fraccionamiento) : null,
        coberturas: p.coberturasRel,
        documentosVisibles: docsPor.get(p.id) ?? [],
        siniestros: p.siniestros.map((s) => ({ id: s.id, estado: String(s.estado) })),
      })
      const antes = fotoPor.get(p.id) ?? null
      if (antes === null) {
        resumen.sembradas += 1
        nuevas.push({ polizaId: p.id, foto: ahora })
        continue
      }
      comparadas += 1
      if (JSON.stringify(antes) === JSON.stringify(ahora)) continue
      nuevas.push({ polizaId: p.id, foto: ahora })
      const campos = camposCambiados(antes, ahora)
      if (campos.length > 0) {
        cambios.push({ polizaId: p.id, clienteId: p.clienteId, campos, estadoNuevo: campos.includes('estado') ? ahora.estado : null })
      }
    }

    if (cambioMasivo(cambios.length, comparadas)) {
      resumen.masivo = true
      console.error(
        `[asegura/poliza-cambios] ${cambios.length} de ${comparadas} pólizas «cambian» a la vez: se re-siembra SIN avisar (¿cambio de formato de CIMA?)`,
      )
      cambios.length = 0
    }

    // Primero los cambios y después las fotos: si se cae entre medias, mañana se vuelve a
    // detectar el mismo cambio (un aviso repetido) en vez de perderlo (un aviso que no sale nunca).
    if (cambios.length > 0) {
      await db.portalPolizaCambio.createMany({ data: cambios.map((c) => ({ correduriaId, ...c })) })
      resumen.cambios = cambios.length
    }
    for (const n of nuevas) {
      await db.portalPolizaFoto.upsert({
        where: { polizaId: n.polizaId },
        create: { polizaId: n.polizaId, correduriaId, foto: n.foto },
        update: { foto: n.foto, actualizadaEn: new Date() },
      })
    }
  } catch (e) {
    resumen.error = e instanceof Error ? e.message : String(e)
    console.error('[asegura/poliza-cambios] la pasada falló; hoy no se detectan cambios', resumen.error)
  }
  return resumen
}
