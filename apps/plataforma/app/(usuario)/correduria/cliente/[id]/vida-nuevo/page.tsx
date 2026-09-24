import Link from 'next/link'
import { HeartPulse } from 'lucide-react'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { precalificarVidaNuevaAsegura, catalogoAsegura } from '@/lib/vida-nuevo-asegura'
import { Pagina, PageHeader, cardStyle } from '@/components/ui'
import VidaNuevo from './VidaNuevo'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ La cotización del vendor puede tardar hasta 150 s; mismo margen que el
 * resto de pantallas de pago de la correduría.
 */
export const maxDuration = 180

/**
 * **Presupuesto de VIDA sin póliza, DENTRO de `/correduria`.**
 *
 * Hermana de `.../moto-nuevo`, construida el mismo día a instancia expresa de
 * Alberto («construye todo hay q hacerlo», 07/09/2026). La cartera viva tiene
 * **0 pólizas de vida** (03/09/2026), así que «nueva» es el ÚNICO caso posible.
 *
 * 🚧 **AVISO QUE NO ES COSMÉTICO:** a diferencia de auto/hogar/moto, el `risk`
 * que Codeoscopic espera para este ramo NO se ha podido verificar contra el
 * fabricante — el repo solo sabe que el prefijo `/term-life/*` existe. Ver
 * `apps/asegura/lib/codeoscopic/peticion-vida.ts` para el detalle completo.
 * El primer intento real puede devolver un 400 que nombre un campo distinto
 * del que hoy se manda: es esperable, y se corrige ahí, no reintentando.
 */
export default async function VidaNuevoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clienteId } = await params

  const ficha = await fichaAsegura(clienteId)
  const nombreCliente = ficha.estado === 'ok' ? ficha.ficha.nombre : null
  const sub = nombreCliente
    ? `${nombreCliente} · presupuesto de vida (oportunidad nueva)`
    : 'Presupuesto de vida (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de vida" icono={<HeartPulse size={20} strokeWidth={1.75} />} sub={sub} />
      <div
        style={{
          ...cardStyle,
          borderColor: 'var(--warning, var(--muted))',
          color: 'var(--text)',
          fontSize: 13,
          marginTop: 10,
        }}
      >
        🚧 El contrato de este ramo con Codeoscopic <strong>no está verificado</strong>: el primer intento
        real de cotizar puede fallar con un mensaje que pida un campo que hoy no se manda. Si pasa, no
        reintentes varias veces seguidas — cada intento cuesta 0,50€ reales — y avisa para corregir el
        formulario.
      </div>
    </div>
  )

  const [civiles, pre] = await Promise.all([
    catalogoAsegura({ tipo: 'estados-civiles' }),
    precalificarVidaNuevaAsegura({ clienteId }),
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

  if (pre.pre.vida.estado === 'ausente') {
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          Vida no está entre los ramos que Codeoscopic tiene habilitados para Grupo ASegura hoy
          {pre.pre.vida.ramos.length > 0 ? ` (los disponibles son: ${pre.pre.vida.ramos.join(', ')})` : ''}.
          Hay que pedírselo a Codeoscopic antes de poder cotizar vida por aquí.
        </div>
      </Pagina>
    )
  }

  const fallosCatalogo = [civiles].filter((c) => c.estado !== 'ok')

  return (
    <Pagina>
      {cabecera}
      {pre.pre.vida.estado === 'desconocido' && (
        <div style={{ ...cardStyle, borderColor: 'var(--muted)', color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
          No se ha podido comprobar si vida tarifica para Grupo ASegura (fallo al leer los ramos de Codeoscopic).
          Puedes seguir rellenando el capital abajo; el servidor cortará antes de gastar si al final no se puede.
        </div>
      )}
      {fallosCatalogo.length > 0 && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
          No se ha podido leer el catálogo de estados civiles de Codeoscopic. Sin él no hay id válido que
          mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.
        </div>
      )}
      <VidaNuevo
        clienteId={clienteId}
        etiquetaCliente={pre.pre.etiquetaCliente}
        faltanInicial={pre.pre.faltan}
        civiles={civiles.estado === 'ok' ? civiles.opciones : []}
        estadoCivil={pre.pre.estadoCivil}
        estadoCivilMotivo={pre.pre.estadoCivilMotivo}
        consumo={pre.pre.consumo}
        simulacion={pre.pre.simulacion}
      />
    </Pagina>
  )
}
