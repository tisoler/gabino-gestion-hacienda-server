import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Tratamiento,
  TratamientoAplicado,
  TratamientoAplicadoInsumo,
  TratamientoAplicadoLote,
} from "../entities/tratamiento.entity";
import { CategoriaInsumo, Insumo } from "../entities/insumo.entity";
import { Animal } from "../entities/animal.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Lote } from "../entities/lote.entity";
import { CacheModule } from "../cache/cache.module";
import { TratamientosService } from "./veterinaria.service";
import { VeterinariaController } from "./veterinaria.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tratamiento,
      TratamientoAplicado,
      TratamientoAplicadoInsumo,
      TratamientoAplicadoLote,
      Insumo,
      CategoriaInsumo,
      Animal,
      AnimalMovimiento,
      Lote,
    ]),
    CacheModule,
  ],
  providers: [TratamientosService],
  controllers: [VeterinariaController],
  exports: [TratamientosService],
})
export class VeterinariaModule {}
