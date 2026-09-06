import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Corral } from "../entities/corral.entity";
import { Empresa } from "../entities/empresa.entity";
import { LotesService } from "./lotes.service";
import { LotesController } from "./lotes.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Lote, Animal, Corral, Empresa])],
  providers: [LotesService],
  controllers: [LotesController],
})
export class LotesModule {}
