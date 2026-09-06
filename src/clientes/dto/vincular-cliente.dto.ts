import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class VincularClienteDto {
  @IsString()
  @IsNotEmpty({ message: "El uid del usuario es obligatorio" })
  uid: string;

  /** "cliente" (default) o "operario". */
  @IsOptional()
  @IsIn(["cliente", "operario"])
  rol?: string;
}
