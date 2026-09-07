/**
 * Normaliza un nombre de catálogo o corral: primera letra de la PRIMERA
 * palabra en mayúscula y el resto en minúscula (capitalize). Colapsa
 * espacios internos y recorta. Ej: "cruza EUROPEA" → "Cruza europea".
 */
export function capitalizarNombre(nombre: string): string {
  const limpio = (nombre ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return limpio;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}
