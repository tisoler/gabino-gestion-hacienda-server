import { SetMetadata } from "@nestjs/common";

/** Uno o varios permisos (varios = OR: alcanza con uno). */
export const Permissions = (...permissions: string[]) =>
  SetMetadata("permission", permissions);
