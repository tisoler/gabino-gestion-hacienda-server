import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { CacheModule } from "./cache/cache.module";
import { EmpresasModule } from "./empresas/empresas.module";
import { ClientesModule } from "./clientes/clientes.module";
import { UsuariosModule } from "./usuarios/usuarios.module";
import { LotesModule } from "./lotes/lotes.module";
import { CorralesModule } from "./corrales/corrales.module";
import { CatalogosModule } from "./catalogos/catalogos.module";
import { DietasModule } from "./dietas/dietas.module";
import { AlimentacionModule } from "./alimentacion/alimentacion.module";
import { SalidasModule } from "./salidas/salidas.module";
import { InsumosModule } from "./insumos/insumos.module";

import { Empresa } from "./entities/empresa.entity";
import { EmpresaCliente } from "./entities/empresa-cliente.entity";
import { Lote } from "./entities/lote.entity";
import { Animal } from "./entities/animal.entity";
import { Corral } from "./entities/corral.entity";
import { AnimalMovimiento } from "./entities/animal-movimiento.entity";
import { Pesaje } from "./entities/pesaje.entity";
import { Partida } from "./entities/partida.entity";
import {
  Categoria,
  LugarOrigen,
  Motivo,
  Pelaje,
  Proveedor,
  Raza,
} from "./entities/catalogo.entity";
import {
  Dieta,
  DietaVersion,
  DietaVersionInsumo,
} from "./entities/dieta.entity";
import { Alimentacion } from "./entities/alimentacion.entity";
import { AlimentacionLote } from "./entities/alimentacion-lote.entity";
import { Salida } from "./entities/salida.entity";
import { SalidaAnimal } from "./entities/salida-animal.entity";
import { LoteCorralAsignacion } from "./entities/lote-corral-asignacion.entity";
import { CategoriaInsumo, Insumo } from "./entities/insumo.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get<string>("DB_HOST"),
        port: configService.get<number>("DB_PORT"),
        username: configService.get<string>("DB_USERNAME"),
        password: configService.get<string>("DB_PASSWORD"),
        database: configService.get<string>("DB_DATABASE"),
        entities: [
          Empresa,
          EmpresaCliente,
          Lote,
          Animal,
          Corral,
          AnimalMovimiento,
          Pesaje,
          Partida,
          Raza,
          Categoria,
          Pelaje,
          Proveedor,
          LugarOrigen,
          Motivo,
          Dieta,
          DietaVersion,
          DietaVersionInsumo,
          Alimentacion,
          AlimentacionLote,
          Salida,
          SalidaAnimal,
          LoteCorralAsignacion,
          Insumo,
          CategoriaInsumo,
        ],
        synchronize: false, // Migraciones manuales
        logging: true,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    CacheModule,
    EmpresasModule,
    ClientesModule,
    UsuariosModule,
    LotesModule,
    CorralesModule,
    CatalogosModule,
    DietasModule,
    AlimentacionModule,
    SalidasModule,
    InsumosModule,
  ],
})
export class AppModule {}
