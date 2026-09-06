import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class CreateLoteDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre del lote es obligatorio" })
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idCliente?: string;

  /** Corral COMÚN de la empresa, libre (o el propio al editar). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCorral?: number;

  /** Hex (#rrggbb). Si no viene, se auto-asigna rotando la paleta. */
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "El color debe ser un hex (#rrggbb)",
  })
  color?: string;

  /** Sólo sys-admin (el resto usa su empresa actual). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresa?: number;
}
