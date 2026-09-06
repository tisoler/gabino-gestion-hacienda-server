import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateCatalogoDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre es obligatorio" })
  @MaxLength(100)
  nombre: string;
}
