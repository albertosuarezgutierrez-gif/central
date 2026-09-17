import Link from 'next/link'
import { Car } from 'lucide-react'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { precalificarAutoNuevaAsegura, catalogoAsegura } from '@/lib/auto-nuevo-asegura'
import { Pagina, PageHeader, cardStyle } from '@/components/ui'
import AutoNuevo from './AutoNuevo'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ La cotización del vendor puede tardar hasta 150 s; mismo margen que el
 * resto de pantallas de pago de la correduría (retarificar, hogar-nuevo).
 */
export const maxDuration = 180

/**
 * **Presupuesto de auto SIN póliza, DENTRO de `/correduria`.**
 *
 * Hermana de `.../hogar-nuevo`, construida el mismo día por el mismo motivo:
 * Alberto no quiere saltar de pantalla para presupuestar una oportunidad
 * nueva. A diferencia de hogar (donde el Catastro da el riesgo gratis), aquí
 * no hay un servicio público equivalente: el vehículo se identifica con el
 * catálogo de Codeoscopic (marca→modelo→motor→versión, gratis) y la matrícula
 * la teclea el corredor — el mismo catálogo que ya usa la retarificación de
 * una póliza existente, reutilizado por el puerto de operador.
 *
 * Se cotiza DE CALLE (`aseguradoAntes: false`, ver `precalificarAutoNueva()`
 * en asegura): sin póliza que retarificar no hay compañía anterior que
 * declarar, así que no lleva el bonus por antigüedad de una retarificación.
 */
export default async function AutoNuevoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clienteId } = await params

  const ficha = await fichaAsegura(clienteId)
  const nombreCliente = ficha.estado === 'ok' ? ficha.ficha.nombre : null
  const sub = nombreCliente
    ? `${nombreCliente} · presupuesto de auto (oportunidad nueva)`
    : 'Presupuesto de auto (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de auto" icono={<Car size={20} strokeWidth={1.75} />} sub={sub} />
    </div>
  )

  const [garajes, civiles, pre] = await Promise.all([
    catalogoAsegura({ tipo: 'garajes' }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
    precalificarAutoNuevaAsegura({ clienteId }),
  ])

  if (pre.estado !== 'ok') {
    const tono = pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)'
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13 }}>
          No se ha podido precalificar: {pre.mensaje}
        </div>
      </Pagina>
    )
  }

  // 🚨 Sin estos dos catálogos NO hay ids válidos que mandar, así que no se
  // puede cotizar: se dice, en vez de dejar los desplegables vacíos y sin
  // explicación (no es un problema de la ficha del cliente).
  const fallosCatalogo = [garajes, civiles].filter((c) => c.estado !== 'ok')

  return (
    <Pagina>
      {cabecera}
      {fallosCatalogo.length > 0 && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
          No se han podido leer los catálogos de garajes o estados civiles de Codeoscopic. Sin ellos no hay ids
          válidos que mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.
        </div>
      )}
      <AutoNuevo
        clienteId={clienteId}
        etiquetaCliente={pre.pre.etiquetaCliente}
        faltanInicial={pre.pre.faltan}
        garajes={garajes.estado === 'ok' ? garajes.opciones : []}
        civiles={civiles.estado === 'ok' ? civiles.opciones : []}
        municipios={pre.pre.municipios}
        municipiosMotivo={pre.pre.municipiosMotivo}
        estadoCivilAuto={pre.pre.estadoCivil}
        consumo={pre.pre.consumo}
        simulacion={pre.pre.simulacion}
      />
    </Pagina>
  )
}
