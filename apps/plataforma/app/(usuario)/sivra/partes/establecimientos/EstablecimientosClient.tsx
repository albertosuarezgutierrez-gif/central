'use client'

import { useState } from 'react'
import type { EstablecimientoPublico } from '@/lib/ses/establecimientos'

type Prueba = { ok: boolean; accion: string; detalle: string }

const CAJA: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '.75rem',
  background: 'var(--card)',
}
const CAMPO: React.CSSProperties = {
  width: '100%', padding: '.55rem .6rem', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  fontSize: '.95rem', minHeight: 44, boxSizing: 'border-box',
}
const BOTON: React.CSSProperties = {
  padding: '.6rem 1rem', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--primary)', color: '#fff', cursor: 'pointer', minHeight: 44, fontSize: '.95rem',
}
const BOTON_2: React.CSSProperties = { ...BOTON, background: 'transparent', color: 'var(--text)' }

/**
 * Estado de validación con TRES valores, no dos: nunca probado ≠ probado y falla.
 * Pintar de rojo un piso recién dado de alta manda a buscar una avería que no existe.
 */
function Estado({ e }: { e: EstablecimientoPublico }) {
  if (e.ultimoError) {
    return <span style={{ color: 'var(--negative)' }} title={e.ultimoError}>🔴 falla — {e.ultimoError}</span>
  }
  if (!e.validadoEn) {
    return <span style={{ color: 'var(--muted)' }}>⚪ sin probar todavía</span>
  }
  const f = new Date(e.validadoEn).toLocaleString('es-ES')
  return <span style={{ color: 'var(--positive)' }}>🟢 conexión OK · {f}</span>
}

export default function EstablecimientosClient({ inicial }: { inicial: EstablecimientoPublico[] }) {
  const [lista, setLista] = useState(inicial)
  const [form, setForm] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [probando, setProbando] = useState<string | null>(null)
  const [pruebas, setPruebas] = useState<Record<string, Prueba>>({})

  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }))

  async function recargar() {
    const r = await fetch('/api/sivra/ses/establecimientos')
    if (r.ok) setLista((await r.json()).establecimientos)
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    setGuardando(true); setError(null)
    try {
      const r = await fetch('/api/sivra/ses/establecimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: editando }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
      setForm({}); setEditando(null)
      await recargar()
    } finally {
      setGuardando(false)
    }
  }

  async function probar(id: string) {
    setProbando(id)
    try {
      const r = await fetch('/api/sivra/ses/probar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const resultado: Prueba = await r.json()
      setPruebas((p) => ({ ...p, [id]: resultado }))
      await recargar()
    } finally {
      setProbando(null)
    }
  }

  function editar(e: EstablecimientoPublico) {
    setEditando(e.id)
    setForm({
      nombre: e.nombre,
      propertyId: e.propertyId ?? '',
      codigoArrendador: e.codigoArrendador,
      codigoEstablecimiento: e.codigoEstablecimiento,
      usuario: e.usuario,
      entorno: e.entorno,
      password: '', // vacío = «no la cambies»
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <form onSubmit={guardar} style={{ ...CAJA, marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 .75rem' }}>
          {editando ? '✏️ Editar establecimiento' : '➕ Añadir establecimiento'}
        </h2>

        {/* Rejilla que colapsa a una columna en móvil (regla responsive del monorepo). */}
        <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>Nombre del piso
            <input style={CAMPO} value={form.nombre ?? ''} onChange={set('nombre')} placeholder="Busto Reform" required />
          </label>
          <label>Código de arrendador
            <input style={CAMPO} value={form.codigoArrendador ?? ''} onChange={set('codigoArrendador')} placeholder="0000000000" required />
          </label>
          <label>Código de establecimiento
            <input style={CAMPO} value={form.codigoEstablecimiento ?? ''} onChange={set('codigoEstablecimiento')} placeholder="0000000000" required />
          </label>
          <label>Usuario del servicio web
            <input style={CAMPO} value={form.usuario ?? ''} onChange={set('usuario')} autoComplete="off" required />
          </label>
          <label>Contraseña del servicio web
            <input style={CAMPO} type="password" value={form.password ?? ''} onChange={set('password')}
              autoComplete="new-password"
              placeholder={editando ? 'dejar vacío = no cambiarla' : ''} />
          </label>
          <label>Entorno
            <select style={CAMPO} value={form.entorno ?? 'produccion'} onChange={set('entorno')}>
              <option value="produccion">producción</option>
              <option value="pruebas">pruebas</option>
            </select>
          </label>
          <label>propertyId (opcional)
            <input style={CAMPO} value={form.propertyId ?? ''} onChange={set('propertyId')} placeholder="prop_busto_reform" />
          </label>
        </div>

        {error && <p style={{ color: 'var(--negative)', marginTop: '.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button type="submit" style={BOTON} disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir'}
          </button>
          {editando && (
            <button type="button" style={BOTON_2} onClick={() => { setEditando(null); setForm({}) }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <h2 style={{ fontSize: '1rem', margin: '0 0 .75rem' }}>Dados de alta ({lista.length})</h2>

      {lista.length === 0 && (
        <p style={{ color: 'var(--muted)' }}>
          Todavía no hay ninguno. Hasta que haya al menos uno, el latido diario sale en rojo
          diciendo justo eso — a propósito: un vigía sin nada que vigilar no debe pintarse verde.
        </p>
      )}

      {lista.map((e) => {
        const p = pruebas[e.id]
        return (
          <div key={e.id} style={CAJA}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <strong>{e.nombre}</strong>{' '}
                {e.entorno === 'pruebas' && <em style={{ color: 'var(--muted)' }}>(pruebas)</em>}
                {!e.activo && <em style={{ color: 'var(--muted)' }}> · inactivo</em>}
                <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: '.25rem', wordBreak: 'break-word' }}>
                  arrendador {e.codigoArrendador} · establecimiento {e.codigoEstablecimiento} · usuario {e.usuario}
                </div>
                <div style={{ fontSize: '.85rem', marginTop: '.35rem' }}>
                  {e.tienePassword ? <Estado e={e} /> : <span style={{ color: 'var(--negative)' }}>🔴 sin contraseña guardada</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <button style={BOTON_2} onClick={() => editar(e)}>Editar</button>
                <button style={BOTON} onClick={() => probar(e.id)} disabled={probando === e.id || !e.tienePassword}>
                  {probando === e.id ? 'Probando…' : 'Probar conexión'}
                </button>
              </div>
            </div>

            {p && (
              <div style={{
                marginTop: '.75rem', padding: '.6rem .75rem', borderRadius: 6, fontSize: '.85rem',
                background: p.ok ? 'var(--positive-bg, var(--card))' : 'var(--warning-bg)',
                color: 'var(--text)',
              }}>
                {p.ok ? '🟢 ' : p.accion === 'esperar' ? '🟠 ' : '🔴 '}
                {p.detalle}
                {/* La acción va explícita: «espera» y «actúa» piden cosas contrarias. */}
                {!p.ok && p.accion === 'esperar' && <> — no hay nada que arreglar por nuestra parte, es el Ministerio.</>}
                {!p.ok && p.accion === 'revisar_portal' && <> — revisa usuario/contraseña en el portal de SES.</>}
              </div>
            )}
          </div>
        )
      })}

      <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginTop: '1.25rem' }}>
        «Probar conexión» usa la operación <code>C</code> (consulta) del servicio web:
        <strong> no da de alta ni anula ningún parte</strong>. Comprueba TLS, credenciales y que el
        arrendador tenga habilitado el servicio web.
      </p>
    </>
  )
}
