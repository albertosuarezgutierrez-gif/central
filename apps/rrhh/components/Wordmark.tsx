/** Logotipo tipográfico iarrhh: "ia" tinta fuerte, punto teal, "rrhh" medio. */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-sans tracking-tight ${className}`}>
      <span className="font-bold text-ink">ia</span>
      <span className="font-bold text-accent px-0.5">·</span>
      <span className="font-medium text-ink-2">rrhh</span>
    </span>
  )
}
