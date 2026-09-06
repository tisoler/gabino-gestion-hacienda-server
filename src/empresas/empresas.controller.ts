import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { EmpresasService } from "./empresas.service";
import { Empresa } from "../entities/empresa.entity";
import { CreateEmpresaDto } from "./dto/create-empresa.dto";
import { UpdateEmpresaDto } from "./dto/update-empresa.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { Roles as RolesConst } from "../constantes";

@ApiTags("empresas")
@Controller("empresas")
@UseGuards(FirebaseGuard, PermissionsGuard, RolesGuard)
@ApiBearerAuth()
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Get()
  @Permissions("lectura:empresa")
  @ApiOperation({ summary: "Listar empresas permitidas para el usuario" })
  findAll(@Request() req) {
    return this.empresasService.findAll(req.user);
  }

  @Get("me")
  @Permissions("lectura:empresa")
  @ApiOperation({
    summary: "Obtener mi empresa",
    description:
      "Devuelve la empresa del usuario autenticado (la única de un anfitrión/operario, " +
      "o la primera visible de un cliente multi-empresa). null si no tiene empresa.",
  })
  findMine(@Request() req): Promise<Empresa | null> {
    return this.empresasService.findMine(req.user);
  }

  @Post()
  @Permissions("escritura:empresa")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
  @ApiOperation({
    summary: "Crear una nueva empresa",
    description:
      "El anfitrión crea su única empresa (se le setea idEmpresa en Firestore). " +
      "sys-admin crea sin asociarse.",
  })
  create(@Body() createEmpresaDto: CreateEmpresaDto, @Request() req) {
    return this.empresasService.create(createEmpresaDto, req.user);
  }

  @Patch(":id")
  @Permissions("escritura:empresa")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
  @ApiOperation({
    summary: "Actualizar datos de una empresa (nombre, dirección, teléfono)",
    description:
      "El nombre se normaliza a mayúscula inicial por palabra (excepto la palabra 'y'). " +
      "sys-admin puede editar cualquier empresa; el anfitrión sólo la suya.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID de la empresa" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateEmpresaDto: UpdateEmpresaDto,
    @Request() req,
  ): Promise<Empresa> {
    return this.empresasService.update(id, updateEmpresaDto, req.user);
  }
}
