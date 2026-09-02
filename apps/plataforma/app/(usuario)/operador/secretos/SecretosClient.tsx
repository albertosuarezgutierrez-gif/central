'use client'
import { useState, useMemo } from 'react'
import type { SecretEntry, SecretTipo, DondeVive } from '@/lib/secrets-registry'

const TIPO_LABEL: Record<SecretTipo, { label: string; color: string; bg: string }> = {
  'firma-sesion':    { label: 'Firma de sesión', color: 'var(--negative)', bg: 'var(--negative-bg)' },
  'token-inter-app': { label: 'Token inter-app', color: '#9333ea', bg: '#f3e8ff' },
  'cron':            { label: 'Cron / operador',  color: '#c2410c', bg: '#ffedd5' },
  'api-externa':     { label: 'API externa',      color: '#0284c7', bg: '#e0f2fe' },
  'login-humano':    { label: 'Login humano',     color: 'var(--positive)', bg: 'var(--positive-bg)' },
  'hash-usuario':    { label: 'Hash de usuario',  color: '#475569', bg: 'var(--border)' },
}

const DONDE_LABEL: Record<DondeVive, string> = {
  'vercel-equipo':   'Vercel · variable compartida (equipo)',
  'vercel-proyecto': 'Vercel · env del proyecto',
  'bitwarden':       'Bitwarden (gestor de contraseñas)',
  'bd-hash':         'Base de datos (como hash)',
}

// Orden de presentación de los grupos (los críticos arriba).
const ORDEN: SecretTipo[] = ['firma-sesion', 'token-inter-app', 'cron', 'api-externa', 'login-humano', 'hash-usuario']

export default function SecretosClient({ secrets }: { secrets: SecretEntry[] }) {
  const [q, setQ] = useState('')
  // FASE 2 — edición blindada (solo claves `editable`).
  const [editing, setEditing] = useState<string | null>(null)
  const [val, setVal] = useState('')
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ key: string; text: string; ok: boolean; aviso?: boolean } | null>(null)

  async function guardar(key: string) {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/operador/secretos/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val, password: pwd }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        const proyectos = Array.isArray(d.projects) ? d.projects.join(' + ') : (d.project ?? '—')
        // TRES estados, no dos: confirmado · sin confirmar · falló. El de en medio
        // existe porque «el build sigue en marcha» no es «ha ido bien» — darlo por
        // bueno fue el bug del 19/08/2026 (el panel decía ✅ y el deployment moría).
        const text = !d.redeployed
          ? `✅ Guardada en Vercel (${proyectos}). ❌ El redeploy automático NO salió` + (d.redeployError ? ` (${d.redeployError})` : '') + ' — el valor nuevo NO está en runtime: redeploya el proyecto a mano.'
          : d.sinConfirmar
            ? `✅ Guardada en Vercel (${proyectos}). 🟠 El redeploy se lanzó pero seguía construyendo al comprobarlo — no puedo confirmar que haya terminado bien. Míralo en Vercel y, si acaba en Canceled, redeploya a mano.`
            : `✅ Guardada en Vercel (${proyectos}) y redeploy CONFIRMADO en producción. Ya está en runtime.`
        setMsg({ key, text, ok: d.redeployed && !d.sinConfirmar, aviso: Boolean(d.redeployed && d.sinConfirmar) })
        setEditing(null); setVal(''); setPwd('')
      } else {
        setMsg({ key, text: '❌ ' + (d.error || 'Error'), ok: false })
      }
    } catch {
      setMsg({ key, text: '❌ Error de red', ok: false })
    } finally { setBusy(false) }
  }

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return secrets
    return secrets.filter(s =>
      s.name.toLowerCase().includes(t) ||
      s.proposito.toLowerCase().includes(t) ||
      s.verticales.some(v => v.toLowerCase().includes(t)),
    )
  }, [secrets, q])

  const grupos = useMemo(() => {
    return ORDEN
      .map(tipo => ({ tipo, items: visibles.filter(s => s.tipo === tipo) }))
      .filter(g => g.items.length > 0)
  }, [visibles])

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>🔑 Secretos · Inventario</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)', background: 'var(--border)', borderRadius: 20, padding: '2px 10px' }}>
          {visibles.length} / {secrets.length}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
        Mapa de todas las credenciales del proyecto: qué son, qué verticales las usan y <b>dónde vive el valor</b>.
      </p>

      {/* Banner: este panel NO muestra valores */}
      <div style={{
        background: 'var(--warning-bg)', border: '1px solid #fde68a', color: 'var(--warning)',
        borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 20, lineHeight: 1.5,
      }}>
        🛡️ Este panel <b>nunca muestra valores</b>. Las claves marcadas <b>editable</b> (API externas y
        el token de rutinas <code>ALERTA_TOKEN</code>) se pueden <b>sobrescribir</b> en Vercel desde
        aquí, con tu contraseña de operador como 2º factor
        (escritura ciega: se guarda, no se lee) y <b>redeploy automático</b> del proyecto (no entras a Vercel).
        El resto —firma de sesión, logins, hashes— se cambia en Vercel, Bitwarden o su servicio. Las
        contraseñas de usuarios viven como hash en la BD y no se ven nunca.
      </div>

      <input
        placeholder="Buscar por nombre, propósito o vertical…"
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{
          width: '100%', maxWidth: 360, padding: '8px 12px', marginBottom: 24,
          border: '1px solid var(--border)', borderRadius: 8, fontSize: 14,
          color: 'var(--text)', background: 'var(--surface)',
        }}
      />

      {grupos.map(({ tipo, items }) => {
        const meta = TIPO_LABEL[tipo]
        return (
          <section key={tipo} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, color: meta.color, background: meta.bg }}>
                {meta.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{items.length}</span>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {items.map((s, i) => (
                <div key={s.name} style={{
                  padding: '12px 16px',
                  borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 220, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <code style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{s.name}</code>
                        {s.obligatoria && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-bg)', borderRadius: 5, padding: '1px 6px' }}>
                            obligatoria en prod
                          </span>
                        )}
                        {s.editable && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', borderRadius: 5, padding: '1px 6px' }}>
                            editable
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{s.proposito}</div>
                      {s.nota && <div style={{ fontSize: 11.5, color: 'var(--warning)', marginTop: 3 }}>⚠️ {s.nota}</div>}
                    </div>

                    <div style={{ textAlign: 'right', minWidth: 200 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                        {DONDE_LABEL[s.dondeVive]}{s.proyecto ? ` · ${s.proyecto}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }}>
                        {s.verticales.map(v => (
                          <span key={v} style={{ fontSize: 10.5, color: 'var(--muted)', background: 'var(--border)', borderRadius: 5, padding: '1px 6px' }}>
                            {v}
                          </span>
                        ))}
                      </div>
                      {s.editable && (
                        <button
                          type="button"
                          onClick={() => {
                            setMsg(null)
                            setEditing(editing === s.name ? null : s.name)
                            setVal(''); setPwd('')
                          }}
                          style={{
                            marginTop: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            color: editing === s.name ? 'var(--muted)' : '#0284c7',
                            background: 'transparent', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '3px 10px',
                          }}
                        >
                          {editing === s.name ? 'Cancelar' : '✏️ Editar valor'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* FASE 2 — formulario de edición blindada (solo claves editable) */}
                  {s.editable && editing === s.name && (
                    <div style={{
                      background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ fontSize: 11.5, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>
                        🔒 El valor se escribe en Vercel ({s.proyecto || '—'}) y <b>no se vuelve a leer</b>.
                        Al guardar se lanza el <b>redeploy automáticamente</b> (no entras a Vercel).
                      </div>
                      <input
                        type="password"
                        placeholder="Nuevo valor (no se mostrará)"
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        autoComplete="new-password"
                        style={{
                          padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
                          fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
                        }}
                      />
                      <input
                        type="password"
                        placeholder="Tu contraseña de operador (2º factor)"
                        value={pwd}
                        onChange={e => setPwd(e.target.value)}
                        autoComplete="off"
                        style={{
                          padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
                          fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          disabled={busy || !val || !pwd}
                          onClick={() => guardar(s.name)}
                          style={{
                            fontSize: 13, fontWeight: 700, cursor: busy || !val || !pwd ? 'not-allowed' : 'pointer',
                            color: '#fff', background: busy || !val || !pwd ? 'var(--muted)' : '#0284c7',
                            border: 'none', borderRadius: 8, padding: '8px 16px',
                          }}
                        >
                          {busy ? 'Guardando…' : 'Guardar en Vercel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {msg && msg.key === s.name && (
                    <div style={{
                      fontSize: 12.5, padding: '6px 10px', borderRadius: 6,
                      color: msg.aviso ? 'var(--warning)' : msg.ok ? 'var(--positive)' : 'var(--negative)',
                      background: msg.aviso ? 'var(--warning-bg)' : msg.ok ? 'var(--positive-bg)' : 'var(--negative-bg)',
                    }}>
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {grupos.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 14, padding: 24, textAlign: 'center' }}>
          Sin resultados para “{q}”.
        </div>
      )}
    </main>
  )
}
