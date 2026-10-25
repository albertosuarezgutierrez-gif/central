'use client'

// «Hoy» → cola «Patrimonio» (P16, 26/10/2026). Señales calculadas sobre los inmuebles de clientes con patrimonio que NO se
// han opuesto (interés legítimo informado; los opuestos no salen). Spec: docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md §3.5.
//
// 🚨 Una señal NO es una oportunidad ni autoriza contacto: esta cola NO envía nada a nadie. Tres estados que no se
// colapsan: APAGADO (el motor no corre: se dice, no se pinta «0»), vacío de verdad y error de lectura.
// La lista puede crecer: ~50 + «Ver más».

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Clock, TriangleAlert } from 'lucide-react'
import { btnStyle, Badge } from '@/components/ui'
import { MOTIVOS_PUERTO } from '@/lib/correduria-puerto'
import { ROTULO_PERMISO, cifraLegible, type LecturaOportunidadesPatrimonio, type SenalPatrimonio } from '@/lib/correduria/oportunidades-patrimonio'
import Bloque from './Bloque'
import { ConIcono } from './iconos'

const POR_PAGINA = 50

export default function OportunidadesPatrimonio() {
  const [d, setD] = useState<LecturaOportunidadesPatrimonio | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/correduria/oportunidades-patrimonio')
      .then((r) => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then((x: LecturaOportunidadesPatrimonio) => setD(x))
      .catch(() => setD({ estado: 'error', motivo: 'red' }))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function descartar(s: SenalPatrimonio) {
    const motivo = window.prompt('¿Por qué la descartas? (no volverá a salir hasta pasados 180 días)')?.trim()
    if (!motivo) return
    setOcupado(s.id); setAviso(null)
    try {
      const r = await fetch('/api/correduria/oportunidades-patrimonio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, motivo }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      setAviso(j?.estado === 'descartada' ? 'Descartada.' : `NO se ha descartado: ${j?.motivo ?? j?.estado ?? 'no se ha podido hablar con asegura'}.`)
    } catch {
      setAviso('NO se sabe si se ha descartado: no se ha podido hablar con asegura. Mira la lista antes de repetir.')
    } finally {
      setOcupado(null)
      cargar()
    }
  }

  if (d === null) return null

  if (d.estado === 'apagado') {
    return (
      <Bloque titulo="Patrimonio · motor apagado" Icono={Building2}>
        <p style={pMuted}>
          <ConIcono i={Clock}>El motor de señales de patrimonio está APAGADO (<code>PATRIMONIO_SENALES_ACTIVAS</code>): no se calcula
          ni se guarda nada. Que esta cola esté vacía no significa que ningún inmueble necesite seguro.</ConIcono>
        </p>
      </Bloque>
    )
  }
  if (d.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Patrimonio" Icono={Building2}>
        <p style={pMuted}><ConIcono i={Clock}>El puerto con asegura no está conectado: no se puede mirar.</ConIcono></p>
      </Bloque>
    )
  }
  if (d.estado === 'error') {
    const texto = d.motivo in MOTIVOS_PUERTO ? MOTIVOS_PUERTO[d.motivo as keyof typeof MOTIVOS_PUERTO] : d.motivo
    return (
      <Bloque titulo="Patrimonio" Icono={Building2} tono="malo">
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          <ConIcono i={TriangleAlert}>No se ha podido leer: {texto} No significa que no haya señales.</ConIcono>
        </p>
      </Bloque>
    )
  }

  const { senales } = d
  const visibles = senales.slice(0, ver)
  return (
    <Bloque
      titulo={senales.length > 0 ? `Patrimonio · ${senales.length} señal(es)` : 'Patrimonio · sin señales'}
      sub="Inmuebles de clientes que no se han opuesto a la revisión. Una señal no es una oportunidad ni autoriza a contactar: decide tú, envío a envío."
      Icono={Building2}
      tono={senales.length > 0 ? 'aviso' : 'neutral'}
    >
      {aviso && <p style={{ ...pMuted, marginBottom: 8 }} aria-live="polite">{aviso}</p>}
      {senales.length === 0 ? (
        <p style={pMuted}>No hay señales abiertas.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {visibles.map((s) => (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderLeft: `4px solid ${s.permiso === 'pedido' ? 'var(--positive)' : 'var(--warning)'}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <Link href={`/correduria/cliente/${s.clienteId}`} style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{s.cliente}</Link>
                  <Badge tono={s.permiso === 'pedido' ? 'positivo' : 'aviso'}>{ROTULO_PERMISO[s.permiso]}</Badge>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{s.rotulo}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {s.inmueble ?? 'inmueble sin nombre'} · {s.ramo}
                  {cifraLegible(s) && ` · ${cifraLegible(s)}`} · desde {s.desde.split('-').reverse().join('/')}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button type="button" disabled={ocupado === s.id} onClick={() => void descartar(s)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
                    Descartar
                  </button>
                  <Link href={`/correduria/cliente/${s.clienteId}`} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Ver ficha</Link>
                </div>
              </div>
            ))}
          </div>
          {ver < senales.length && (
            <button type="button" onClick={() => setVer((v) => v + POR_PAGINA)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
              Ver {Math.min(POR_PAGINA, senales.length - ver)} más
            </button>
          )}
        </>
      )}
    </Bloque>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
