'use client'
/**
 * Descarga la remesa SEPA (pain.001, SALA) de las nóminas CONFIRMADAS del periodo para subirla a la banca.
 * Si algo impide generarla (IBAN ausente o inválido, líquido desconocido…), enseña la lista de empleados afectados:
 * no sale un fichero que deje a nadie sin cobrar en silencio.
 * Contra el DOBLE PAGO: si alguna nómina ya estaba en una remesa generada, la ruta responde 409 y aquí se enseña el aviso;
 * solo un segundo clic explícito («Sí, descargarla otra vez») repite con `confirmar_repeticion: true`.
 */
import { useState } from 'react'
import Boton from '@/components/ui/Boton'
import Aviso from '@/components/ui/Aviso'

interface ErrorRemesa { codigo: string; mensaje: string; empleado_id?: string; empleado_nombre?: string; nomina_id?: string }
interface Repeticion { aviso: string; ultima: string | null; mismoFichero: boolean }

/** «2026-11-07 10:00:00.123+00» → «07/11/2026 11:00» (hora local del navegador). */
function fechaHora(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

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
  const [hecho, setHecho] = useState<{ n: number; total: number; noConf: number; repetida: boolean } | null>(null)
  const [repeticion, setRepeticion] = useState<Repeticion | null>(null)

  async function descargar(confirmarRepeticion = false) {
    setCargando(true); setErrores(null); setFallo(null); setHecho(null); setRepeticion(null)
    try {
      const res = await fetch('/api/admin/nominas/remesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, fecha_ejecucion: fecha, ...(confirmarRepeticion ? { confirmar_repeticion: true } : {}) }),
      })
      if (res.status === 409) {
        const j = await res.json().catch(() => null)
        if (j?.error === 'remesa_ya_generada') {
          setRepeticion({ aviso: String(j.aviso ?? ''), ultima: typeof j.ultima_generacion === 'string' ? j.ultima_generacion : null, mismoFichero: j.mismo_fichero === true })
        } else {
          setFallo(j?.error ?? 'Error 409')
        }
        return
      }
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
        repetida: Number(res.headers.get('X-Remesa-Repetida') ?? 0) > 0,
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
        <Boton type="button" onClick={() => descargar()} disabled={cargando || confirmadas === 0}>
          {cargando ? 'Generando…' : 'Descargar remesa SEPA'}
        </Boton>
      </div>
      {confirmadas === 0 && <p className="text-sm text-ink-3">La remesa solo incluye nóminas confirmadas.</p>}

      {hecho && (
        <Aviso tono="ok" titulo="Remesa descargada">
          <p>{hecho.n} transferencias por {eurCentimos(hecho.total)}. Súbela a la banca de la empresa.</p>
          {hecho.noConf > 0 && <p>{hecho.noConf} nóminas sin confirmar no entran en la remesa.</p>}
          {hecho.repetida && <p>Es una REPETICIÓN: no subas las dos remesas al banco.</p>}
        </Aviso>
      )}
      {repeticion && (
        <Aviso tono="alerta" titulo="Esta remesa ya se generó antes">
          <p>{repeticion.aviso}</p>
          {fechaHora(repeticion.ultima) && <p>Última generación: {fechaHora(repeticion.ultima)}.</p>}
          <p>{repeticion.mismoFichero
            ? 'El contenido no ha cambiado: el fichero llevará el mismo identificador y el banco debería rechazarlo como duplicado, pero no te fíes solo de eso.'
            : 'El contenido ha cambiado desde entonces (otra nómina, importe o IBAN): el banco NO lo detectará como duplicado.'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Boton type="button" onClick={() => descargar(true)} disabled={cargando}>Sí, descargarla otra vez</Boton>
            <Boton type="button" variante="secundario" onClick={() => setRepeticion(null)} disabled={cargando}>Cancelar</Boton>
          </div>
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
