import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
  Param,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { ClientesService, ClienteVinculado } from "./clientes.service";
import { VincularClienteDto } from "./dto/vincular-cliente.dto";
import { UpdateClienteRolDto } from "./dto/update-cliente-rol.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { Roles as RolesConst } from "../constantes";

@ApiTags("clientes")
@Controller("clientes")
@UseGuards(FirebaseGuard, PermissionsGuard, RolesGuard)
@Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
@ApiBearerAuth()
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @Permissions("lectura:cliente")
  @ApiOperation({
    summary: "Listar clientes de mi empresa",
    description:
      "Clientes vinculados a la empresa del usuario autenticado (sys-admin puede pedir " +
      "una empresa puntual con el header x-empresa-id).",
  })
  findAll(@Request() req): Promise<ClienteVinculado[]> {
    return this.clientesService.findAll(req.user);
  }

  @Get("operarios")
  @Permissions("lectura:cliente")
  @ApiOperation({
    summary: "Listar operarios de mi empresa",
    description:
      "Usuarios con rol operario e idEmpresa = mi empresa (en Firestore).",
  })
  findOperarios(@Request() req) {
    return this.clientesService.findOperarios(req.user);
  }

  @Get("titulares")
  @Permissions("lectura:cliente")
  @ApiOperation({
    summary: "Listar titulares posibles de un lote",
    description:
      "Clientes vinculados a mi empresa + el anfitrión de la empresa (un " +
      "anfitrión puede tener animales propios en su establecimiento).",
  })
  findAllTitulares(@Request() req): Promise<ClienteVinculado[]> {
    return this.clientesService.findAllTitulares(req.user);
  }

  @Get("candidatos")
  @Permissions("lectura:cliente")
  @ApiOperation({
    summary:
      "Listar usuarios candidatos a ser vinculados como cliente u operario",
    description:
      "Usuarios con rol cliente o sin rol (pendientes) que aún no están vinculados a mi empresa.",
  })
  findCandidatos(@Request() req) {
    return this.clientesService.findCandidatos(req.user);
  }

  @Post()
  @Permissions("escritura:cliente")
  @ApiOperation({
    summary: "Vincular un usuario a mi empresa (cliente u operario)",
    description:
      "rol 'cliente' (default): relación en la BD + idEmpresas en Firestore. " +
      "rol 'operario': setea rol operario + idEmpresa única en Firestore.",
  })
  vincular(@Body() dto: VincularClienteDto, @Request() req) {
    return this.clientesService.vincular(
      dto.uid,
      dto.rol ?? "cliente",
      req.user,
    );
  }

  @Patch(":uid/rol")
  @Permissions("escritura:cliente")
  @ApiOperation({
    summary: "Promover un cliente vinculado a operario de mi empresa",
    description:
      "Setea rol=operario e idEmpresa (única) en Firestore y deja de ser cliente de la empresa.",
  })
  @ApiParam({ name: "uid", description: "UID de Firebase del usuario" })
  promoverOperario(
    @Param("uid") uid: string,
    @Body() dto: UpdateClienteRolDto,
    @Request() req,
  ) {
    void dto;
    return this.clientesService.promoverOperario(uid, req.user);
  }

  @Delete(":uid")
  @Permissions("escritura:cliente")
  @ApiOperation({
    summary: "Desvincular un cliente de mi empresa",
    description:
      "Borra la relación y quita la empresa del array idEmpresas del usuario en Firestore.",
  })
  @ApiParam({ name: "uid", description: "UID de Firebase del usuario" })
  desvincular(@Param("uid") uid: string, @Request() req) {
    return this.clientesService.desvincular(uid, req.user);
  }
}
