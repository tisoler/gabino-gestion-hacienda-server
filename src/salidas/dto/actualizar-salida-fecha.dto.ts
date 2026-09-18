import { IsDateString } from "class-validator";

export class ActualizarSalidaFechaDto {
  @IsDateString()
  fecha: string;
}
