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

import { Empresa } from "./entities/empresa.entity";
import { EmpresaCliente } from "./entities/empresa-cliente.entity";
import { Lote } from "./entities/lote.entity";
import { Animal } from "./entities/animal.entity";
import { Corral } from "./entities/corral.entity";
import { AnimalMovimiento } from "./entities/animal-movimiento.entity";
import { Pesaje } from "./entities/pesaje.entity";
import {
  Categoria,
  LugarOrigen,
  Motivo,
  Pelaje,
  Proveedor,
  Raza,
} from "./entities/catalogo.entity";

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
          Raza,
          Categoria,
          Pelaje,
          Proveedor,
          LugarOrigen,
          Motivo,
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
  ],
})
export class AppModule {}
