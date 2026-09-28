'use client'
import { useMemo, useState } from 'react'

import { eur } from '@/lib/dinero'
import { AVISO_IA, TEXTO_LIMITE, TEXTO_PREGUNTA_NO_DISPONIBLE } from '@/lib/presupuesto-ia-textos'
import { TEXTO_CELDA, diferenciasTabla, preguntasSugeridas, type Tabla } from '@/lib/tabla-coberturas'
import type { OpcionResumen } from './ResumenOpciones'

const MAX_PREGUNTA = 300

/**
 * «Comparar dos opciones con la IA». El cliente elige A y B, ve «En qué se diferencian» (lo
 * calcula el CÓDIGO: la diferencia de prima y las coberturas que cambian) y puede preguntar.
 * La IA responde citando la cobertura de la que sale; si su respuesta no cuadra con los datos,
 * asegura la descarta y aquí se dice que no se puede responder con seguridad.
 */
export function CompararIA({ presupuestoId, opciones, tabla, corredor, telefono, onCerrar }: {
  presupuestoId: string
  opciones: OpcionResumen[]
  tabla: Tabla
  corredor: boolean
  telefono: { tel: string; texto: string }
  onCerrar: () => void
}) {
  const [a, setA] = useState(0)
  const [b, setB] = useState(1)
  const [pregunta, setPregunta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [respuestas, setRespuestas] = useState<{ pregunta: string; texto: string; ok: boolean }[]>([])
  const [restantes, setRestantes] = useState<number | null>(null)
  const [llamada, setLlamada] = useState<'no' | 'enviando' | 'ok' | 'error'>('no')

  const oa = opciones[a], ob = opciones[b]
  const dif = useMemo(() => diferenciasTabla(tabla, a, b), [tabla, a, b])
  const sugeridas = useMemo(() => preguntasSugeridas(dif), [dif])
  const difPrima = oa?.primaEur != null && ob?.primaEur != null ? Math.round(Math.abs(oa.primaEur - ob.primaEur) * 100) / 100 : null

  async function preguntar(texto: string) {
    const q = texto.trim().slice(0, MAX_PREGUNTA)
    if (q.length < 3 || a === b || !oa || !ob) return
    setOcupado(true)
    try {
      const r = await fetch('/api/presupuesto/ia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'pregunta', presupuestoId, opcionA: oa.id, opcionB: ob.id, pregunta: q }),
      })
      const j = ((await r.json().catch(() => null)) ?? {}) as { estado?: string; texto?: string; motivo?: string; restantes?: number | null }
      if (typeof j.restantes === 'number') setRestantes(j.restantes)
      if (j.estado === 'ok' && typeof j.texto === 'string') setRespuestas((x) => [...x, { pregunta: q, texto: j.texto!, ok: true }])
      else if (j.estado === 'limite') { setRestantes(0); setRespuestas((x) => [...x, { pregunta: q, texto: TEXTO_LIMITE, ok: false }]) }
      else setRespuestas((x) => [...x, { pregunta: q, texto: j.motivo ?? TEXTO_PREGUNTA_NO_DISPONIBLE, ok: false }])
      setPregunta('')
    } catch {
      setRespuestas((x) => [...x, { pregunta: q, texto: TEXTO_PREGUNTA_NO_DISPONIBLE, ok: false }])
    } finally {
      setOcupado(false)
    }
  }

  async function llamadme() {
    setLlamada('enviando')
    try {
      const r = await fetch('/api/presupuesto/ia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'llamadme', presupuestoId }),
      })
      setLlamada(r.status === 200 || r.status === 429 ? 'ok' : 'error')
    } catch {
      setLlamada('error')
    }
  }

  const sinCupo = restantes === 0
  const selector = (valor: number, cambiar: (n: number) => void, etiqueta: string) => (
    <label style={{ display: 'grid', gap: 4, fontSize: 14, minWidth: 0 }}>
      {etiqueta}
      <select className="campo" style={{ minHeight: 44 }} value={valor} onChange={(e) => cambiar(Number(e.target.value))}>
        {opciones.map((o, i) => (
          <option key={o.id} value={i}>{o.compania} · {o.primaEur === null ? 'sin precio' : eur(o.primaEur)}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Comparar dos opciones</h3>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
        {selector(a, setA, 'Opción A')}
        {selector(b, setB, 'Opción B')}
      </div>

      {a === b ? (
        <p className="pendiente" style={{ margin: 0 }}>Elige dos opciones distintas.</p>
      ) : (
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 15 }}>En qué se diferencian</h4>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 14 }}>
            <li>
              {difPrima === null
                ? 'El precio de alguna de las dos no consta.'
                : difPrima === 0
                  ? 'Cuestan lo mismo al año.'
                  : `${(oa.primaEur! < ob.primaEur! ? oa : ob).compania} cuesta ${eur(difPrima)} menos al año.`}
            </li>
            <li>
              Franquicia: {oa.compania} {oa.franquiciaEur === null ? 'no la declara' : eur(oa.franquiciaEur)}; {ob.compania}{' '}
              {ob.franquiciaEur === null ? 'no la declara' : eur(ob.franquiciaEur)}.
            </li>
            {oa.coberturas.lista === null || ob.coberturas.lista === null ? (
              <li className="pendiente">No puedo comparar las coberturas: las de {oa.coberturas.lista === null ? oa.compania : ob.compania} no se han podido leer.</li>
            ) : dif.length === 0 ? (
              <li>En la lista de coberturas que mandan, no hay diferencias.</li>
            ) : (
              dif.slice(0, 12).map((d) => (
                <li key={d.nombre} style={{ overflowWrap: 'anywhere' }}>
                  {d.nombre}: {oa.compania} {TEXTO_CELDA[d.a.estado]}, {ob.compania} {TEXTO_CELDA[d.b.estado]}.
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {corredor ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>Vista de corredor: las preguntas a la IA las hace el cliente.</p>
      ) : a !== b && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="chips" style={{ marginTop: 0 }}>
            {sugeridas.map((q) => (
              <button key={q} type="button" className="chip" style={{ minHeight: 44, cursor: 'pointer' }} disabled={ocupado || sinCupo} onClick={() => preguntar(q)}>
                {q}
              </button>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            Tu pregunta
            <textarea
              className="campo" rows={2} maxLength={MAX_PREGUNTA} value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="Por ejemplo: ¿cuál incluye la rotura de lunas?"
            />
          </label>
          <button type="button" className="boton" style={{ minHeight: 44 }} disabled={ocupado || sinCupo || pregunta.trim().length < 3} onClick={() => preguntar(pregunta)}>
            {ocupado ? 'Pensando…' : 'Preguntar'}
          </button>
          {restantes !== null && <p className="suave" style={{ margin: 0, fontSize: 12 }}>Te quedan {restantes} preguntas hoy en este presupuesto.</p>}
        </div>
      )}

      {respuestas.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }} aria-live="polite">
          {respuestas.map((r, i) => (
            <li key={i} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
              <p className="suave" style={{ margin: 0, fontSize: 13, overflowWrap: 'anywhere' }}>{r.pregunta}</p>
              <p className={r.ok ? undefined : 'pendiente'} style={{ margin: '6px 0 0', fontSize: 14, overflowWrap: 'anywhere' }}>{r.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="suave" style={{ margin: 0, fontSize: 13 }}>{AVISO_IA}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {corredor ? null : llamada === 'ok' ? (
          <p className="confirmacion" role="status" style={{ margin: 0 }}>Hecho: te llamamos en horario de oficina.</p>
        ) : (
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={llamada === 'enviando'} onClick={llamadme}>
            {llamada === 'enviando' ? 'Avisando…' : 'Prefiero que me llaméis'}
          </button>
        )}
        <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={onCerrar}>Cerrar la comparación</button>
      </div>
      {llamada === 'error' && (
        <p className="error-linea" role="alert" style={{ margin: 0 }}>
          No hemos podido avisar. Llámanos tú al <a href={`tel:${telefono.tel}`}>{telefono.texto}</a>.
        </p>
      )}
    </div>
  )
}
