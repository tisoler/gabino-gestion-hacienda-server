import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class EnviarEnfermeriaDto {
  /**
   * Corral de enfermería destino. Opcional: si no viene, se usa el primer
   * corral 'enfermeria' activo de la empresa (la UI ofrece picker si hay varios).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCorral?: number;

  /**
   * Motivo/enfermedad (texto libre desde el autocomplete). El server resuelve
   * el catálogo `motivo` (busca por nombre global/empresa o lo crea asociado a
   * la empresa) y lo guarda como snapshot en el movimiento.
   */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;

  /** Alternativa: id de un `motivo` ya existente (globlal o de la empresa). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idMotivo?: number;
}
