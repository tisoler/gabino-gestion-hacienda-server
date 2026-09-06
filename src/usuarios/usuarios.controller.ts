import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { UsuariosService } from "./usuarios.service";
import { UpdateUserCelularDto } from "./dto/update-user-celular.dto";
import { UpdateUserNombreDto } from "./dto/update-user-nombre.dto";
import { UpdateUserRolDto } from "./dto/update-user-rol.dto";
import type { UsuarioBasico } from "../cache/firestore-cache.service";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { Roles as RolesConst } from "../constantes";

@ApiTags("usuarios")
@Controller("usuarios")
@UseGuards(FirebaseGuard, PermissionsGuard, RolesGuard)
@ApiBearerAuth()
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get("candidatos")
  @Permissions("lectura:cliente")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
  @ApiOperation({
    summary: "Listar usuarios candidatos para asociar a empresas",
    description:
      "Todos los usuarios de Firestore con cualquier rol excepto sys-admin, sin importar " +
      "si tienen empresas asignadas. Alimenta pickers.",
  })
  findCandidatos(): Promise<UsuarioBasico[]> {
    return this.usuariosService.findCandidatos();
  }

  @Patch(":uid/rol")
  @Roles(RolesConst.SYS_ADMIN)
  @ApiOperation({
    summary: "Asignar el rol de un usuario (anfitrión, operario o cliente)",
    description:
      "Sólo sys-admin. Actualiza `idRol` en el documento del usuario en Firestore " +
      "y deja coherentes los campos de empresa según el rol. Invalida los caches.",
  })
  @ApiParam({ name: "uid", description: "UID de Firebase del usuario" })
  async updateRol(
    @Param("uid") uid: string,
    @Body() dto: UpdateUserRolDto,
    @Request() req,
  ): Promise<UsuarioBasico> {
    return this.usuariosService.updateRol(uid, dto.idRol, req.user);
  }

  @Patch(":uid/nombre")
  @ApiOperation({
    summary: "Agregar / editar el nombre de un usuario",
    description:
      "Actualiza el campo `nombre` del documento del usuario en Firestore. " +
      "sys-admin puede tocar a cualquiera; el resto sólo su propio nombre. " +
      "Invalida el cache de usuarios.",
  })
  @ApiParam({ name: "uid", description: "UID de Firebase del usuario" })
  async updateNombre(
    @Param("uid") uid: string,
    @Body() dto: UpdateUserNombreDto,
    @Request() req,
  ): Promise<UsuarioBasico> {
    return this.usuariosService.updateNombre(uid, dto.nombre, req.user);
  }

  @Patch(":uid/celular")
  @ApiOperation({
    summary: "Agregar / editar el celular (WhatsApp) de un usuario",
    description:
      "Actualiza el campo `celular` del documento del usuario en Firestore " +
      "(formato internacional; string vacío lo borra). sys-admin puede tocar " +
      "a cualquiera; el resto sólo su propio celular. Invalida el cache de usuarios.",
  })
  @ApiParam({ name: "uid", description: "UID de Firebase del usuario" })
  async updateCelular(
    @Param("uid") uid: string,
    @Body() dto: UpdateUserCelularDto,
    @Request() req,
  ): Promise<UsuarioBasico> {
    return this.usuariosService.updateCelular(uid, dto.celular, req.user);
  }
}
