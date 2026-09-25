import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { AjusteLoteDto } from "./create-alimentacion.dto";

export class ActualizarAlimentacionDto {
  @IsDateString()
  fecha: string;

  /** Hora 'HH:MM' (default 12:00). */
  @IsOptional()
  @Matches(/^(\d{2}):(\d{2})(:\d{2})?$/)
  hora?: string;

  /** Dieta a aplicar (opcional: si no viene, se mantiene la actual). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idDieta?: number;

  /** Cantidad del corral en kg (opcional: si no viene, se mantiene la actual). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  cantidadKg?: number;

  /** Override editable de los conteos por lote (reemplaza la reconstrucción). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AjusteLoteDto)
  ajuste?: AjusteLoteDto[];

  /**
   * Marca de liquidada (la setea el futuro módulo de liquidaciones). Sin UI
   * por ahora; una liquidada no se puede eliminar.
   */
  @IsOptional()
  @IsBoolean()
  liquidada?: boolean;
}
