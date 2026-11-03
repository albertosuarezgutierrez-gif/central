import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { secretoCoincide } from "@central/core-identity"
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Credentials({ name: "Credenciales",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      const { email, password } = credentials as { email: string; password: string }
      if (!secretoCoincide(email, process.env.ADMIN_EMAIL) || !secretoCoincide(password, process.env.ADMIN_PASSWORD)) return null
      return { id: "admin", name: "Administrador", email, role: "admin" }
    }
  })],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user }) { if (user) token.role = (user as any).role; return token },
    async session({ session, token }) { if (session.user) (session.user as any).role = token.role; return session }
  },
  session: { strategy: "jwt" as const, maxAge: 2592000, updateAge: 86400 },
  secret: process.env.NEXTAUTH_SECRET,
})
