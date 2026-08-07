import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

/**
 * eslint-config-next 16 ya publica flat configs nativos, asi que no se usa
 * FlatCompat: envolverlos con el puente de eslintrc revienta al resolver los
 * plugins ("Converting circular structure to JSON").
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'supabase/**', 'next-env.d.ts'] },
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
