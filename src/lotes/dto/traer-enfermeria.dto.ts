import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

/**
 * Traer un animal de enfermería: el usuario elige el estado de salida
 * ('sano' | 'muerto') y, opcionalmente, el motivo/causa (autocomplete).
 */
export class TraerEnfermeriaDto {
  @IsIn(["sano", "muerto"])
  estado: string;

  /** Fecha del movimiento (default hoy). */
  @IsOptional()
  @IsDateString()
  fecha?: string;

  /** Hora del movimiento 'HH:MM' (default ahora). */
  @IsOptional()
  @Matches(/^(\d{2}):(\d{2})(:\d{2})?$/)
  hora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idMotivo?: number;
}
