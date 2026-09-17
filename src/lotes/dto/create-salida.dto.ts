import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";

export class SalidaAnimalDto {
  @IsInt()
  @Min(1)
  animalId: number;

  /** Requerido si el animal no tiene pesaje final (si lo tiene, se usa ése). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pesoFinal?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  desbaste?: number;
}

export class CreateSalidaDto {
  @IsDateString()
  fecha: string;

  /** 'lote' (todos los vivos) | 'partida' (todos los vivos de la partida) | 'animales' (selección). */
  @IsIn(["lote", "partida", "animales"])
  tipo: "lote" | "partida" | "animales";

  /** Obligatoria si `tipo === 'partida'`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idPartida?: number;

  /** Todos los animales que salen (para 'lote'/'partida' deben ser TODOS los vivos del grupo). */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SalidaAnimalDto)
  animales: SalidaAnimalDto[];
}
