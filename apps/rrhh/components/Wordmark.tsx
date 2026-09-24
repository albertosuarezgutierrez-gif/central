/** Logotipo tipográfico iarrhh: "ia" tinta fuerte, punto teal, "rrhh" medio. */
export default function Wordmark({ className = "", claro = false }: { className?: string; claro?: boolean }) {
  return (
    <span className={`inline-flex items-baseline font-sans tracking-tight ${className}`}>
      <span className={`font-bold ${claro ? 'text-white' : 'text-ink'}`}>ia</span>
      <span className={`font-bold px-0.5 ${claro ? 'text-white/70' : 'text-accent'}`}>·</span>
      <span className={`font-medium ${claro ? 'text-white/90' : 'text-ink-2'}`}>rrhh</span>
    </span>
  )
}
