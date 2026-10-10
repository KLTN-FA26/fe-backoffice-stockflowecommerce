import { z } from "zod";

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

// BE develop: identity/internal/controller/dto/MeResponse.java and MeController.me.
// fullName and lastLoginAt are nullable in V20260902001200__identity_users_roles.sql.
// Keep role authorities verbatim; the legacy UI role registry is a separate concern.
export const authUserSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  email: z.string(),
  fullName: z.string().nullable(),
  status: z.string(),
  roles: z.array(z.string()),
  lastLoginAt: z.iso.datetime({ offset: true }).nullable(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type LoginResponse = AuthUser;
