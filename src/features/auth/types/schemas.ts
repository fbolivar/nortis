import { z } from 'zod'

export const credentialsSchema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo no valido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

/**
 * 12 caracteres minimo, no 8.
 *
 * Esta contraseña protege la consola desde la que se define quien puede copiar
 * archivos a un USB en toda la empresa. El coste de una contraseña larga lo paga
 * una vez el administrador; el coste de una debil lo paga el cliente entero.
 * El segundo factor es obligatorio de todos modos, pero la primera barrera no
 * puede ser un chiste.
 */
export const signUpSchema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo no valido'),
  fullName: z.string().min(2, 'Escriba su nombre completo').max(120),
  password: z
    .string()
    .min(12, 'Minimo 12 caracteres')
    .regex(/[a-z]/, 'Debe incluir una minuscula')
    .regex(/[A-Z]/, 'Debe incluir una mayuscula')
    .regex(/[0-9]/, 'Debe incluir un numero'),
})

export const organizationSchema = z.object({
  name: z.string().min(2, 'Nombre demasiado corto').max(120),
  slug: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .max(62)
    // Mismo patron que el CHECK de la columna: si divergen, el usuario recibiria
    // un error de Postgres crudo en vez de un mensaje util.
    .regex(/^[a-z0-9]([a-z0-9-]{1,60})[a-z0-9]$/, 'Solo minusculas, numeros y guiones'),
})

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'El codigo son 6 digitos'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo no valido'),
})

/**
 * Contraseña nueva tras seguir el enlace de recuperacion.
 *
 * Se pide dos veces, a diferencia de cuando un administrador asigna la de otra
 * persona. Ahi el administrador VE lo que escribio y puede reasignarla; aqui un
 * error de tecleo deja a alguien fuera de su cuenta, y el unico camino de vuelta
 * es otro correo — que es justo lo que acaba de costarle llegar hasta aqui.
 */
export const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, 'Minimo 12 caracteres')
      .regex(/[a-z]/, 'Debe incluir una minuscula')
      .regex(/[A-Z]/, 'Debe incluir una mayuscula')
      .regex(/[0-9]/, 'Debe incluir un numero'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })

export type Credentials = z.infer<typeof credentialsSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type OrganizationInput = z.infer<typeof organizationSchema>
