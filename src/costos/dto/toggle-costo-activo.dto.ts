import { IsBoolean } from "class-validator";

export class ToggleCostoActivoDto {
  @IsBoolean()
  activo: boolean;
}
