import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Corral } from "../entities/corral.entity";
import { Empresa } from "../entities/empresa.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { LotesService } from "./lotes.service";
import { LotesController } from "./lotes.controller";
import { CatalogosModule } from "../catalogos/catalogos.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Lote, Animal, Corral, Empresa, AnimalMovimiento]),
    CatalogosModule,
  ],
  providers: [LotesService],
  controllers: [LotesController],
})
export class LotesModule {}
