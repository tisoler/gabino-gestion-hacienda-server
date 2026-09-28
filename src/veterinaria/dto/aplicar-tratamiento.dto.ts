import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { INSUMO_UNIDADES } from "../../insumos/dto/create-insumo.dto";

/**
 * Insumo de un tratamiento aplicado: existente (`idInsumo`, con categoría
 * Veterinaria y alcance compatible) o NUEVO (datos del modal, que el server
 * crea con la empresa del lote — bajo escritura:veterinaria, sin pedir
 * escritura:insumo, igual que en dietas).
 */
export class TratamientoAplicadoInsumoDto {
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

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idCategoria?: number | null;

  /** Precio aplicado (default: precio de referencia). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio?: number | null;
}

/**
 * Un tratamiento aplicado: existente (`idTratamiento`) o NUEVO (datos del
 * modal, creado con la empresa del lote), con uno o más insumos. `id` =
 * registro existente a actualizar (sólo al traer de enfermería).
 */
export class TratamientoAplicadoItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idTratamiento?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
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

  /** Precio aplicado (default: precio de referencia). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio?: number | null;

  @IsArray()
  @ArrayNotEmpty({ message: "Cada tratamiento lleva al menos un insumo" })
  @ValidateNested({ each: true })
  @Type(() => TratamientoAplicadoInsumoDto)
  insumos: TratamientoAplicadoInsumoDto[];
}

export class AplicarTratamientosDto {
  /** Fecha del tratamiento (default hoy). */
  @IsOptional()
  @IsDateString()
  fecha?: string;

  /** Hora 'HH:MM' (default ahora). */
  @IsOptional()
  @Matches(/^(\d{2}):(\d{2})(:\d{2})?$/)
  hora?: string;

  @IsArray()
  @ArrayNotEmpty({ message: "Agregá al menos un tratamiento" })
  @ValidateNested({ each: true })
  @Type(() => TratamientoAplicadoItemDto)
  items: TratamientoAplicadoItemDto[];
}

/** Aplicar tratamiento(s) a UN animal (modal del historial, sin movimiento). */
export class AplicarAnimalDto extends AplicarTratamientosDto {
  @IsInt()
  @Min(1)
  idLote: number;

  @IsInt()
  @Min(1)
  animalId: number;
}
