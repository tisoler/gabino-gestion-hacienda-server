import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateUserCelularDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  celular?: string;
}
