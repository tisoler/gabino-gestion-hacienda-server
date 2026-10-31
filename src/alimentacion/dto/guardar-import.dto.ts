import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
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

/** Fila de dieta: alta como alimentación del corral. */
export class ImportFilaDietaDto {
  @IsInt()
  @Min(1)
  idDieta: number;
}

/** Fila de tratamiento: aplicación al lote (sin insumos conocidos). */
export class ImportFilaTratamientoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idTratamiento?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
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
}

/** Fila de insumo suelto: se aplica con el tratamiento global contenedor. */
export class ImportFilaInsumoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idInsumo?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
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
}

/**
 * Una fila del preview a dar de alta. `ref` identifica la fila del FE (se
 * devuelve en `creadas` y `errores` para conciliar el preview).
 * Exactamente uno de `dieta` / `tratamiento` / `insumo` debe venir.
 */
export class ImportFilaDto {
  @IsString()
  @MaxLength(255)
  ref: string;

  @IsDateString()
  fecha: string;

  /** Hora 'HH:MM' (default 09:00, como el turno mañana de la planilla). */
  @IsOptional()
  @Matches(/^(\d{2}):(\d{2})(:\d{2})?$/)
  hora?: string;

  @IsInt()
  @Min(1)
  idCorral: number;

  /**
   * Dieta: kg del corral. Tratamiento/insumo: cantidad de insumo
   * (informativa en tratamientos sin insumo conocido).
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cantidad: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImportFilaDietaDto)
  dieta?: ImportFilaDietaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImportFilaTratamientoDto)
  tratamiento?: ImportFilaTratamientoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImportFilaInsumoDto)
  insumo?: ImportFilaInsumoDto;
}

export class GuardarImportDto {
  @IsArray()
  @ArrayNotEmpty({ message: "No hay filas para guardar" })
  @ValidateNested({ each: true })
  @Type(() => ImportFilaDto)
  filas: ImportFilaDto[];
}

export interface ImportFilaError {
  ref: string;
  mensaje: string;
}

export interface GuardarImportResult {
  /** Refs de las filas dadas de alta (para quitarlas del preview). */
  creadas: string[];
  /** Una entrada por fila que falló (se procesa fila por fila). */
  errores: ImportFilaError[];
  alimentaciones: number;
  aplicaciones: number;
  animalesAlcanzados: number;
}
