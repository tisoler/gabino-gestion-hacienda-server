import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateAnimalDto {
  @IsOptional()
  @IsInt()
  nAnimal?: number;

  @IsString()
  @IsNotEmpty({ message: "La caravana es obligatoria" })
  @MaxLength(50)
  caravana: string;

  /** Catálogo `pelaje` (global o de la empresa). Requerido. */
  @IsInt()
  @Min(1)
  idPelaje: number;

  /** Catálogo `raza` (global o de la empresa). Opcional. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idRaza?: number | null;

  /** Catálogo `categoria` (global o de la empresa). El sexo se infiere. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idCategoria?: number | null;

  /**
   * Partida del alta. `nuevaPartida: true` crea una partida hoy; `idPartida`
   * une el animal a una existente; si no se indica ninguna, el server reutiliza
   * la partida sin pesar del lote o crea una nueva.
   */
  @IsOptional()
  @IsBoolean()
  nuevaPartida?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  idPartida?: number;

  /**
   * Peso inicial POR ANIMAL. Requerido sólo cuando se une a una partida que ya
   * tiene pesaje inicial (para no distorsionar la gráfica); la fecha es la de
   * esa partida.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  pesoInicial?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desbasteIni?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @IsOptional()
  @IsIn(["sano", "enfermo", "muerto"])
  estado?: string;

  /** Motivo/causa (obligatorio si `estado` no es 'sano'). */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;
}
