import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Categoria,
  LugarOrigen,
  Motivo,
  Pelaje,
  Proveedor,
  Raza,
} from "../entities/catalogo.entity";
import { Empresa } from "../entities/empresa.entity";
import { CatalogosService } from "./catalogos.service";
import { CatalogosController } from "./catalogos.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Raza,
      Categoria,
      Pelaje,
      Proveedor,
      LugarOrigen,
      Motivo,
      Empresa,
    ]),
  ],
  providers: [CatalogosService],
  controllers: [CatalogosController],
  exports: [CatalogosService],
})
export class CatalogosModule {}
