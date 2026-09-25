import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CategoriaInsumo, Insumo } from "../entities/insumo.entity";
import { InsumosService } from "./insumos.service";
import { InsumosController } from "./insumos.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Insumo, CategoriaInsumo])],
  providers: [InsumosService],
  controllers: [InsumosController],
})
export class InsumosModule {}
