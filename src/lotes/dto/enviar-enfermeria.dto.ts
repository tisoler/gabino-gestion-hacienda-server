import { IsInt, IsOptional, Min } from "class-validator";

export class EnviarEnfermeriaDto {
  /**
   * Corral de enfermería destino. Opcional: si no viene, se usa el primer
   * corral 'enfermeria' activo de la empresa (la UI ofrece picker si hay varios).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCorral?: number;
}
