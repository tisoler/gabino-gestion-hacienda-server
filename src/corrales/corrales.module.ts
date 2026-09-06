import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { CorralesService } from "./corrales.service";
import { CorralesController } from "./corrales.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Corral, Lote, Animal])],
  providers: [CorralesService],
  controllers: [CorralesController],
})
export class CorralesModule {}
