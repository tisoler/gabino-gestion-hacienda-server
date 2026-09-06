import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmpresaCliente } from "../entities/empresa-cliente.entity";
import { Empresa } from "../entities/empresa.entity";
import { ClientesService } from "./clientes.service";
import { ClientesController } from "./clientes.controller";

@Module({
  imports: [TypeOrmModule.forFeature([EmpresaCliente, Empresa])],
  providers: [ClientesService],
  controllers: [ClientesController],
})
export class ClientesModule {}
