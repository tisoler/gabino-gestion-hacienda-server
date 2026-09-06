import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

/**
 * Traer un animal de enfermería: el usuario elige el estado de salida
 * ('sano' | 'muerto') y, opcionalmente, el motivo/causa (autocomplete).
 */
export class TraerEnfermeriaDto {
  @IsIn(["sano", "muerto"])
  estado: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idMotivo?: number;
}
