import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from "class-validator";

export class CreateAlimentacionDto {
  @IsInt()
  @Min(1)
  idCorral: number;

  @IsInt()
  @Min(1)
  idDieta: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: "La cantidad debe ser mayor que 0" })
  cantidadKg: number;

  /** Fecha de la alimentación (default hoy si no viene). */
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
