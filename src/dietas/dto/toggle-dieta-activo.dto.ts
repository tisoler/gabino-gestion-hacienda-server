import { IsBoolean } from "class-validator";

export class ToggleDietaActivoDto {
  @IsBoolean()
  activa: boolean;
}
