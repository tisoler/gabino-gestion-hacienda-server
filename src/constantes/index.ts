export const Roles = {
  SYS_ADMIN: "sys-admin",
  ANFITRION: "anfitrion",
  OPERARIO: "operario",
  CLIENTE: "cliente",
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/**
 * idRol (roles/{id}.nombre en Firestore). La colección "roles" debe tener
 * los docs: 1=sys-admin, 2=anfitrion, 3=operario, 4=cliente.
 */
export const ID_ROL_SYS_ADMIN = 1;
export const ID_ROL_ANFITRION = 2;
export const ID_ROL_OPERARIO = 3;
export const ID_ROL_CLIENTE = 4;

/**
 * Rol asignable por sys-admin a un usuario nuevo (PATCH /usuarios/:uid/rol).
 * Un usuario se registra SIN rol (idRol: null, pendiente de asignación) y el
 * admin lo habilita como anfitrión, cliente u operario.
 */
export const ID_ROL_ASIGNABLES = [
  ID_ROL_ANFITRION,
  ID_ROL_OPERARIO,
  ID_ROL_CLIENTE,
] as const;

/**
 * Paleta de colores para lotes (se auto-asigna al crear, rotando por empresa).
 * La UI replica esta paleta para los pickers; el mapa de corrales la usa para
 * pintar la ficha de cada animal con el color de su lote.
 */
export const PALETA_LOTE = [
  "#8B5E34", // marrón (marca)
  "#2F6F4F", // verde
  "#B45309", // ámbar
  "#1D4ED8", // azul
  "#7C3AED", // violeta
  "#DB2777", // rosa
  "#0F766E", // teal
  "#B91C1C", // rojo
  "#57534E", // piedra
  "#A16207", // oliva
] as const;
