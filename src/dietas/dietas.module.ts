import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Dieta,
  DietaVersion,
  DietaVersionIngrediente,
} from "../entities/dieta.entity";
import { Ingrediente } from "../entities/catalogo.entity";
import { DietasService } from "./dietas.service";
import { DietasController } from "./dietas.controller";
import { CatalogosModule } from "../catalogos/catalogos.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dieta,
      DietaVersion,
      DietaVersionIngrediente,
      Ingrediente,
    ]),
    CatalogosModule,
  ],
  providers: [DietasService],
  controllers: [DietasController],
})
export class DietasModule {}
