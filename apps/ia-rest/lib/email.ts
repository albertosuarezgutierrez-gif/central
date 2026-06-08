// lib/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM = process.env.RESEND_FROM ?? 'noreply@send.iarest.es'
const REPLY_TO = 'alberto.suarez.gutierrez@gmail.com'

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}) {
  const { data, error } = await resend.emails.send({
    from: `ia.rest <${FROM}>`,
    to,
    subject,
    html,
    ...(text && { text }),
    replyTo: replyTo ?? REPLY_TO,
  })

  if (error) {
    console.error('[Resend] Error:', error)
    throw new Error(error.message)
  }

  return data
}
