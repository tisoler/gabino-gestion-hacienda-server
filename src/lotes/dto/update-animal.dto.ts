import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
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
}
