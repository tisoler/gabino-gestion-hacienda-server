import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateCorralDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre del corral es obligatorio" })
  @MaxLength(100)
  nombre: string;

  @IsIn(["comun", "enfermeria"], {
    message: "El tipo debe ser 'comun' o 'enfermeria'",
  })
  tipo: string;

  /** Informativa: no se bloquea el exceso de animales. */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;
}
