'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { C } from '@/lib/colors'

function FormularioDemoInner() {
  const searchParams = useSearchParams()
  const utm_id = searchParams.get('utm_id')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const data = {
      nombre: formData.get('nombre'),
      email: formData.get('email'),
      telefono: formData.get('telefono'),
      restaurante: formData.get('restaurante'),
      locales: formData.get('locales'),
      utm_id
    }

    try {
      const res = await fetch('/api/crm/formulario-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!res.ok) {
        throw new Error('Error al enviar formulario')
      }

      setSuccess(true)
      e.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: '500px',
        margin: '60px auto',
        padding: '40px',
        backgroundColor: C.bg2,
        borderRadius: '8px'
      }}
    >
      <h1 style={{ color: C.paper, marginBottom: '8px', fontFamily: 'Newsreader' }}>
        Solicita tu demo
      </h1>
      <p style={{ color: C.ink2, marginBottom: '32px' }}>
        Te llamaremos en breve para mostrarte cómo ia.rest te ayuda a ganar más.
      </p>

      {success ? (
        <div
          style={{
            padding: '20px',
            backgroundColor: C.green,
            color: C.paper,
            borderRadius: '4px',
            textAlign: 'center'
          }}
        >
          ✅ Gracias. Te llamamos en breve.
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="text"
            name="nombre"
            placeholder="Tu nombre *"
            required
            style={{
              padding: '12px',
              backgroundColor: C.bg3,
              color: C.paper,
              border: `1px solid ${C.rule}`,
              borderRadius: '4px',
              fontFamily: 'Inter Tight'
            }}
          />

          <input
            type="email"
            name="email"
            placeholder="Tu email *"
            required
            style={{
              padding: '12px',
              backgroundColor: C.bg3,
              color: C.paper,
              border: `1px solid ${C.rule}`,
              borderRadius: '4px',
              fontFamily: 'Inter Tight'
            }}
          />

          <input
            type="tel"
            name="telefono"
            placeholder="Teléfono *"
            required
            style={{
              padding: '12px',
              backgroundColor: C.bg3,
              color: C.paper,
              border: `1px solid ${C.rule}`,
              borderRadius: '4px',
              fontFamily: 'Inter Tight'
            }}
          />

          <input
            type="text"
            name="restaurante"
            placeholder="Nombre restaurante/catering *"
            required
            style={{
              padding: '12px',
              backgroundColor: C.bg3,
              color: C.paper,
              border: `1px solid ${C.rule}`,
              borderRadius: '4px',
              fontFamily: 'Inter Tight'
            }}
          />

          <select
            name="locales"
            required
            style={{
              padding: '12px',
              backgroundColor: C.bg3,
              color: C.paper,
              border: `1px solid ${C.rule}`,
              borderRadius: '4px',
              fontFamily: 'Inter Tight'
            }}
          >
            <option value="">¿Cuántos locales? *</option>
            <option value="1">1 local</option>
            <option value="2-5">2-5 locales</option>
            <option value="5+">5+ locales</option>
          </select>

          {error && <p style={{ color: C.red, fontSize: '14px' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              backgroundColor: C.red,
              color: C.paper,
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontFamily: 'Inter Tight'
            }}
          >
            {loading ? 'Enviando...' : 'Solicitar demo'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function FormularioDemoPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <FormularioDemoInner />
    </Suspense>
  )
}
