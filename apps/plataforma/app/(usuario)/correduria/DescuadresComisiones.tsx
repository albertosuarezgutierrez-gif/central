'use client'
import { useEffect, useRef, useState } from 'react'
import { Receipt } from 'lucide-react'
import { eur } from '@/lib/dinero'
import { btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import type { Destino } from './secciones'
import { contadorDescuadres, descuadresParaHoy, type DescuadresHoy, type PeriodoCuadre } from '@/lib/correduria/descuadres-hoy'

/**
 * Comisiones que piden reclamar, subidas a «Hoy» (Fase 3): un descuadre entre fuentes, o una liquidación
 * que la compañía reconoce y no ha llegado al banco pasado el plazo normal. Lee el año en curso y el
 * anterior (en enero lo pendiente es de diciembre). Con todo cuadrado no ocupa ni un píxel.
 */
function fecha(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export default function DescuadresComisiones({ onContador, onIr }: {
  onContador?: (n: number | null) => void
  onIr: (s: Destino) => void
}) {
  const [datos, setDatos] = useState<DescuadresHoy | null>(null)
  const [fallo, setFallo] = useState(false)
  const contador = useRef(onContador)
  useEffect(() => { contador.current = onContador })

  useEffect(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const año = Number(hoy.slice(0, 4))
    Promise.all([año - 1, año].map((a) =>
      fetch(`/api/correduria/comisiones?a%C3%B1o=${a}`).then((r) => {
        if (!r.ok) throw new Error('no')
        return r.json() as Promise<{ periodos?: PeriodoCuadre[] }>
      }),
    ))
      .then((libros) => {
        if (libros.some((l) => !Array.isArray(l?.periodos))) throw new Error('ilegible')
        const d = descuadresParaHoy(libros.flatMap((l) => l.periodos as PeriodoCuadre[]), hoy)
        setDatos(d)
        contador.current?.(contadorDescuadres(d))
      })
      .catch(() => { setFallo(true); contador.current?.(null) })
  }, [])

  if (fallo) {
    return (
      <Bloque titulo="Comisiones" Icono={Receipt} tono="aviso">
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          No se ha podido comprobar el cuadre de comisiones. No significa que esté todo cobrado.
        </p>
      </Bloque>
    )
  }
  if (!datos || (datos.incidencias.length === 0 && datos.sinComprobar === 0)) return null

  const n = datos.incidencias.length
  return (
    <Bloque
      titulo={n > 0 ? `Comisiones por reclamar · ${n}` : 'Comisiones sin comprobar'}
      Icono={Receipt}
      tono={n > 0 ? 'malo' : 'aviso'}
      destacado={n > 0}
      accion={<button type="button" onClick={() => onIr('comisiones')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Ver el cuadre</button>}
    >
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, fontSize: 13 }}>
        {datos.incidencias.map((i) => (
          <li key={`${i.compania}-${i.fin}-${i.estado}`}>
            <strong>{i.compania}</strong> · periodo hasta el {fecha(i.fin)}:{' '}
            {i.estado === 'descuadra'
              ? 'lo liquidado y lo cobrado no coinciden.'
              : `te lo reconoce${i.remesa !== null ? ` (${eur(i.remesa)})` : ''} y no ha llegado al banco.`}
          </li>
        ))}
      </ul>
      {datos.sinComprobar > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
          {datos.sinComprobar} periodo(s) no se han podido comprobar: no cuentan ni como cobrados ni como pendientes.
        </p>
      )}
    </Bloque>
  )
}
