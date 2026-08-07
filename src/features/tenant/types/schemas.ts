import { z } from 'zod'

/**
 * Validacion de la administracion de usuarios de consola.
 *
 * Cada regla de aqui existe TAMBIEN en Postgres (ver
 * supabase/migrations/20260807160000_user_administration.sql). No es
 * duplicacion por descuido: la base es quien de verdad autoriza —el RPC es
 * alcanzable desde PostgREST sin pasar por este formulario— y estos schemas
 * existen para que el administrador vea "Minimo 12 caracteres" mientras escribe,
 * en vez de un error de plpgsql despues de enviar.
 *
 * Si una regla cambia, cambia en los dos sitios. La que manda es la de la base.
 */

/**
 * Misma politica que `signUpSchema`: 12 caracteres y tres clases de caracter.
 *
 * Se redeclara en vez de importarse de auth/types/schemas para que este modulo
 * no dependa de otra feature, pero el texto de los mensajes es identico a
 * proposito: la persona que recibe esta contraseña vera esas mismas reglas
 * cuando vaya a cambiarla por una suya.
 */
export const consolePasswordSchema = z
  .string()
  .min(12, 'Minimo 12 caracteres')
  .regex(/[a-z]/, 'Debe incluir una minuscula')
  .regex(/[A-Z]/, 'Debe incluir una mayuscula')
  .regex(/[0-9]/, 'Debe incluir un numero')

/**
 * `owner` no aparece: la propiedad se transfiere desde la cuenta del propietario
 * actual, no se asigna en un alta. El indice `users_single_owner_per_org_idx`
 * solo admite uno por organizacion.
 */
export const assignableRoleSchema = z.enum(['admin', 'viewer'])

export const createUserSchema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo no valido'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Escriba el nombre completo')
    .max(120, 'Maximo 120 caracteres'),
  password: consolePasswordSchema,
  role: assignableRoleSchema,
})

export const updateUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Escriba el nombre completo')
    .max(120, 'Maximo 120 caracteres'),
  role: assignableRoleSchema,
})

export const setPasswordSchema = z.object({
  password: consolePasswordSchema,
})

/**
 * El cambio de contraseña propia pide confirmacion; el que hace un administrador
 * sobre otra cuenta, no.
 *
 * No es una asimetria caprichosa: al cambiar la propia, un error de tecleo deja
 * a la persona fuera de su cuenta y sin forma de recuperarla (Nortis todavia no
 * envia correos). Al asignar la de otro, el administrador VE la contraseña que
 * escribio y puede volver a asignarla en cualquier momento.
 */
export const changeOwnPasswordSchema = z
  .object({
    password: consolePasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type AssignableRole = z.infer<typeof assignableRoleSchema>
