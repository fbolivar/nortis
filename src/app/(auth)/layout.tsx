export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <p className="text-lg font-semibold tracking-tight">NORTIS</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Consola de seguridad de endpoints
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
