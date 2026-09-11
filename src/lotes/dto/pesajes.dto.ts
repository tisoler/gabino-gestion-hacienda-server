import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  ValidateNested,
} from "class-validator";

/** 'total' (un peso para todo el lote, se reparte) | 'animal' (peso por animal). */
export type ModoPeso = "total" | "animal";

export class PesajeAnimalRowDto {
  @IsInt()
  animalId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  peso: number;

  /** Desbaste opcional de ese animal en ese pesaje. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbaste?: number;
}

/**
 * Carga de pesajes del lote (inicial o intermedio). El peso se guarda SIEMPRE
 * por animal: con `modo: 'total'` el server reparte `pesoTotal / cantidad`
 * entre los animales del lote; con `modo: 'animal'` usa la lista `animales`.
 */
export class CargarPesajesDto {
  @IsDateString()
  fecha: string;

  @IsIn(["total", "animal"])
  modo: ModoPeso;

  /** modo 'total': peso bruto del lote (kg). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  pesoTotal?: number;

  /** modo 'total': desbaste total (kg, opcional; se reparte igual). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbasteTotal?: number;

  /** modo 'animal': un peso por animal. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PesajeAnimalRowDto)
  animales?: PesajeAnimalRowDto[];
}

/** Edición de un pesaje puntual (peso/desbaste/fecha). */
export class EditarPesajeDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  peso?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbaste?: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}
