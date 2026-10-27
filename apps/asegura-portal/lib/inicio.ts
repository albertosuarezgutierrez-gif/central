// «Inicio» (26/10/2026: SOLO lo pendiente, decisión de Alberto): la LECTURA de la pantalla, una fuente por bloque con
// `Promise.allSettled`. Lo pendiente se calcula puro en `lib/inicio-pendientes.ts`; los avisos los trae el navegador de
// `/api/avisos` (la misma fuente que la campana: una sola lista) y la sugerencia comercial es la de huecos de protección.
//
// 🔒 La identidad sale de la COOKIE (`getIdentidad()`), nunca de un parámetro de quien llama sin comprobar: si la
// sesión no es la de `identidadId`, nada. La cartera se lee con `carteraDeIdentidad` (parte de `portal_vinculo`), y
// todo `prisma.portal*` lleva `identidadId` en el `where`.
// 🚨 Solo CUENTAS y fechas: no reutiliza el cargador entero de `boveda/page.tsx`. Y LEER NO ESCRIBE: Inicio
// no sincroniza obligaciones ni registra usos de autorizaciones (eso lo hace quien pinta la bóveda).
// 🚨 Una fuente que falla es `null` (se dice «no hemos podido comprobarlo»); las demás se pintan.
import { ETIQUETA_RAMO } from '@central/module-seguros-portal'
import { declaradaVigente } from '@central/module-patrimonio'

import { anulacionesPendientes, polizasConBajaEnMarcha } from './anulacion-firma'
import { peticionesPrecio } from './mejorar-precio'
import { carteraALaVista, carteraDeIdentidad, cuentaComoEnVigor, type CarteraPortal } from './cartera-lectura'
import { prisma } from './db'
import { DECLARADA_NO_ELIMINADA } from './declaradas-eliminadas'
import { carteraLeidaParaHuecos, estadoHuecos, huecosDeProteccion, PREFIJO_HUECOS, type EstadoHuecos, type RamoBasico } from './huecos-proteccion'
import { pendienteInicio, type DeclaradaPendiente, type PendienteInicio, type PolizaPendiente } from './inicio-pendientes'
import { getIdentidad } from './session'

export type ResumenInicio = {
  pendiente: PendienteInicio
  /** La ÚNICA sugerencia comercial de la pantalla (cerrable). `null` = no se enseña. */
  sugerencia: { huecos: RamoBasico[]; estado: Exclude<EstadoHuecos, 'oculta'> } | null
}

/** `ETIQUETA_RAMO` indexable por un `ramo` cualquiera (viene de la BD como texto), igual que `RAMO` de la bóveda. */
const RAMO: Record<string, string> = ETIQUETA_RAMO

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

  const [rCartera, rDeclaradas, rMarcas, rFirmas, rPeticiones] = await Promise.allSettled([
    carteraDeIdentidad(identidadId),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId, ...DECLARADA_NO_ELIMINADA },
      select: { id: true, compania: true, ramo: true, fechaVencimiento: true, vigenteDeclarada: true, eliminadaEn: true },
    }),
    // La vista de corredor no ve la sugerencia (es una conversación del cliente con su corredor).
    sesion.corredor
      ? Promise.resolve(null)
      : prisma.portalAvisoLeido.findMany({
          where: { identidadId, clave: { startsWith: PREFIJO_HUECOS } },
          select: { clave: true, creadoEn: true },
        }),
    // Para Vencimientos (misma regla que tenía la bóveda): bajas en marcha y «ya lo pediste». Dos lecturas al puente, en paralelo.
    anulacionesPendientes(identidadId),
    peticionesPrecio(identidadId),
  ])

  const cartera: CarteraPortal | null = valor(rCartera, 'cartera')
  const declaradas = valor(rDeclaradas, 'declaradas')
  const marcas = valor(rMarcas, 'sugerencia')
  const firmas = valor(rFirmas, 'bajas')
  const peticiones = valor(rPeticiones, 'peticiones')
  const vista = cartera ? carteraALaVista(cartera) : null

  // Solo las pólizas SUYAS cuentan para los recibos (el de una que le dejan ver lo paga su titular).
  const propias = new Set(vista ? vista.propias.flatMap((t) => t.polizas.map((p) => p.id)) : [])
  const polizas: PolizaPendiente[] | null = vista
    ? (() => {
        const vistas = new Set<string>()
        const out: PolizaPendiente[] = []
        for (const t of [...vista.propias, ...vista.autorizadas, ...vista.intervinientes]) {
          for (const p of t.polizas) {
            if (vistas.has(p.id)) continue
            vistas.add(p.id)
            out.push({
              id: p.id,
              etiqueta: [RAMO[p.ramo ?? ''] ?? p.ramo, p.compania, p.bien.matricula ?? p.bien.cosa ?? p.bien.ubicacion]
                .filter(Boolean)
                .join(' · '),
              propia: propias.has(p.id),
              enVigor: cuentaComoEnVigor(p),
              vence: iso(p.fechaVencimiento),
              devueltos: p.recibos === null ? null : p.recibos.devueltos,
              proximoRecibo: iso(p.recibos?.proximoAlCobro?.fechaVencimiento ?? null),
              siniestrosAbiertos: p.siniestrosAbiertos === null ? null : p.siniestrosAbiertos.length,
            })
          }
        }
        return out
      })()
    : null
  const aportadas: DeclaradaPendiente[] | null = declaradas
    ? declaradas.map((d) => ({
        id: d.id,
        etiqueta: [d.ramo ? (RAMO[d.ramo] ?? d.ramo) : 'Seguro', d.compania].filter(Boolean).join(' · '),
        enVigor: declaradaVigente(d, ahora),
        vence: iso(d.fechaVencimiento),
      }))
    : null

  // La única sugerencia comercial: la de «Seguros que no nos constan», con sus mismas reglas que tenía en la bóveda.
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

  return { pendiente: pendienteInicio({
      polizas,
      declaradas: aportadas,
      conBaja: firmas === null ? null : polizasConBajaEnMarcha(firmas, { conConfirmadas: true }),
      peticiones,
      hoy,
    }), sugerencia }
}
