import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdateAnimalDto {
  @IsOptional()
  @IsInt()
  nAnimal?: number;

  @IsOptional()
  @IsIn(["MACHO", "HEMBRA"])
  sexo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  pelaje?: string;

  /** Catálogo `raza` (global o de la empresa). null = limpiar. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idRaza?: number | null;

  /** Catálogo `categoria` (global o de la empresa). null = limpiar. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idCategoria?: number | null;

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

  @IsOptional()
  @IsIn(["sano", "enfermo", "muerto"])
  estado?: string;

  /**
   * Motivo/causa (obligatorio si `estado` cambia a 'enfermo' o 'muerto').
   * Se registra en el historial de movimientos del animal.
   */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;

  /** Alternativa: id de un `motivo` existente (global o de la empresa). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idMotivo?: number;
}
