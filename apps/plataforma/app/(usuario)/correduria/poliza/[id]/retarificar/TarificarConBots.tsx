'use client'

// «Tarificar con bots (gratis)» (28/10/2026): la otra mitad de «siempre las dos opciones, Avant2 o bot» en Retarificar.
// Abre el riesgo de la póliza (gratis), guarda en él lo que el formulario ya sabe (`datosVehiculo`, sin confirmar) y lleva
// al bloque «Bots (gratis)» de la oportunidad, que lanza los bots de cada compañía y enseña estado y precios.
// 🚨 NO importa ninguna acción que cotice: aquí no se gasta nada (lo vigila `lib/retarificar-a-riesgo.test.ts`).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'
import { llamarDatosRiesgo, motivoDe } from '../../../oportunidad/[id]/piezas-riesgo'
import { idOportunidadAbierta, TEXTO_BOTS_GRATIS, urlBotsGratis, type DatosVehiculoAGuardar } from '@/lib/retarificar-a-riesgo'

type Fase = { f: 'reposo' } | { f: 'abriendo' } | { f: 'guardando' } | { f: 'ok'; url: string } | { f: 'error'; texto: string; url?: string }

export default function TarificarConBots({ polizaId, datos, aviso, deshabilitado = false }: {
  polizaId: string
  /** Lo que el formulario guarda en el riesgo (solo auto/moto). `no_aplica` = hogar: el riesgo ya se precarga de la póliza. */
  datos: DatosVehiculoAGuardar
  /** Frase bajo el botón (qué viaja y qué no). */
  aviso?: string
  deshabilitado?: boolean
}) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>({ f: 'reposo' })
  const ocupado = fase.f === 'abriendo' || fase.f === 'guardando'
  const sinVersion = !datos.ok && datos.motivo === 'falta_version'

  async function lanzar() {
    setFase({ f: 'abriendo' })
    let id: string | null = null
    try {
      const res = await fetch('/api/correduria/oportunidad/de-poliza', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ polizaId }),
      })
      id = idOportunidadAbierta(res.status, await res.json().catch(() => null))
    } catch { id = null }
    if (!id) {
      setFase({ f: 'error', texto: 'No se ha podido abrir el riesgo de la póliza (no se ha gastado nada). Recarga antes de repetir.' })
      return
    }
    const url = urlBotsGratis(id)
    if (datos.ok) {
      setFase({ f: 'guardando' })
      const r = await llamarDatosRiesgo({ oportunidadId: id, datosVehiculo: datos.datos })
      if (!r.ok) {
        setFase({ f: 'error', texto: `El riesgo está abierto pero no se han guardado los datos del vehículo: ${motivoDe(r)}.`, url })
        return
      }
    }
    setFase({ f: 'ok', url })
    router.push(url)
  }

  return (
    <div style={{ marginTop: 12, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => void lanzar()}
        disabled={deshabilitado || ocupado || sinVersion}
        style={{ ...btnStyle('secundario'), minHeight: 44, width: '100%', maxWidth: 420 }}
      >
        {fase.f === 'abriendo' ? 'Abriendo el riesgo…' : fase.f === 'guardando' ? 'Guardando los datos…' : TEXTO_BOTS_GRATIS}
      </button>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        No cuesta nada ni llama a Avant2: guarda estos datos en el riesgo y abre «Bots (gratis)», donde se lanzan los bots de
        cada compañía y aparecen sus precios.{aviso ? ` ${aviso}` : ''}
      </p>
      {sinVersion && <p className="muted" style={{ fontSize: 12 }}>Elige la versión del vehículo para poder guardarla en el riesgo.</p>}
      {fase.f === 'ok' && (
        <p style={{ fontSize: 13 }}>
          Riesgo guardado. <Link href={fase.url}>Ver los precios de los bots →</Link>
        </p>
      )}
      {fase.f === 'error' && (
        <p className="err" role="alert" style={{ fontSize: 13, wordBreak: 'break-word' }}>
          {fase.texto} {fase.url && <Link href={fase.url}>Abrir el riesgo →</Link>}
        </p>
      )}
    </div>
  )
}
