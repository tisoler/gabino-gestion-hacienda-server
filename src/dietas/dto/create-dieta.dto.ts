import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

/**
 * Ingrediente de una dieta: existente (`idIngrediente`) o NUEVO (`nombre`, que
 * el server persiste en el alcance de la dieta). Siempre con su `porcentaje`.
 */
export class IngredienteDietaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idIngrediente?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @IsNotEmpty({ message: "El nombre del ingrediente es obligatorio" })
  @MaxLength(100)
  nombre?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: "El porcentaje debe ser mayor que 0" })
  @Max(100)
  porcentaje: number;
}

export class CreateDietaDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre de la dieta es obligatorio" })
  @MaxLength(100)
  nombre: string;

  @IsArray()
  @ArrayNotEmpty({ message: "Agregá al menos un ingrediente" })
  @ValidateNested({ each: true })
  @Type(() => IngredienteDietaDto)
  ingredientes: IngredienteDietaDto[];

  /**
   * Sólo sys-admin: empresa destino (null = dieta GLOBAL). Para el resto se
   * ignora y se usa su empresa actual.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idEmpresa?: number | null;
}
