import { Module } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";
import { UsuariosController } from "./usuarios.controller";
import { UsuariosBootstrapController } from "./usuarios-bootstrap.controller";

@Module({
  providers: [UsuariosService],
  controllers: [UsuariosController, UsuariosBootstrapController],
})
export class UsuariosModule {}
