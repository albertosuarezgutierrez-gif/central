// lib/sivra/facturas/enlace.ts — enlace del formulario público de datos fiscales. PURO.
import { randomBytes } from 'node:crypto'

export const URL_PLATAFORMA_FACTURAS = 'https://plataforma-ten-flame.vercel.app'

/** 32 bytes aleatorios en base64url (43 caracteres): no se adivina ni se enumera. */
export function generarToken(): string {
  return randomBytes(32).toString('base64url')
}

export function tokenConForma(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
}

export function urlFormulario(token: string, base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_FACTURAS): string {
  return `${base.replace(/\/+$/, '')}/factura/${token}`
}

// La línea que se AÑADE al borrador del agente (en el idioma del huésped). El modelo NO escribe URLs: la pone el código.
const LINEA: Record<string, string> = {
  es: 'Puedes rellenar tus datos de facturación aquí:',
  en: 'You can fill in your invoicing details here:',
  fr: 'Vous pouvez renseigner vos données de facturation ici :',
  it: 'Puoi inserire i tuoi dati di fatturazione qui:',
  pt: 'Pode preencher os seus dados de faturação aqui:',
  de: 'Ihre Rechnungsdaten können Sie hier eintragen:',
}

export function lineaEnlace(lang: string, url: string): string {
  return `${LINEA[lang] ?? LINEA.en} ${url}`
}

/** Añade el enlace al final del borrador (una sola vez, aunque se llame dos veces). */
export function conEnlace(reply: string, lang: string, url: string): string {
  if (!reply || reply.includes(url)) return reply
  return `${reply.trimEnd()}\n\n${lineaEnlace(lang, url)}`
}
