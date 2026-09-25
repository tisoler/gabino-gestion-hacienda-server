import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Dieta,
  DietaVersion,
  DietaVersionInsumo,
} from "../entities/dieta.entity";
import { CategoriaInsumo, Insumo } from "../entities/insumo.entity";
import { DietasService } from "./dietas.service";
import { DietasController } from "./dietas.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dieta,
      DietaVersion,
      DietaVersionInsumo,
      Insumo,
      CategoriaInsumo,
    ]),
  ],
  providers: [DietasService],
  controllers: [DietasController],
})
export class DietasModule {}
