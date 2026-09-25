import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { INSUMO_UNIDADES } from "./create-insumo.dto";

export class UpdateInsumoDto {
  @IsOptional()
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
  @IsInt()
  @Min(1)
  idCategoria?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @IsNotEmpty({ message: "El nombre de la categoría es obligatorio" })
  @MaxLength(100)
  categoriaNueva?: string;

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

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /**
   * Sólo sys-admin: cambia el alcance (null = GLOBAL). El resto no puede
   * mover un insumo de empresa.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idEmpresa?: number | null;
}
