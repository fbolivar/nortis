import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

/**
 * eslint-config-next 16 ya publica flat configs nativos, asi que no se usa
 * FlatCompat: envolverlos con el puente de eslintrc revienta al resolver los
 * plugins ("Converting circular structure to JSON").
 */
const config = [
  /**
   * `.claude/**` son las herramientas de la fabrica (scripts de skills), no
   * codigo de la aplicacion: no se compilan, no se despliegan y no comparten
   * las reglas de React ni de Next. Lintearlas solo produce ruido — y ademas
   * fue donde revento el intento de subir a ESLint 10 (ver PR #11), en un
   * archivo que no viaja a ningun cliente.
   */
  { ignores: ['.next/**', 'node_modules/**', 'supabase/**', '.claude/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Regla del proyecto: nunca `any`, usar `unknown`.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]

export default config
