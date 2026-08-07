import type { Config } from 'tailwindcss'

/**
 * Design system de Nortis.
 *
 * Dos reglas gobiernan toda la paleta:
 *
 * 1. EL COLOR DE ESTADO COMUNICA SEVERIDAD, NO ESTETICA. Rojo, ambar, verde y
 *    azul estan reservados para estados. Si el color de severidad se gasta en
 *    decoracion, deja de significar nada y el analista pierde la capacidad de
 *    escanear una tabla y detectar lo urgente.
 * 2. EL AZUL MARINO DEL LOGO ES LA MARCA. Es el unico acento decorativo
 *    permitido: accion principal, estado activo de navegacion y serie unica de
 *    graficas. Un boton secundario, un encabezado o un borde usan la escala
 *    neutra.
 * 3. EL CIAN DE LA AGUJA (`accent`) SOLO VIVE SOBRE SUPERFICIE OSCURA. Da 1.5:1
 *    sobre blanco, asi que nunca lleva texto ni rellena nada informativo sobre
 *    el lienzo claro. Para eso existe `accent-strong`, la version oscurecida.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // Superficie elevada: paneles y tarjetas sobre el lienzo azul-gris.
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
          subtle: 'hsl(var(--primary-subtle))',
          // Azul intermedio para bloques que se apoyan SOBRE `ink`. El primario
          // ahi se funde con el fondo (1.5:1); este mantiene 3:1 de separacion.
          bright: 'hsl(var(--primary-bright))',
          'bright-foreground': 'hsl(var(--primary-bright-foreground))',
        },
        // Cian de la aguja de la brujula. Ver regla 3 arriba.
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          strong: 'hsl(var(--accent-strong))',
          subtle: 'hsl(var(--accent-subtle))',
        },
        // Bloques invertidos: pastilla de navegacion, tarjetas de contraste.
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          foreground: 'hsl(var(--ink-foreground))',
          muted: 'hsl(var(--ink-muted))',
        },
        // --- Estados. Unico uso legitimo del color de severidad. ---
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
        // Escala amplia. El cuerpo arranca en 16px y las metricas suben hasta
        // 40px: el panel se lee de un vistazo desde lejos y sigue siendo usable
        // en un telefono, donde 13px obligaba a acercar la pantalla.
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.625rem' }],
        xl: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],
        '3xl': ['2.125rem', { lineHeight: '2.375rem', letterSpacing: '-0.025em' }],
        '4xl': ['2.75rem', { lineHeight: '2.875rem', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        sm: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        // Sombra unica de tarjeta: difusa, tintada con el azul marino de marca y
        // sin offset lateral. Sobre el lienzo azul-gris una sombra gris se ve
        // sucia.
        card: '0 1px 2px 0 rgb(15 28 56 / 0.04), 0 12px 32px -16px rgb(15 28 56 / 0.14)',
        pill: '0 8px 24px -12px rgb(15 28 56 / 0.35)',
        lifted: '0 2px 4px 0 rgb(15 28 56 / 0.05), 0 20px 44px -20px rgb(15 28 56 / 0.22)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(-8px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        /*
         * Entrada del panel. Se aplica con un retardo creciente por tarjeta para
         * que la rejilla se arme de arriba abajo en vez de aparecer de golpe: el
         * ojo sigue el orden de lectura y el tablero se percibe como algo que se
         * construye, no como un salto de fotograma.
         *
         * 10px de desplazamiento y no mas: por encima de ~16px el movimiento
         * empieza a leerse como carga lenta en lugar de como acabado.
         */
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        /* Barrido de luz sobre superficie oscura. Decorativo, nunca informativo. */
        sheen: {
          '0%': { transform: 'translateX(-130%)' },
          '100%': { transform: 'translateX(230%)' },
        },
        /*
         * Latido del punto de estado "en vivo". La opacidad NO baja de 0.45: por
         * debajo el punto llega a desaparecer y se lee como un fallo de render.
         */
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'sheet-in': 'sheet-in 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        rise: 'rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both',
        sheen: 'sheen 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'pulse-dot': 'pulse-dot 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
