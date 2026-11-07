'use client'
/**
 * Descarga la remesa SEPA (pain.001, SALA) de las nóminas CONFIRMADAS del periodo para subirla a la banca.
 * Si algo impide generarla (IBAN ausente o inválido, líquido desconocido…), enseña la lista de empleados afectados:
 * no sale un fichero que deje a nadie sin cobrar en silencio.
 */
import { useState } from 'react'
import Boton from '@/components/ui/Boton'
import Aviso from '@/components/ui/Aviso'

interface ErrorRemesa { codigo: string; mensaje: string; empleado_id?: string; empleado_nombre?: string; nomina_id?: string }

/** Céntimos → «2.162,49€» (punto de miles también con 4 cifras, coma decimal, € detrás). */
function eurCentimos(c: number): string {
  const neg = c < 0
  const a = Math.abs(Math.round(c))
  const ent = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}${ent},${String(a % 100).padStart(2, '0')}€`
}

function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RemesaBoton({ periodo, confirmadas }: { periodo: string; confirmadas: number }) {
  const [fecha, setFecha] = useState(hoyLocal)
  const [cargando, setCargando] = useState(false)
  const [errores, setErrores] = useState<ErrorRemesa[] | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ n: number; total: number; noConf: number } | null>(null)

  async function descargar() {
    setCargando(true); setErrores(null); setFallo(null); setHecho(null)
    try {
      const res = await fetch('/api/admin/nominas/remesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, fecha_ejecucion: fecha }),
      })
      if (res.status === 422) {
        const j = await res.json().catch(() => null)
        setErrores(Array.isArray(j?.errores) ? j.errores : [])
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setFallo(j?.error ?? `Error ${res.status}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `remesa-nominas-${periodo}.xml`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setHecho({
        n: Number(res.headers.get('X-Remesa-Transferencias') ?? 0),
        total: Number(res.headers.get('X-Remesa-Total-Centimos') ?? 0),
        noConf: Number(res.headers.get('X-Remesa-No-Confirmadas') ?? 0),
      })
    } catch {
      setFallo('No se pudo conectar. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="mt-6 grid gap-3" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span>Fecha de cargo</span>
          <input type="date" value={fecha} min={hoyLocal()} onChange={e => setFecha(e.target.value)}
            className="min-h-[44px] rounded-[12px] border border-line-2 bg-card px-3" />
        </label>
        <Boton type="button" onClick={descargar} disabled={cargando || confirmadas === 0}>
          {cargando ? 'Generando…' : 'Descargar remesa SEPA'}
        </Boton>
      </div>
      {confirmadas === 0 && <p className="text-sm text-ink-3">La remesa solo incluye nóminas confirmadas.</p>}

      {hecho && (
        <Aviso tono="ok" titulo="Remesa descargada">
          <p>{hecho.n} transferencias por {eurCentimos(hecho.total)}. Súbela a la banca de la empresa.</p>
          {hecho.noConf > 0 && <p>{hecho.noConf} nóminas sin confirmar no entran en la remesa.</p>}
        </Aviso>
      )}
      {fallo && <Aviso tono="alerta" titulo="No se pudo generar la remesa">{fallo}</Aviso>}
      {errores && (
        <Aviso tono="alerta" titulo="No se ha generado la remesa: corrige esto antes">
          <ul className="mt-1 list-disc pl-5">
            {errores.map((e, i) => (
              <li key={`${e.codigo}-${e.nomina_id ?? ''}-${i}`}>
                {e.empleado_nombre ? <strong>{e.empleado_nombre}: </strong> : null}{e.mensaje}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
    </section>
  )
}
