import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RenombrarDietaDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre de la dieta es obligatorio" })
  @MaxLength(100)
  nombre: string;
}
