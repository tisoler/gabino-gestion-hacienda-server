import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Corral } from "../entities/corral.entity";
import { Empresa } from "../entities/empresa.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Pesaje } from "../entities/pesaje.entity";
import { Partida } from "../entities/partida.entity";
import { Salida } from "../entities/salida.entity";
import { SalidaAnimal } from "../entities/salida-animal.entity";
import { LoteCorralAsignacion } from "../entities/lote-corral-asignacion.entity";
import { LotesService } from "./lotes.service";
import { LotesController } from "./lotes.controller";
import { CatalogosModule } from "../catalogos/catalogos.module";
import { VeterinariaModule } from "../veterinaria/veterinaria.module";
import { AlimentacionLote } from "../entities/alimentacion-lote.entity";
import { DietaVersionInsumo } from "../entities/dieta.entity";
import { Insumo } from "../entities/insumo.entity";
import {
  TratamientoAplicado,
  TratamientoAplicadoLote,
} from "../entities/tratamiento.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lote,
      Animal,
      Corral,
      Empresa,
      AnimalMovimiento,
      Pesaje,
      Partida,
      Salida,
      SalidaAnimal,
      LoteCorralAsignacion,
      AlimentacionLote,
      DietaVersionInsumo,
      Insumo,
      TratamientoAplicado,
      TratamientoAplicadoLote,
    ]),
    CatalogosModule,
    VeterinariaModule,
  ],
  providers: [LotesService],
  controllers: [LotesController],
})
export class LotesModule {}
