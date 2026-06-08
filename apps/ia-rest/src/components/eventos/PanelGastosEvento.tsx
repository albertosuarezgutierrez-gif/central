'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Concepto = {
  id: string; nombre: string; tipo: string
  importe_defecto: number | null; icono: string
}

type Coste = {
  id: string; tipo: string; descripcion: string
  importe: number; origen: string; imputado_por_rol: string | null
  created_at: string; proveedor_nombre: string | null
}

const TIPO_COLOR: Record<string, string> = {
  ingredientes: '#2B6A6E', personal: '#3F7D44',
  espacio: '#E8A33B', transporte: '#6366F1', otro: '#6B7280',
}

const fmtEur = (n: number) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

interface PanelGastosEventoProps {
  eventoId: string
  sh: () => Record<string, string>
  // si es coordinador, usa /api/eventos/costes; si es owner, /api/owner/eventos/costes
  esCoordinador?: boolean
  readonly?: boolean
}

export default function PanelGastosEvento({ eventoId, sh, esCoordinador, readonly }: PanelGastosEventoProps) {
  const [costes, setCostes] = useState<Coste[]>([])
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    tipo: 'otro', descripcion: '', importe: '', proveedor_nombre: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)

  const apiBase = esCoordinador ? '/api/eventos' : '/api/owner/eventos'

  const cargar = useCallback(async () => {
    setLoading(true)
    const [costesRes, conceptosRes] = await Promise.all([
      fetch(`${apiBase}/costes?evento_id=${eventoId}`, { headers: sh() }),
      fetch('/api/owner/eventos/conceptos-gasto', { headers: sh() }),
    ])
    const [costesData, conceptosData] = await Promise.all([costesRes.json(), conceptosRes.json()])
    setCostes(costesData.costes ?? [])
    setTotal(costesData.total ?? 0)
    setConceptos(conceptosData.conceptos ?? [])
    setLoading(false)
  }, [eventoId, sh, apiBase])

  useEffect(() => { cargar() }, [cargar])

  const usarConcepto = (c: Concepto) => {
    setForm({
      tipo: c.tipo,
      descripcion: c.nombre,
      importe: c.importe_defecto?.toString() ?? '',
      proveedor_nombre: '',
    })
    setMostrarForm(true)
  }

  const guardar = async () => {
    if (!form.descripcion || !form.importe) { setError('Descripción e importe son obligatorios'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${apiBase}/costes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ evento_id: eventoId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al guardar'); return }
      setForm({ tipo: 'otro', descripcion: '', importe: '', proveedor_nombre: '' })
      setMostrarForm(false)
      cargar()
    } finally { setSaving(false) }
  }

  const eliminar = async (id: string) => {
    await fetch(`${apiBase}/costes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id }),
    })
    cargar()
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 15, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>Gastos del evento</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Total imputado</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 700, color: C.red, fontStyle: 'italic' }}>{fmtEur(total)}</div>
          {!readonly && (
            <button onClick={() => setMostrarForm(v => !v)} style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
              + Añadir gasto
            </button>
          )}
        </div>
      </div>

      {/* Conceptos rápidos */}
      {!readonly && conceptos.length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.rule}`, background: C.bone }}>
          <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 6 }}>Gastos habituales</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {conceptos.map(c => (
              <button key={c.id} onClick={() => usarConcepto(c)} style={{
                padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${C.rule}`,
                background: C.paper,
                fontFamily: SN, fontSize: 11, color: C.ink2,
                cursor: 'pointer', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                <span>{c.icono}</span>
                <span>{c.nombre}</span>
                {c.importe_defecto && <span style={{ color: C.ink3 }}>{fmtEur(c.importe_defecto)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Formulario */}
      {mostrarForm && !readonly && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.rule}`, background: '#FFFBF5' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8, marginBottom: 8 }}>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 12, color: C.ink }}>
              {Object.entries({ ingredientes: 'Ingredientes', personal: 'Personal', espacio: 'Espacio', transporte: 'Transporte', otro: 'Otro' }).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input placeholder="Descripción del gasto *" value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink }} />
            <input type="number" step="0.01" placeholder="Importe €" value={form.importe}
              onChange={e => setForm(f => ({ ...f, importe: e.target.value }))}
              style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SM, fontSize: 13, color: C.ink }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
            <input placeholder="Proveedor / empresa (opcional)" value={form.proveedor_nombre}
              onChange={e => setForm(f => ({ ...f, proveedor_nombre: e.target.value }))}
              style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 12, color: C.ink }} />
            <button onClick={() => { setMostrarForm(false); setError('') }} style={{ padding: '7px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving} style={{ padding: '7px 14px', borderRadius: 5, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
          {error && <div style={{ color: C.red, fontFamily: SN, fontSize: 12, marginTop: 6 }}>{error}</div>}
        </div>
      )}

      {/* Lista de gastos */}
      <div style={{ padding: '8px 0' }}>
        {loading ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' as const, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando...</div>
        ) : costes.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' as const, fontFamily: SN, fontSize: 12, color: C.ink3 }}>
            Sin gastos registrados todavía.
            {!readonly && <span> Usa los atajos de arriba o el botón "Añadir gasto".</span>}
          </div>
        ) : (
          costes.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: `1px solid ${C.rule}44` }}>
              {/* Badge tipo */}
              <span style={{ padding: '2px 8px', borderRadius: 99, background: (TIPO_COLOR[c.tipo] ?? '#6B7280') + '22', color: TIPO_COLOR[c.tipo] ?? '#6B7280', fontFamily: SN, fontSize: 10, fontWeight: 600, minWidth: 70, textAlign: 'center' as const }}>
                {c.tipo}
              </span>
              {/* Descripción */}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink }}>{c.descripcion}</div>
                {c.proveedor_nombre && <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{c.proveedor_nombre}</div>}
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>
                  {c.origen === 'manual' ? (c.imputado_por_rol === 'coordinador_eventos' ? '👤 Coordinador' : '👤 Owner') : `🔄 ${c.origen}`}
                  {' · '}{fmtHora(c.created_at)}
                </div>
              </div>
              {/* Importe */}
              <div style={{ fontFamily: SE, fontSize: 15, fontWeight: 700, color: C.ink, fontStyle: 'italic', minWidth: 90, textAlign: 'right' as const }}>
                {fmtEur(c.importe)}
              </div>
              {/* Eliminar (solo gastos manuales) */}
              {!readonly && c.origen === 'manual' && (
                <button onClick={() => eliminar(c.id)} style={{ padding: '3px 7px', borderRadius: 4, border: 'none', background: C.red + '22', color: C.red, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Total final */}
      {costes.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', background: C.bone }}>
          <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Total gastos</span>
          <span style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, color: C.red, fontStyle: 'italic' }}>{fmtEur(total)}</span>
        </div>
      )}
    </div>
  )
}
