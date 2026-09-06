import { IsBoolean } from "class-validator";

export class UpdateCorralActivoDto {
  @IsBoolean()
  activo: boolean;
}
