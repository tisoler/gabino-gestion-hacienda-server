import { IsBoolean } from "class-validator";

export class ToggleInsumoActivoDto {
  @IsBoolean()
  activo: boolean;
}
