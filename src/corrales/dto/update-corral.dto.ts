import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

/** El tipo no es editable tras la creación. */
export class UpdateCorralDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;
}
