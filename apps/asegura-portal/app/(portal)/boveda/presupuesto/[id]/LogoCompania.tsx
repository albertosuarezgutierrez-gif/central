import { logoCompania } from '@/lib/logos-companias'

/**
 * El logo de la compañía en el presupuesto (mismos ficheros que el parte y la web).
 * Decorativo: el nombre sigue escrito al lado, así que `alt=""`. Sin logo → su
 * inicial, nunca un hueco.
 */
export function LogoCompania({ nombre, alto = 28 }: { nombre: string; alto?: number }) {
  const src = logoCompania(nombre)
  if (src !== null) {
    return <img src={src} alt="" aria-hidden="true" style={{ display: 'block', height: alto, width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
  }
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: alto, height: alto, borderRadius: 8,
      background: 'var(--accent-soft, var(--border))', fontWeight: 700, fontSize: Math.round(alto * 0.5),
    }}>{nombre.trim().charAt(0).toUpperCase() || '?'}</span>
  )
}
