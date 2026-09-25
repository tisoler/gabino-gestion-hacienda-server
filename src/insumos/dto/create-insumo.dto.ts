import {
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

/** Unidades admitidas para el precio de referencia de un insumo. */
export const INSUMO_UNIDADES = ["kg", "unidad"] as const;

export class CreateInsumoDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre del insumo es obligatorio" })
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  /**
   * Categoría existente (debe ser global o de la empresa destino). Alternativa:
   * `categoriaNueva` (nombre; el server la busca o la crea con el alcance del
   * insumo, mismo mecanismo que los insumos nuevos al guardar una dieta).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoria?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @IsNotEmpty({ message: "El nombre de la categoría es obligatorio" })
  @MaxLength(100)
  categoriaNueva?: string;

  /** Precio de referencia (número, sin moneda). */
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

  /**
   * Sólo sys-admin: empresa destino (null = insumo GLOBAL). Para el resto se
   * ignora y se usa su empresa actual.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idEmpresa?: number | null;
}
