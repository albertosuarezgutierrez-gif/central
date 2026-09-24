'use client'
// Botón 📸 «Factura» de la cabecera: subir la foto/PDF de una factura desde cualquier pantalla y que
// el agente la lea, la archive en Drive (carpeta del año/mes de la factura) y la contabilice.
//
// Es un cliente DELGADO de `/api/contable/chat`: la misma boca que el chat del agente y que el 📎 de
// Telegram, así que las tres cuentan lo mismo y ninguna reimplementa el flujo. Lo único propio de
// aquí es el sitio desde donde se sube (antes había que ir a /asistentes) y la tarjeta del resultado.
import { useCallback, useRef, useState } from 'react'
import { prepararAdjunto, pesoLegible } from '@/lib/imagen-cliente'

type Accion = { id: string; tipo: string; resumen: string; estado?: string; mensaje?: string }

// Se aceptan imágenes y PDF. Sin `capture`: en el móvil el propio selector deja elegir cámara,
// galería o archivo, y forzar la cámara impediría subir un PDF que llega por WhatsApp o correo.
const ACEPTA = 'image/*,application/pdf,.pdf'

export default function SubirFactura({ variante }: { variante: 'barra' | 'lateral' }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<'idle' | 'subiendo' | 'listo'>('idle')
  const [texto, setTexto] = useState('')
  const [acciones, setAcciones] = useState<Accion[]>([])
  const [nombre, setNombre] = useState('')

  const subir = useCallback(async (file: File) => {
    setNombre(file.name); setTexto(''); setAcciones([]); setEstado('subiendo')

    // La foto se encoge AQUÍ, antes de salir del móvil: una foto de 4-12 MB viaja en base64 (×1,37)
    // y el cuerpo se planta por encima de lo que acepta una función de Vercel, que lo rechaza en la
    // plataforma SIN invocarla — sin log, sin JSON y con un mensaje que no dice nada. Ver
    // `lib/imagen-cliente.ts`. Un PDF no se toca.
    const adj = await prepararAdjunto(file).catch(() => null)
    if (!adj || !adj.base64) { setTexto('No pude leer el archivo desde el móvil. Inténtalo otra vez.'); setEstado('listo'); return }
    if (adj.comprimida) setNombre(`${adj.fileName} · ${pesoLegible(adj.bytesOriginal)} → ${pesoLegible(adj.bytesEnviados)}`)

    try {
      const r = await fetch('/api/contable/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjunto: { base64: adj.base64, mimeType: adj.mimeType, fileName: adj.fileName } }),
      })
      const data = await r.json().catch(() => null) as { respuesta?: string; acciones?: Accion[] } | null
      if (data) { setTexto(data.respuesta || 'Sin respuesta.'); setAcciones(data.acciones || []) }
      // Sin cuerpo legible NO todos los casos son iguales, y el genérico de antes («se me ha cortado
      // la conexión») los tapaba todos: se DICE cuál es, porque cada uno se arregla distinto.
      else if (r.status === 413) setTexto(`El archivo es demasiado grande para enviarlo (${pesoLegible(adj.bytesEnviados)}). Si es un PDF, mándalo por correo al buzón de facturas; si es una foto, hazla de nuevo con menos resolución.`)
      else if (r.status === 504 || r.status === 408) setTexto('La lectura ha tardado demasiado y el servidor ha cortado. Puede que la factura SÍ haya entrado: míralo en /finanzas antes de reintentar (reintentarlo no la duplica).')
      else setTexto(`No he podido procesarla (error ${r.status}). Puede que SÍ haya entrado: míralo en /finanzas antes de reintentar (reintentarlo no la duplica).`)
    } catch {
      setTexto('No se pudo subir la factura. Comprueba la conexión y reinténtalo.')
    } finally {
      setEstado('listo')
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  const resolver = useCallback(async (accId: string, op: 'ejecutar' | 'descartar') => {
    setAcciones(a => a.map(x => x.id === accId ? { ...x, mensaje: '…' } : x))
    try {
      const r = await fetch('/api/contable/accion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op === 'descartar' ? { accionId: accId, op: 'descartar' } : { accionId: accId }),
      })
      const d = await r.json().catch(() => ({})) as { estado?: string; mensaje?: string }
      setAcciones(a => a.map(x => x.id === accId ? { ...x, estado: d?.estado || 'error', mensaje: d?.mensaje } : x))
    } catch {
      setAcciones(a => a.map(x => x.id === accId ? { ...x, estado: 'error', mensaje: 'Error de red' } : x))
    }
  }, [])

  const enBarra = variante === 'barra'
  const abierto = estado !== 'idle'

  return (
    <>
      <input ref={fileRef} type="file" accept={ACEPTA} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }} />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={estado === 'subiendo'}
        aria-label="Subir factura"
        title="Subir una factura: la leo, la archivo en Drive y la contabilizo"
        style={{
          // 44px de lado mínimo: es un botón táctil (regla responsive de la casa).
          minHeight: 44, minWidth: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: enBarra ? '0 12px' : '0 14px',
          width: enBarra ? undefined : '100%',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--primary)', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: estado === 'subiendo' ? 'wait' : 'pointer',
          opacity: estado === 'subiendo' ? 0.7 : 1,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{estado === 'subiendo' ? '⏳' : '🧾'}</span>
        {/* En la barra móvil va SIN texto a propósito: la barra mide 52px de alto y a 320px de ancho
            ya lleva el ☰ y la marca; añadir una etiqueta la desbordaría (y el desbordamiento
            horizontal en plataforma no se ve en `body`, ver CLAUDE.md). El significado lo llevan el
            `title` y el `aria-label`. */}
        {!enBarra && <span>{estado === 'subiendo' ? 'Leyendo…' : 'Subir factura'}</span>}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Resultado de la factura"
          style={{
            // Por encima del drawer del menú (50), que es lo más alto de la cabecera.
            position: 'fixed', zIndex: 60, top: 60, right: 8,
            width: 'min(420px, calc(100vw - 16px))', maxHeight: '70vh', overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: 14,
            color: 'var(--text)', fontSize: 13, lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🧾 {nombre || 'Factura'}
            </strong>
            <button onClick={() => { setEstado('idle'); setTexto(''); setAcciones([]) }}
              aria-label="Cerrar"
              style={{ minHeight: 32, minWidth: 32, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>✕</button>
          </div>

          {estado === 'subiendo'
            ? <div style={{ color: 'var(--muted)' }}>Leyendo la factura, archivándola y cuadrándola con el banco… (puede tardar unos segundos)</div>
            : <div style={{ whiteSpace: 'pre-wrap' }}>{texto}</div>}

          {acciones.map(a => (
            <div key={a.id} style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{a.resumen}</div>
              {a.estado
                ? <div style={{ fontSize: 12, color: a.estado === 'ejecutada' ? 'var(--positive)' : 'var(--muted)' }}>{a.mensaje || a.estado}</div>
                : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => resolver(a.id, 'ejecutar')} style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, hazlo</button>
                    <button onClick={() => resolver(a.id, 'descartar')} style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>No</button>
                  </div>
                )}
              {a.mensaje === '…' && <div style={{ fontSize: 12, color: 'var(--muted)' }}>…</div>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
