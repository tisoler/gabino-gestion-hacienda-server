import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
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
import { INSUMO_UNIDADES } from "../../insumos/dto/create-insumo.dto";

/**
 * Insumo de una dieta: existente (`idInsumo`, con categoría "Ingrediente
 * dieta" y alcance compatible) o NUEVO (`nombre` + opcionales, que el server
 * crea como insumo con esa categoría y el alcance de la dieta — "crear vía
 * dieta", sin exigir escritura:insumo).
 */
export class InsumoDietaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idInsumo?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @IsNotEmpty({ message: "El nombre del insumo es obligatorio" })
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
  @ValidateIf((_o, v) => v !== null && v !== undefined && v !== "")
  @IsString()
  @IsIn(INSUMO_UNIDADES as unknown as string[])
  unidad?: string;

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
  @ArrayNotEmpty({ message: "Agregá al menos un insumo" })
  @ValidateNested({ each: true })
  @Type(() => InsumoDietaDto)
  insumos: InsumoDietaDto[];

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
