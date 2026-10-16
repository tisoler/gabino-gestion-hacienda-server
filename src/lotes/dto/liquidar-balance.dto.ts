import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** Precio editado de un insumo de un tratamiento (id = tratamiento_aplicado_insumo.id). */
export class LiquidarInsumoDto {
  @IsInt()
  @Min(1)
  id: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;
}

/**
 * Un ítem a liquidar. `precio` es el valor editado al liquidar (si no viene,
 * se usa la referencia viva del momento):
 * - alimentación: $/kg (el costo se congela como kg × $/kg);
 * - tratamiento: precio base del tratamiento (los insumos van en `insumos`);
 * - costo: monto (override del imputado).
 */
export class LiquidarItemDto {
  @IsIn(["alimentacion", "tratamiento", "costo"])
  tipo: string;

  @IsInt()
  @Min(1)
  id: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiquidarInsumoDto)
  insumos?: LiquidarInsumoDto[];
}

/**
 * Costo vario creado inline al generar la liquidación: se imputa al lote y
 * nace liquidado (bloqueado, no deseleccionable). `idCosto` existente o
 * `nombre` nuevo (se crea en la empresa); `fecha` default = fecha de la
 * liquidación; `descripcion` default = nombre del costo.
 */
export class CostoNuevoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idCosto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto: number;
}

export class LiquidarBalanceDto {
  /** Fecha de la liquidación (cabecera + default de costos nuevos). */
  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiquidarItemDto)
  items?: LiquidarItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CostoNuevoDto)
  costosNuevos?: CostoNuevoDto[];
}
