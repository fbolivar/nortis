import type { Config } from 'tailwindcss'

/**
 * Design system de Nortis.
 *
 * Regla que gobierna toda la paleta: EL COLOR COMUNICA SEVERIDAD, NO ESTETICA.
 * Los acentos cromaticos (rojo, ambar, verde, azul) estan reservados para
 * estados. Un boton primario, un encabezado o un borde decorativo usan la escala
 * neutra. Si el color se gasta en decoracion, deja de significar nada y el
 * analista pierde la capacidad de escanear una tabla y detectar lo urgente.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // Superficie elevada: paneles y tarjetas sobre el fondo base.
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          muted: 'hsl(var(--surface-muted))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // --- Estados. Unico uso legitimo del color. ---
        critical: {
          DEFAULT: 'hsl(var(--critical))',
          foreground: 'hsl(var(--critical-foreground))',
          subtle: 'hsl(var(--critical-subtle))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          subtle: 'hsl(var(--warning-subtle))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          subtle: 'hsl(var(--success-subtle))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          subtle: 'hsl(var(--info-subtle))',
        },
      },
      fontFamily: {
        // Monoespaciada para rutas de archivo, hashes, IPs y fingerprints: en
        // una columna de rutas, la anchura fija es lo que permite comparar dos
        // valores de un vistazo.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Escala densa. Un dashboard de seguridad se lee en sesiones largas con
        // mucha informacion por pantalla: 13px de base, no 16px.
        xs: ['0.6875rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
}

export default config
