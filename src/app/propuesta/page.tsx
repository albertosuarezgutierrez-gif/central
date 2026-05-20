import { redirect } from 'next/navigation'
// Índice de propuestas — redirige al listado o a la más reciente
// Añadir aquí cada cliente nuevo
export default function PropuestaIndex() {
  redirect('/propuesta/ovejas-negras')
}
