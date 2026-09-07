import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateCatalogoDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre es obligatorio" })
  @MaxLength(100)
  nombre: string;

  /** Sólo `categoria': sexo inferido al crear la categoría. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== "")
  @IsIn(["MACHO", "HEMBRA"])
  sexo?: string | null;

  /** Sólo `pelaje': raza con la que asociar el pelaje (creada o existente). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idRaza?: number | null;
}
