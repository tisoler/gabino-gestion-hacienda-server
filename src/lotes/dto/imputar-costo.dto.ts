import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

/**
 * Imputa un costo vario pendiente al lote (queda en el balance hasta
 * liquidarse). `idCosto` existente o `nombre` nuevo (se crea en la empresa);
 * `descripcion` default = nombre del costo.
 */
export class ImputarCostoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idCosto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto: number;
}
