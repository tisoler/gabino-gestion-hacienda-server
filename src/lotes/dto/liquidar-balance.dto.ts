import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from "class-validator";

/** Un ítem a liquidar: alimentación, tratamiento individual o aplicación al lote. */
export class LiquidarItemDto {
  @IsIn(["alimentacion", "tratamiento", "aplicacion"])
  tipo: string;

  @IsInt()
  @Min(1)
  id: number;
}

export class LiquidarBalanceDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Seleccioná al menos un ítem a liquidar" })
  @ValidateNested({ each: true })
  @Type(() => LiquidarItemDto)
  items: LiquidarItemDto[];
}
