import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Costo, CostoAplicado } from "../entities/costo.entity";
import { CostosService } from "./costos.service";
import { CostosController } from "./costos.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Costo, CostoAplicado])],
  providers: [CostosService],
  controllers: [CostosController],
  exports: [CostosService],
})
export class CostosModule {}
