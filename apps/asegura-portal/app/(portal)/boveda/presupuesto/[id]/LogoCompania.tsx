import { escalaLogo, logoCompania } from '@/lib/logos-companias'

/**
 * La compañía en el presupuesto: su LOGO, y el nombre escrito solo si no tenemos logo
 * (Alberto, 29/09/2026: «los nombres aparecen dentro del logotipo»). El nombre va en
 * `alt`/`title`, así que el lector de pantalla y el ratón lo siguen dando.
 * Mismos ficheros que el parte y la web; altura corregida por `escalaLogo`.
 */
export function LogoCompania({ nombre, alto = 32 }: { nombre: string; alto?: number }) {
  const src = logoCompania(nombre)
  if (src !== null) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={nombre} title={nombre} style={{ display: 'block', height: Math.round(alto * escalaLogo(nombre)), width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
    )
  }
  return <strong style={{ display: 'block', fontSize: Math.max(15, Math.round(alto * 0.55)), overflowWrap: 'anywhere' }}>{nombre}</strong>
}
