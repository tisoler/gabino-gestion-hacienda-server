import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Alimentacion } from "../entities/alimentacion.entity";
import { AlimentacionLote } from "../entities/alimentacion-lote.entity";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Dieta, DietaVersion } from "../entities/dieta.entity";
import { LoteCorralAsignacion } from "../entities/lote-corral-asignacion.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Salida } from "../entities/salida.entity";
import { SalidaAnimal } from "../entities/salida-animal.entity";
import { AlimentacionService } from "./alimentacion.service";
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
      LoteCorralAsignacion,
      AnimalMovimiento,
      Salida,
      SalidaAnimal,
    ]),
  ],
  providers: [AlimentacionService],
  controllers: [AlimentacionController],
})
export class AlimentacionModule {}
