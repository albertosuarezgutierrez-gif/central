// Lógica PURA del puerto plataforma → ia-rest (sin `next`, testeable con node --test).
// El wrapper con NextResponse vive en `iarest-port.ts`.
//
// Mapea el fallo del puerto a {status, error}. Regla clave: un 401/403 de ia-rest NO
// es un fallo de sesión del operador (ese 401 lo emite plataforma cuando getAdmin()
// es nulo), sino que ia-rest rechazó nuestro Bearer → se traduce a 502 con mensaje
// accionable. Así un 401 en el navegador significa SIEMPRE "sesión de operador".
export async function iarestErrorPayload(res: Response | null): Promise<{ status: number; error: string }> {
  if (!res) {
    return {
      status: 502,
      error: 'ia-rest sin conexión (revisa IAREST_URL / OPERADOR_SHARED_SECRET en el proyecto Vercel plataforma)',
    }
  }
  if (res.status === 401 || res.status === 403) {
    return {
      status: 502,
      error: 'ia-rest rechazó la credencial del operador — OPERADOR_SHARED_SECRET debe tener el MISMO valor en los proyectos Vercel plataforma e ia-rest',
    }
  }
  const body = await res.json().catch(() => null)
  return { status: 502, error: (body as { error?: string } | null)?.error || `ia-rest HTTP ${res.status}` }
}
