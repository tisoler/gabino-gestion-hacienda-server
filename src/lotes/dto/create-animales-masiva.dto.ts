import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * Fila del preview de la carga masiva: caravana obligatoria + N°/peso opcional.
 * `peso` sólo aplica (y se exige) cuando se une a una partida que ya tiene
 * pesaje inicial.
 */
export class AnimalMasivoItemDto {
  @IsString()
  @IsNotEmpty({ message: "La caravana es obligatoria" })
  @MaxLength(50)
  caravana: string;

  /** Si no viene, se autocomplea desde el último N° del lote. */
  @IsOptional()
  @IsInt()
  nAnimal?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  peso?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbaste?: number;
}

export class CreateAnimalesMasivaDto {
  /** Catálogo `raza` (opcional; se puede editar después por animal/partida/lote). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idRaza?: number;

  /** Catálogo `pelaje` (opcional; se puede editar después por animal/partida/lote). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idPelaje?: number;

  /** Catálogo `categoria` (opcional; el sexo se infiere si se setea). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoria?: number;

  @IsInt()
  @Min(1)
  @Max(500)
  cantidad: number;

  /** true = crea una partida nueva (hoy). Excluyente con idPartida. */
  @IsOptional()
  @IsBoolean()
  nuevaPartida?: boolean;

  /** Partida existente a la que unir la tanda. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idPartida?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AnimalMasivoItemDto)
  animales: AnimalMasivoItemDto[];
}
