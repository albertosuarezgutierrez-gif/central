// «Inicio» (24/10/2026, spec §1.3): la LECTURA de la pantalla, una fuente por tarjeta con `Promise.allSettled`.
// Las tarjetas se calculan puras en `lib/inicio-tarjetas.ts`.
//
// 🔒 La identidad sale de la COOKIE (`getIdentidad()`), nunca de un parámetro de quien llama sin comprobar: si la
// sesión no es la de `identidadId`, nada. La cartera se lee con `carteraDeIdentidad` (parte de `portal_vinculo`), y
// todo `prisma.portal*` lleva `identidadId` en el `where`.
// 🚨 Solo CUENTAS y la próxima fecha: no reutiliza el cargador entero de `boveda/page.tsx`. Y LEER NO ESCRIBE: Inicio
// no sincroniza obligaciones ni registra usos de autorizaciones (eso lo hace quien pinta la bóveda).
// 🚨 Una fuente que falla es `null` (su tarjeta dice «no hemos podido comprobarlo»); las demás se pintan.
import { carteraALaVista, carteraDeIdentidad, cuentaComoEnVigor, type CarteraPortal } from './cartera-lectura'
import { prisma } from './db'
import { DECLARADA_NO_ELIMINADA } from './declaradas-eliminadas'
import { empresasDeFlota } from './flota'
import { carteraLeidaParaHuecos, estadoHuecos, huecosDeProteccion, PREFIJO_HUECOS, type EstadoHuecos, type RamoBasico } from './huecos-proteccion'
import {
  estadoVinculoInicio,
  tarjetasFamilias,
  type FuentePatrimonio,
  type PolizaInicio,
  type ProximaFecha,
  type TarjetaFamilia,
} from './inicio-tarjetas'
import { itemsCompararPendientes } from './patrimonio/ofertas'
import { avisosPolizasSinInmueble } from './patrimonio/poliza-sin-inmueble-bd'
import { resumenPatrimonio, visiblesDeCartera, visiblesDeDeclaradas } from './patrimonio/seguros-inmueble-bd'
import { getIdentidad } from './session'
import { declaradaVigente } from '@central/module-patrimonio'

export type ResumenInicio = {
  familias: TarjetaFamilia[]
  vinculada: boolean
  patrimonio: FuentePatrimonio
  /** Nº de pólizas de hogar/comunidad sin inmueble en el patrimonio. `null` = sin comprobar (no se afirma nada). */
  polizasSinInmueble: number | null
  /** Nº de empresas cuya flota lleva. `null` = sin comprobar. */
  flota: number | null
  /** Las 3 próximas fechas. `null` = sin comprobar. */
  calendario: ProximaFecha[] | null
  /** La ÚNICA sugerencia comercial de la pantalla (cerrable). `null` = no se enseña. */
  sugerencia: { huecos: RamoBasico[]; estado: Exclude<EstadoHuecos, 'oculta'> } | null
}

function motivo(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function valor<T>(r: PromiseSettledResult<T>, fuente: string): T | null {
  if (r.status === 'fulfilled') return r.value
  console.error(`[portal/inicio] fuente «${fuente}» sin comprobar:`, motivo(r.reason))
  return null
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/** `null` = no hay sesión o no es la de `identidadId`. */
export async function resumenInicio(identidadId: string): Promise<ResumenInicio | null> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return null
  const ahora = new Date()
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

  const [rCartera, rDeclaradas, rFlota, rCalendario, rMarcas] = await Promise.allSettled([
    carteraDeIdentidad(identidadId),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId, ...DECLARADA_NO_ELIMINADA },
      select: {
        id: true, compania: true, ramo: true, fechaVencimiento: true, vigenteDeclarada: true, eliminadaEn: true,
        referenciaCatastral: true, datosRamo: true, titularTipo: true,
      },
    }),
    empresasDeFlota(identidadId),
    prisma.portalObligacion.findMany({
      where: { identidadId, fechaEvento: { gte: new Date(`${hoy}T00:00:00Z`) } },
      orderBy: { fechaAccionable: 'asc' },
      take: 3,
      select: { titulo: true, fechaAccionable: true },
    }),
    // La vista de corredor no ve la sugerencia (es una conversación del cliente con su corredor).
    sesion.corredor
      ? Promise.resolve(null)
      : prisma.portalAvisoLeido.findMany({
          where: { identidadId, clave: { startsWith: PREFIJO_HUECOS } },
          select: { clave: true, creadoEn: true },
        }),
  ])

  const cartera: CarteraPortal | null = valor(rCartera, 'cartera')
  const declaradas = valor(rDeclaradas, 'declaradas')
  const vista = cartera ? carteraALaVista(cartera) : null
  const titulares = vista ? [...vista.propias, ...vista.autorizadas, ...vista.intervinientes] : []

  // Solo las pólizas SUYAS: el recibo devuelto de una que le dejan ver lo paga su titular (como «Pendiente de ti»).
  const propias = new Set(vista ? vista.propias.flatMap((t) => t.polizas.map((p) => p.id)) : [])
  const polizasCartera: PolizaInicio[] | null = vista
    ? (() => {
        const vistas = new Set<string>()
        const out: PolizaInicio[] = []
        for (const t of titulares) {
          for (const p of t.polizas) {
            if (vistas.has(p.id)) continue
            vistas.add(p.id)
            out.push({
              ramo: p.ramo,
              empresa: t.tipoPersona === 'juridica',
              enVigor: cuentaComoEnVigor(p),
              vence: iso(p.fechaVencimiento),
              pendiente: propias.has(p.id) && p.recibos != null && p.recibos.devueltos > 0,
            })
          }
        }
        return out
      })()
    : null
  // Aportadas que vencen pronto: la MISMA regla que «Pendiente de ti» (`itemsCompararPendientes`).
  const porVencer = declaradas
    ? new Set(
        itemsCompararPendientes(
          declaradas.map((d) => ({ id: d.id, vence: iso(d.fechaVencimiento), vigente: declaradaVigente(d, ahora), etiqueta: '' })),
          hoy,
        ).map((i) => i.id),
      )
    : null
  const polizasDeclaradas: PolizaInicio[] | null = declaradas
    ? declaradas.map((d) => ({
        ramo: d.ramo,
        empresa: d.titularTipo === 'empresa',
        enVigor: declaradaVigente(d, ahora),
        vence: iso(d.fechaVencimiento),
        pendiente: porVencer !== null && porVencer.has(d.id),
      }))
    : null

  const vinculo = estadoVinculoInicio(cartera ? { fichas: titulares.length, vinculo: cartera.vinculo } : null)
  const familias = tarjetasFamilias({
    cartera: polizasCartera,
    declaradas: polizasDeclaradas,
    vinculo,
    hayEmpresa: titulares.some((t) => t.tipoPersona === 'juridica'),
    hoy,
  })

  // Patrimonio: con la MISMA cartera ya leída (no se lee dos veces). Sin cartera, sus enlaces quedan «sin comprobar».
  let patrimonio: FuentePatrimonio = null
  try {
    const visibles = [...(cartera ? visiblesDeCartera(cartera) : []), ...(declaradas ? visiblesDeDeclaradas(declaradas, ahora) : [])]
    const r = await resumenPatrimonio(identidadId, visibles)
    patrimonio = r === null ? 'no_disponible' : r
  } catch (e) {
    console.error('[portal/inicio] fuente «patrimonio» sin comprobar:', motivo(e))
    patrimonio = null
  }

  // Pólizas de hogar/comunidad sin inmueble: con la MISMA cartera y declaradas ya leídas, y SIN llamar al puente (solo
  // cuenta; los botones y el estado de las peticiones viven en `/patrimonio` y en la ficha de la póliza).
  let polizasSinInmueble: number | null = null
  if (patrimonio !== null && patrimonio !== 'no_disponible') {
    try {
      polizasSinInmueble = (await avisosPolizasSinInmueble(identidadId, { conPeticiones: false, cartera, declaradas })).length
    } catch (e) {
      console.error('[portal/inicio] fuente «pólizas sin inmueble» sin comprobar:', motivo(e))
    }
  }

  const flota = valor(rFlota, 'flota')
  const calendario = valor(rCalendario, 'calendario')
  const marcas = valor(rMarcas, 'sugerencia')

  // La única sugerencia comercial: la de «Seguros que no nos constan», con sus mismas reglas que en la bóveda.
  let sugerencia: ResumenInicio['sugerencia'] = null
  if (marcas !== null && cartera !== null && declaradas !== null) {
    const huecos = huecosDeProteccion({
      carteraLeida: carteraLeidaParaHuecos({ fichasVinculadas: cartera.propias.length, vinculo: cartera.vinculo }),
      ramos: [
        ...carteraALaVista(cartera).propias.flatMap((t) => t.polizas.filter(cuentaComoEnVigor).map((p) => p.ramo)),
        ...declaradas.filter((d) => declaradaVigente(d, ahora)).map((d) => d.ramo),
      ],
    })
    const estado = estadoHuecos({ huecos, marcas, ahora })
    if (estado !== 'oculta') sugerencia = { huecos, estado }
  }

  return {
    familias,
    vinculada: vinculo === 'vinculada',
    patrimonio,
    polizasSinInmueble,
    flota: flota === null ? null : flota.length,
    calendario: calendario === null ? null : calendario.map((o) => ({ titulo: o.titulo, fecha: o.fechaAccionable.toISOString().slice(0, 10) })),
    sugerencia,
  }
}
