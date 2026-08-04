import { redirect } from 'next/navigation'

// El «Resumen» se FUSIONÓ con «Banca» en un Inicio único (PR Fase 2): /banca tiene ahora un control
// 💶 Dinero | 🏢 Negocios, y el contenido de este antiguo dashboard vive en el segmento Negocios
// (componente banca/NegociosResumen.tsx). Se conserva esta ruta porque es destino de login/register
// y de ~15 fallbacks de operador (`redirect('/dashboard')`) y de bookmarks antiguos → reenvía al
// Inicio unificado en el segmento Negocios. La lógica de render se movió, no se duplica.
export default function DashboardRedirect() {
  redirect('/banca?tab=negocios')
}
