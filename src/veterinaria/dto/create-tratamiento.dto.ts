import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateTratamientoDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre del tratamiento es obligatorio" })
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  /** Precio de referencia (número, sin moneda). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioReferencia?: number | null;

  /**
   * Sólo sys-admin: empresa destino (null = tratamiento GLOBAL). Para el resto
   * se ignora y se usa su empresa actual.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idEmpresa?: number | null;
}
