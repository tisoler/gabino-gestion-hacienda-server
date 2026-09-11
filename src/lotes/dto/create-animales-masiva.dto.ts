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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** Fila del preview de la carga masiva: caravana obligatoria + N°/peso opcional. */
export class AnimalMasivoItemDto {
  @IsString()
  @IsNotEmpty({ message: "La caravana es obligatoria" })
  @MaxLength(50)
  caravana: string;

  /** Si no viene, se autocomplea desde el último N° del lote. */
  @IsOptional()
  @IsInt()
  nAnimal?: number;

  /** Peso inicial POR ANIMAL (sólo con modoInicial='animal'). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  peso?: number;

  /** Desbaste inicial por animal (opcional). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbaste?: number;
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

  /** Fecha del pesaje inicial (si se carga peso inicial). */
  @IsOptional()
  @IsDateString()
  fechaPesajeIni?: string;

  /** 'total' (repartir pesoTotal) | 'animal' (peso por fila). Omiso = sin peso. */
  @IsOptional()
  @IsIn(["total", "animal"])
  modoInicial?: "total" | "animal";

  /** modoInicial='total': peso bruto del lote. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  pesoTotal?: number;

  /** modoInicial='total': desbaste total (opcional). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbasteTotal?: number;

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
