import LoginForm from './LoginForm'

export default function Login() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-[18px] border border-line bg-card p-7 shadow-sm">
        <span className="text-2xl font-bold text-ink">ia·rrhh</span>
        <h1 className="mt-3 text-xl">Acceso responsable</h1>
        <LoginForm />
      </div>
    </main>
  )
}
