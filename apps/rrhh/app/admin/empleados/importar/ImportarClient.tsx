'use client'
// Importación en dos tiempos: VISTA PREVIA (no escribe) → «Dar de alta N». Al confirmar se reenvía EL MISMO fichero y el
// servidor lo vuelve a validar entero; solo entran las filas válidas, en una transacción.
import { useState } from 'react'
import Boton from '@/components/ui/Boton'
import Card from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import Aviso from '@/components/ui/Aviso'
import type { VistaPrevia, FilaPrevia } from '@/lib/importar-empleados'

const LOTE = 50
const REJILLA = { gridTemplateColumns: 'minmax(0, 1fr)' } as const

type Resultado = { creados: number; rechazadas: { numero: number; motivo: string }[] }

export default function ImportarClient({ limiteFilas }: { limiteFilas: number }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<VistaPrevia | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [soloErrores, setSoloErrores] = useState(false)
  const [limite, setLimite] = useState(LOTE)

  async function enviar(modo: 'previa' | 'confirmar') {
    if (!archivo) return
    setBusy(true); setError('')
    const fd = new FormData()
    fd.append('archivo', archivo); fd.append('modo', modo)
    try {
      const r = await fetch('/api/admin/empleados/importar', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo procesar el fichero'); return }
      setPrevia(j.previa ?? null); setLimite(LOTE)
      if (modo === 'confirmar') setResultado({ creados: j.creados ?? 0, rechazadas: j.rechazadas ?? [] })
    } catch { setError('Sin conexión: vuelve a intentarlo') } finally { setBusy(false) }
  }

  const filas: FilaPrevia[] = previa ? previa.filas.filter(f => !soloErrores || f.estado === 'error') : []
  const mostradas = filas.slice(0, limite)

  return (
    <div className="grid gap-4" style={REJILLA}>
      <Card className="grid gap-3" style={REJILLA}>
        <p className="text-sm">1. Descarga la plantilla, rellena una fila por trabajador y guárdala como CSV. Si la tienes en Excel: Archivo › Guardar como › «CSV UTF-8». Los .xlsx no se admiten.</p>
        <p className="text-xs text-ink-3">Jornada e IRPF en porcentaje: 100 o 100 % para jornada completa, 15 o 15 % de IRPF (no 1 ni 0,15).</p>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" href="/api/admin/empleados/importar/plantilla">Descargar plantilla (CSV, se abre con Excel)</Boton>
        </div>
        <label className="grid min-w-0 gap-1 text-sm" style={REJILLA}>
          <span className="font-semibold">2. Sube el fichero</span>
          <input type="file" accept=".csv,text/csv"
            className="min-h-[44px] w-full min-w-0"
            onChange={e => { setArchivo(e.target.files?.[0] ?? null); setPrevia(null); setResultado(null); setError('') }} />
        </label>
        <div><Boton onClick={() => enviar('previa')} disabled={!archivo || busy}>{busy && !previa ? 'Leyendo…' : 'Ver vista previa'}</Boton></div>
      </Card>

      {error && <Aviso tono="alerta">{error}</Aviso>}

      {resultado && (
        <Aviso tono={resultado.creados ? 'ok' : 'aviso'} titulo={`${resultado.creados} ${resultado.creados === 1 ? 'trabajador dado' : 'trabajadores dados'} de alta`}>
          {resultado.rechazadas.length > 0 && (
            <ul className="mt-1 grid gap-1">
              {resultado.rechazadas.map(x => <li key={x.numero}>Fila {x.numero}: {x.motivo}</li>)}
            </ul>
          )}
          <p className="mt-2"><a href="/admin/empleados" className="text-accent">Ir a Empleados</a></p>
        </Aviso>
      )}

      {previa && !resultado && (
        <>
          {previa.faltan.length > 0 && <Aviso tono="alerta" titulo="Faltan columnas obligatorias">{previa.faltan.join(', ')}. Usa la plantilla.</Aviso>}
          {previa.excedeLimite && <Aviso tono="alerta">El fichero tiene más de {limiteFilas} filas: divídelo en varios.</Aviso>}
          {previa.ignoradas.length > 0 && <Aviso tono="info" titulo="Columnas que no se importan">{previa.ignoradas.join(', ')}</Aviso>}
          {previa.filas.length > 0 && (
            <Card className="grid gap-3" style={REJILLA}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tono="ok">{previa.validas} correctas</Chip>
                {previa.conError > 0 && <Chip tono="alerta">{previa.conError} con errores</Chip>}
                <label className="ml-auto flex min-h-[44px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={soloErrores} onChange={e => { setSoloErrores(e.target.checked); setLimite(LOTE) }} />
                  Solo filas con errores
                </label>
              </div>
              <ul className="grid gap-2" style={REJILLA}>
                {mostradas.map(f => (
                  <li key={f.numero} className="min-w-0 rounded-[12px] border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink-3">Fila {f.numero}</span>
                      <span className="min-w-0 break-words font-semibold">{f.nombre || 'Sin nombre'}</span>
                      {f.dni && <span className="font-mono text-xs text-ink-3">{f.dni}</span>}
                      {f.estado === 'valida' ? <Chip tono="ok">Correcta</Chip> : <Chip tono="alerta">No se importa</Chip>}
                      {f.estado === 'valida' && <Chip tono="neutro">{f.conContrato ? 'Con contrato' : 'Sin contrato'}</Chip>}
                    </div>
                    {(f.errores.length > 0 || f.duplicado) && (
                      <ul className="text-alert mt-1 grid gap-0.5">
                        {f.duplicado && <li>{f.duplicado}</li>}
                        {f.errores.map((e, i) => <li key={i}>{e.mensaje}</li>)}
                      </ul>
                    )}
                    {f.avisos.length > 0 && <p className="text-ink-3 mt-1">{f.avisos.join(' · ')}</p>}
                  </li>
                ))}
              </ul>
              {filas.length > limite && (
                <div className="text-center"><Boton variante="secundario" onClick={() => setLimite(l => l + LOTE)}>Ver más ({filas.length - limite} restantes)</Boton></div>
              )}
              <div className="flex flex-wrap gap-2">
                <Boton onClick={() => enviar('confirmar')} disabled={busy || previa.validas === 0}>
                  {busy ? 'Dando de alta…' : `Dar de alta ${previa.validas} ${previa.validas === 1 ? 'trabajador' : 'trabajadores'}`}
                </Boton>
                {previa.conError > 0 && <span className="text-ink-3 self-center text-sm">Las filas con errores no se importan: corrígelas y vuelve a subir solo esas.</span>}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
