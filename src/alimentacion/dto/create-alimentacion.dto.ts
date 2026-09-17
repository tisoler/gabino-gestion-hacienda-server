import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from "class-validator";

export class FilaAlimentacionDto {
  @IsInt()
  @Min(1)
  idDieta: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: "La cantidad debe ser mayor que 0" })
  cantidadKg: number;

  @IsDateString()
  fecha: string;
}

export class CreateAlimentacionDto extends FilaAlimentacionDto {
  @IsInt()
  @Min(1)
  idCorral: number;
}

export class CreateAlimentacionesMasivaDto {
  @IsInt()
  @Min(1)
  idCorral: number;

  @Type(() => FilaAlimentacionDto)
  @ValidateNested({ each: true })
  filas: FilaAlimentacionDto[];
}
