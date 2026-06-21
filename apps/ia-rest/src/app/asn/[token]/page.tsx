import { Suspense } from 'react'
import AsnClientApp from './AsnClientApp'

export default async function AsnPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#14110E', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ color:'#F6F1E7', fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:18 }}>Cargando…</div>
      </div>
    }>
      <AsnClientApp token={token} />
    </Suspense>
  )
}
