'use client'
import { useState, useMemo } from 'react'
import type { SecretEntry, SecretTipo, DondeVive } from '@/lib/secrets-registry'

const TIPO_LABEL: Record<SecretTipo, { label: string; color: string; bg: string }> = {
  'firma-sesion':    { label: 'Firma de sesión', color: '#b91c1c', bg: '#fee2e2' },
  'token-inter-app': { label: 'Token inter-app', color: '#9333ea', bg: '#f3e8ff' },
  'cron':            { label: 'Cron / operador',  color: '#c2410c', bg: '#ffedd5' },
  'api-externa':     { label: 'API externa',      color: '#0284c7', bg: '#e0f2fe' },
  'login-humano':    { label: 'Login humano',     color: '#15803d', bg: '#dcfce7' },
  'hash-usuario':    { label: 'Hash de usuario',  color: '#475569', bg: '#e2e8f0' },
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
        background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
        borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 20, lineHeight: 1.5,
      }}>
        🛡️ Este panel <b>no muestra ni guarda valores</b>. Solo dice <b>dónde</b> está cada credencial.
        Para cambiar un valor: ve a Vercel (envs), a Bitwarden (logins) o rótalo en su servicio.
        Las contraseñas de usuarios viven como hash en la BD y no se ven nunca.
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
                  display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <code style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{s.name}</code>
                      {s.obligatoria && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 5, padding: '1px 6px' }}>
                          obligatoria en prod
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{s.proposito}</div>
                    {s.nota && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 3 }}>⚠️ {s.nota}</div>}
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
                  </div>
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
