import { IsOptional, IsString, MaxLength } from "class-validator";

export class BootstrapUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  celular?: string;
}
