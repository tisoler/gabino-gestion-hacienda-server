import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

/**
 * Cambios por animal para la edición masiva. Campo ausente = no cambia;
 * `null` = limpia el valor; número = setea (catálogo validado por el server).
 */
export class ValorAnimalMasivoDto {
  @IsInt()
  @Min(1)
  animalId: number;

  @IsOptional()
  @ValidateIf((o) => o.idRaza != null)
  @IsInt()
  @Min(1)
  idRaza?: number | null;

  @IsOptional()
  @ValidateIf((o) => o.idCategoria != null)
  @IsInt()
  @Min(1)
  idCategoria?: number | null;

  @IsOptional()
  @ValidateIf((o) => o.idPelaje != null)
  @IsInt()
  @Min(1)
  idPelaje?: number | null;
}

export class EdicionMasivaDto {
  /** 'lote' (todos los animales) | 'partida' (los de una partida). */
  @IsIn(["lote", "partida"])
  alcance: "lote" | "partida";

  /** Obligatoria si `alcance === 'partida'`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idPartida?: number;

  /** Cambios por animal del alcance. */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ValorAnimalMasivoDto)
  valores: ValorAnimalMasivoDto[];
}
