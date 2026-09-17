import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Salida } from "../entities/salida.entity";
import { SalidaAnimal } from "../entities/salida-animal.entity";
import { Lote } from "../entities/lote.entity";
import { SalidasService } from "./salidas.service";
import { SalidasController } from "./salidas.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Salida, SalidaAnimal, Lote])],
  providers: [SalidasService],
  controllers: [SalidasController],
})
export class SalidasModule {}
