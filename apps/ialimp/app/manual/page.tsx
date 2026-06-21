import { redirect } from 'next/navigation'

// Redirige directamente al PDF en Supabase Storage
export default function ManualPage() {
  redirect('https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/property-access-files/publico/manual_limpiadora_v1.pdf')
}
