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

/** Alta "administrada" (sys-admin): para una empresa puntual o global. */
export class CreateCatalogoAdminDto {
  @IsString()
  @IsNotEmpty({ message: "El nombre es obligatorio" })
  @MaxLength(100)
  nombre: string;

  /** Empresa destino. Omitir / null = valor GLOBAL (para todas las empresas). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  idEmpresa?: number | null;

  /** Sólo `categoria': sexo ('MACHO' | 'HEMBRA' | null=indistinto). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== "")
  @IsIn(["MACHO", "HEMBRA"])
  sexo?: string | null;
}
