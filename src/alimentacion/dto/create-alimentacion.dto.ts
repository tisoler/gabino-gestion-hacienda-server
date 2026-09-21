import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

/** Override editable de los conteos reconstruidos por lote. */
export class AjusteLoteDto {
  @IsInt()
  @Min(1)
  loteId: number;

  @IsInt()
  @Min(0)
  nAnimales: number;

  @IsInt()
  @Min(0)
  nAnimalesEnfermeria: number;
}

export class FilaAlimentacionDto {
  @IsInt()
  @Min(1)
  idDieta: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: "La cantidad debe ser mayor que 0" })
  cantidadKg: number;

  @IsDateString()
  fecha: string;

  /** Hora 'HH:MM' (default 12:00). Junto a fecha forma el instante T. */
  @IsOptional()
  @Matches(/^(\d{2}):(\d{2})(:\d{2})?$/)
  hora?: string;

  /**
   * Opcional: reemplaza la reconstrucción del corral al instante T con los
   * conteos por lote que ajustó el usuario.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AjusteLoteDto)
  ajuste?: AjusteLoteDto[];
}

export class CreateAlimentacionDto extends FilaAlimentacionDto {
  @IsInt()
  @Min(1)
  idCorral: number;
}

export class CreateAlimentacionesMasivaDto {
  @IsInt()
  @Min(1)
  idCorral: number;

  @Type(() => FilaAlimentacionDto)
  @ValidateNested({ each: true })
  filas: FilaAlimentacionDto[];
}
