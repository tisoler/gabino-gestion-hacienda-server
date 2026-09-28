import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdateTratamientoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "El nombre del tratamiento es obligatorio" })
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(255)
  descripcion?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioReferencia?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /**
   * Sólo sys-admin: cambia el alcance (null = GLOBAL). El resto no puede
   * mover un tratamiento de empresa.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idEmpresa?: number | null;
}
