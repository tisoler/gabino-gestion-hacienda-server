import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CatalogosService } from "./catalogos.service";
import { CreateCatalogoDto } from "./dto/create-catalogo.dto";
import { CreateCatalogoAdminDto } from "./dto/create-catalogo-admin.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { Roles as RolesConst } from "../constantes";

/**
 * Catálogos multitenant: raza, categoria, proveedor, lugar_origen, motivo.
 * GET requiere lectura:lote; POST (alta asociada a la empresa actual, desde
 * los autocomplete de los formularios) requiere escritura:lote. Las rutas
 * `/admin` son exclusivas de sys-admin (listar con filtros + crear global o
 * para una empresa puntual).
 */
@ApiTags("catalogos")
@Controller("catalogos")
@UseGuards(FirebaseGuard, PermissionsGuard, RolesGuard)
@ApiBearerAuth()
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  @Get(":tipo")
  @Permissions("lectura:lote")
  @ApiOperation({
    summary: "Valores visibles del catálogo (globales + de mi empresa)",
  })
  @ApiParam({
    name: "tipo",
    description: "raza | categoria | proveedor | lugar_origen | motivo",
  })
  listar(@Param("tipo") tipo: string, @Request() req) {
    return this.catalogosService.listarVisibles(
      this.catalogosService.validarTipo(tipo),
      req.user,
    );
  }

  @Post(":tipo")
  @Permissions("escritura:lote")
  @ApiOperation({
    summary: "Agregar un valor al catálogo (asociado a mi empresa)",
    description:
      "Idempotente: si ya existe un valor global o de la empresa con el mismo " +
      "nombre (comparado en lowercase), devuelve el existente.",
  })
  @ApiParam({
    name: "tipo",
    description: "raza | categoria | proveedor | lugar_origen | motivo",
  })
  crear(
    @Param("tipo") tipo: string,
    @Body() dto: CreateCatalogoDto,
    @Request() req,
  ) {
    return this.catalogosService.crear(
      this.catalogosService.validarTipo(tipo),
      dto.nombre,
      req.user,
    );
  }

  @Get(":tipo/admin")
  @Roles(RolesConst.SYS_ADMIN)
  @Permissions("lectura:lote")
  @ApiOperation({
    summary: "sys-admin: listar valores con filtro por global/empresa",
  })
  @ApiParam({
    name: "tipo",
    description: "raza | categoria | proveedor | lugar_origen | motivo",
  })
  @ApiQuery({
    name: "scope",
    required: false,
    description: "'todas' (default) | 'global' | 'empresa'",
  })
  @ApiQuery({
    name: "idEmpresa",
    required: false,
    type: Number,
    description: "Requerido con scope=empresa",
  })
  listarAdmin(
    @Param("tipo") tipo: string,
    @Query("scope") scope?: string,
    @Query("idEmpresa") idEmpresa?: number,
  ) {
    return this.catalogosService.listarAdmin(
      this.catalogosService.validarTipo(tipo),
      scope,
      idEmpresa != null ? Number(idEmpresa) : undefined,
    );
  }

  @Post(":tipo/admin")
  @Roles(RolesConst.SYS_ADMIN)
  @Permissions("escritura:lote")
  @ApiOperation({
    summary: "sys-admin: crear valor global (sin idEmpresa) o de una empresa",
  })
  @ApiParam({
    name: "tipo",
    description: "raza | categoria | proveedor | lugar_origen | motivo",
  })
  crearAdmin(@Param("tipo") tipo: string, @Body() dto: CreateCatalogoAdminDto) {
    return this.catalogosService.crearAdmin(
      this.catalogosService.validarTipo(tipo),
      dto.nombre,
      dto.idEmpresa ?? null,
    );
  }
}
