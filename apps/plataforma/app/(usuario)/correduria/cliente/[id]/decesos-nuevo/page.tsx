import Link from 'next/link'
import { Flower2 } from 'lucide-react'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { precalificarDecesosNuevaAsegura, catalogoAsegura } from '@/lib/decesos-nuevo-asegura'
import { Pagina, PageHeader, cardStyle } from '@/components/ui'
import DecesosNuevo from './DecesosNuevo'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * **Presupuesto de DECESOS sin póliza, DENTRO de `/correduria`.**
 * Hermana de `.../vida-nuevo`, mismo aviso 🚧 sobre el contrato sin verificar.
 * La cartera viva tiene **0 pólizas de decesos** (03/09/2026) y este ramo
 * SOLO cubre al tomador (sin cobertura familiar, ver
 * `apps/asegura/lib/codeoscopic/peticion-decesos.ts`).
 */
export default async function DecesosNuevoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clienteId } = await params

  const ficha = await fichaAsegura(clienteId)
  const nombreCliente = ficha.estado === 'ok' ? ficha.ficha.nombre : null
  const sub = nombreCliente
    ? `${nombreCliente} · presupuesto de decesos (oportunidad nueva)`
    : 'Presupuesto de decesos (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de decesos" icono={<Flower2 size={20} strokeWidth={1.75} />} sub={sub} />
      <div
        style={{
          ...cardStyle,
          borderColor: 'var(--warning, var(--muted))',
          color: 'var(--text)',
          fontSize: 13,
          marginTop: 10,
        }}
      >
        🚧 El contrato de este ramo con Codeoscopic <strong>no está verificado</strong>, y hoy solo cubre
        al tomador como único asegurado (sin cobertura familiar). El primer intento real puede fallar con
        un mensaje que pida un campo que hoy no se manda; no reintentes varias veces seguidas — cada
        intento cuesta 0,50€ reales.
      </div>
    </div>
  )

  const [civiles, pre] = await Promise.all([
    catalogoAsegura({ tipo: 'estados-civiles' }),
    precalificarDecesosNuevaAsegura({ clienteId }),
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

  if (pre.pre.decesos.estado === 'ausente') {
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          Decesos no está entre los ramos que Codeoscopic tiene habilitados para Grupo ASegura hoy
          {pre.pre.decesos.ramos.length > 0 ? ` (los disponibles son: ${pre.pre.decesos.ramos.join(', ')})` : ''}.
          Hay que pedírselo a Codeoscopic antes de poder cotizar decesos por aquí.
        </div>
      </Pagina>
    )
  }

  const fallosCatalogo = [civiles].filter((c) => c.estado !== 'ok')

  return (
    <Pagina>
      {cabecera}
      {pre.pre.decesos.estado === 'desconocido' && (
        <div style={{ ...cardStyle, borderColor: 'var(--muted)', color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
          No se ha podido comprobar si decesos tarifica para Grupo ASegura (fallo al leer los ramos de
          Codeoscopic). Puedes seguir rellenando el capital abajo; el servidor cortará antes de gastar si
          al final no se puede.
        </div>
      )}
      {fallosCatalogo.length > 0 && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
          No se ha podido leer el catálogo de estados civiles de Codeoscopic. Sin él no hay id válido que
          mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.
        </div>
      )}
      <DecesosNuevo
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
