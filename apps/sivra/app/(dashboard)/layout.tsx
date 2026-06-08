import Sidebar from "@/components/Sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--canvas)' }}>
      <Sidebar />
      <main className="flex-1 md:ml-56 pt-14 md:pt-0 pb-20 md:pb-0 min-w-0">
        {children}
      </main>
    </div>
  )
}
