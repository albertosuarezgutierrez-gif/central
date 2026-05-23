// Layout vacío para /local/[slug]
// Las webs de restaurantes renderizan su propio <html> completo
// Este layout anula el raíz (que añade head/meta globales de ia.rest)
export default function LocalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
