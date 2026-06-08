// ─────────────────────────────────────────────────────────────────
// LogoIalimp — componente único de logo para toda la app
// Uso: <LogoIalimp size={20} />
// Renderiza: "ia" bold + "limp" regular, fuente Nunito, color blanco
// ─────────────────────────────────────────────────────────────────
interface Props {
  size?:    number   // font-size en px (default 18)
  color?:   string   // color base (default blanco)
  style?:   React.CSSProperties
  nombre?:  string | null   // marca de la empresa (white-label); si no es "ialimp", se muestra
  logoUrl?: string | null   // logo subido por la empresa; si existe, se muestra la imagen
}

export default function LogoIalimp({ size = 18, color = '#ffffff', style, nombre, logoUrl }: Props) {
  // 1) Logo de imagen de la empresa (white-label)
  if (logoUrl) {
    return (
      <img src={logoUrl} alt={nombre || 'logo'} style={{ height: Math.round(size * 1.5), width: 'auto', display: 'block', objectFit: 'contain', ...style }} />
    )
  }
  // 2) Nombre de marca de la empresa (white-label), si no es ialimp
  if (nombre && nombre.trim() && nombre.trim().toLowerCase() !== 'ialimp') {
    return (
      <span style={{
        fontFamily: "'Nunito', 'Nunito', sans-serif",
        fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
        color, userSelect: 'none', ...style,
      }}>{nombre}</span>
    )
  }
  // 3) Logo ialimp por defecto
  return (
    <span style={{
      fontFamily: "'Nunito', 'Nunito', sans-serif",
      fontSize:   size,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1,
      color,
      userSelect: 'none',
      ...style,
    }}>
      ia<span style={{ fontWeight: 400 }}>limp</span>
    </span>
  )
}
