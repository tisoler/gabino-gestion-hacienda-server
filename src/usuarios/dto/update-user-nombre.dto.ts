import { IsString, MaxLength } from "class-validator";

export class UpdateUserNombreDto {
  @IsString()
  @MaxLength(200)
  nombre: string;
}
