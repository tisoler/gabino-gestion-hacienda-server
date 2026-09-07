import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
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

/** Fila del preview de la carga masiva: caravana obligatoria + N° opcional. */
export class AnimalMasivoItemDto {
  @IsString()
  @IsNotEmpty({ message: "La caravana es obligatoria" })
  @MaxLength(50)
  caravana: string;

  /** Si no viene, se autocomplea desde el último N° del lote. */
  @IsOptional()
  @IsInt()
  nAnimal?: number;
}

export class CreateAnimalesMasivaDto {
  /** Catálogo `raza` (opcional). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idRaza?: number;

  /** Catálogo `pelaje` (requerido). */
  @IsInt()
  @Min(1)
  idPelaje: number;

  /** Catálogo `categoria` (requerido; el sexo se infiere). */
  @IsInt()
  @Min(1)
  idCategoria: number;

  @IsInt()
  @Min(1)
  @Max(500)
  cantidad: number;

  @IsOptional()
  @IsDateString()
  fechaPesajeIni?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  pesoInicial?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbasteIni?: number;

  @IsOptional()
  @IsDateString()
  fechaPesajeFin?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  pesoFinal?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbasteFin?: number;

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
