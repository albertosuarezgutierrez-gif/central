/* eslint-disable @typescript-eslint/no-explicit-any */
// Escenario de la purga de fotos: dos talleres con plazos distintos y un almacén falso que registra los borrados.
import type { AlmacenArchivos } from '../lib/almacen.ts'
import { rutaEsDelTaller } from '../lib/almacen.ts'
import { AHORA, montar, T, T2 } from './_escenario.ts'

export const DIA = 86_400_000
export const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA)

export function almacenFalso(opciones: { fallan?: (ruta: string) => boolean } = {}) {
  const borrados: string[] = []
  const intentos: string[] = []
  const almacen: AlmacenArchivos = {
    async guardar() { throw new Error('no se usa') },
    async urlFirmada() { return null },
    async borrar(tallerId, ruta) {
      intentos.push(ruta)
      if (!rutaEsDelTaller(tallerId, ruta)) throw new Error('ruta ajena')
      if (opciones.fallan?.(ruta)) throw new Error('Storage 500')
      borrados.push(ruta)
    },
  }
  return { almacen, borrados, intentos }
}

let n = 0
/** OT (con su recepción) y fotos sembradas. Devuelve ids y rutas. */
export function sembrarOt(m: ReturnType<typeof montar>, tallerId: string, o: { estado: string; entregadoHace: number | null; fotosTrabajo?: number; fotosDano?: number }) {
  const k = ++n
  const rec = m.bd.sembrar('recepcion', { tallerId, firmaRuta: `${tallerId}/rec${k}/firma-${k}.png`, firmadoEn: AHORA })
  const ot = m.bd.sembrar('ordenTrabajo', {
    tallerId, numero: k, recepcionId: rec.id, vehiculoId: 'v', estado: o.estado,
    ...(o.entregadoHace !== null ? { entregadoEn: hace(o.entregadoHace) } : {}),
  })
  const rutasTrabajo: string[] = []
  const rutasDano: string[] = []
  for (let i = 0; i < (o.fotosTrabajo ?? 0); i++) {
    const ruta = `${tallerId}/ot${k}/trabajo-${i}.jpg`
    m.bd.sembrar('otFoto', { tallerId, otId: ot.id, autorId: 'u', ruta, huellaSha256: 'h', capturadaEn: AHORA })
    rutasTrabajo.push(ruta)
  }
  for (let i = 0; i < (o.fotosDano ?? 0); i++) {
    const ruta = `${tallerId}/rec${k}/dano-${i}.jpg`
    m.bd.sembrar('recepcionFoto', { tallerId, recepcionId: rec.id, orden: i + 1, ruta, huellaSha256: 'h', capturadaEn: AHORA })
    rutasDano.push(ruta)
  }
  return { rec, ot, rutasTrabajo, rutasDano, firmaRecepcion: rec.firmaRuta as string }
}

export function montarPurga(plazos: { t?: number; t2?: number } = {}) {
  const m = montar()
  m.bd.sembrar('configuracion', { tallerId: T, fotosRetencionDias: plazos.t ?? 180 })
  m.bd.sembrar('configuracion', { tallerId: T2, fotosRetencionDias: plazos.t2 ?? 365 })
  return m
}

export const deps = (m: ReturnType<typeof montar>, almacen: AlmacenArchivos) => ({
  talleres: async () => [T, T2], conTaller: m.conTaller as any, almacen, hoy: AHORA,
})
