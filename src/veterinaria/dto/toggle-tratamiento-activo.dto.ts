import { IsBoolean } from "class-validator";

export class ToggleTratamientoActivoDto {
  @IsBoolean()
  activo: boolean;
}
