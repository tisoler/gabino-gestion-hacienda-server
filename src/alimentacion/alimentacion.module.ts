import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Alimentacion } from "../entities/alimentacion.entity";
import { AlimentacionLote } from "../entities/alimentacion-lote.entity";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Dieta, DietaVersion } from "../entities/dieta.entity";
import { Partida } from "../entities/partida.entity";
import { LoteCorralAsignacion } from "../entities/lote-corral-asignacion.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Salida } from "../entities/salida.entity";
import { SalidaAnimal } from "../entities/salida-animal.entity";
import {
  TratamientoAplicado,
  TratamientoAplicadoInsumo,
  TratamientoAplicadoLote,
} from "../entities/tratamiento.entity";
import { VeterinariaModule } from "../veterinaria/veterinaria.module";
import { AlimentacionService } from "./alimentacion.service";
import { OcrService } from "./ocr.service";
import { ExcelService } from "./excel.service";
import { AlimentacionController } from "./alimentacion.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Alimentacion,
      AlimentacionLote,
      Corral,
      Lote,
      Animal,
      Dieta,
      DietaVersion,
      Partida,
      LoteCorralAsignacion,
      AnimalMovimiento,
      Salida,
      SalidaAnimal,
      TratamientoAplicado,
      TratamientoAplicadoLote,
      TratamientoAplicadoInsumo,
    ]),
    VeterinariaModule,
  ],
  providers: [AlimentacionService, OcrService, ExcelService],
  controllers: [AlimentacionController],
})
export class AlimentacionModule {}
