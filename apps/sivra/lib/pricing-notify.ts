import { gmailTransporter } from "@iarest/core-email"
import { sendOwnerPush } from "@/lib/push"

// Notifica al propietario por EMAIL + PUSH. "Best effort": nunca lanza.
// Centraliza el envío para que guard/resumen/alertas usen el mismo canal.
export async function notifyOwner(opts: {
  subject: string
  html: string
  push?: { title: string; body: string; url?: string }
}): Promise<void> {
  // Email (patrón de app/api/resumen-semanal).
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (user && pass) {
    try {
      await gmailTransporter()!.sendMail({
        from: `SIVRA Pricing <${user}>`,
        to: user,
        subject: opts.subject,
        html: opts.html,
      })
    } catch (e) {
      console.error("[pricing-notify] email error:", e)
    }
  }
  // Push (best effort).
  if (opts.push) {
    try {
      await sendOwnerPush(opts.push.title, opts.push.body, opts.push.url)
    } catch (e) {
      console.error("[pricing-notify] push error:", e)
    }
  }
}
