import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateEmpresaDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre de la empresa es obligatorio" })
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string;
}
