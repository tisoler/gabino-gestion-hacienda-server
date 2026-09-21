import { IsDateString, IsOptional, Matches } from "class-validator";

export class ActualizarAlimentacionFechaDto {
  @IsDateString()
  fecha: string;

  /** Hora 'HH:MM' (default 12:00). */
  @IsOptional()
  @Matches(/^(\d{2}):(\d{2})(:\d{2})?$/)
  hora?: string;
}
