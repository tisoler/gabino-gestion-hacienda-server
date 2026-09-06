import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdateLoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  /** null/'' saca el lote del corral. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCorral?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idCliente?: string;

  /** Catálogo `proveedor` (global o de la empresa). null = limpiar. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idProveedor?: number | null;

  /** Catálogo `lugar_origen` (global o de la empresa). null = limpiar. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idLugarOrigen?: number | null;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "El color debe ser un hex (#rrggbb)",
  })
  color?: string;
}
