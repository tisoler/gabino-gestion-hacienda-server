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
import { CorralesService, CorralResumen, CorralMapa } from "./corrales.service";
import { Corral } from "../entities/corral.entity";
import { CreateCorralDto } from "./dto/create-corral.dto";
import { UpdateCorralDto } from "./dto/update-corral.dto";
import { UpdateCorralActivoDto } from "./dto/update-corral-activo.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { Roles as RolesConst } from "../constantes";

@ApiTags("corrales")
@Controller("corrales")
@UseGuards(FirebaseGuard, PermissionsGuard, RolesGuard)
@ApiBearerAuth()
export class CorralesController {
  constructor(private readonly corralesService: CorralesService) {}

  @Get()
  @Permissions("lectura:corral")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION, RolesConst.OPERARIO)
  @ApiOperation({
    summary: "Listar corrales de mi empresa con estado derivado",
    description:
      "Comunes: libre/ocupado (ocupado = existe al menos un lote activo " +
      "asignado; pueden compartirlo varios lotes). " +
      "Enfermería: cantidad de animales adentro. No accesible para clientes " +
      "(ésos usan sólo /corrales/mapa, que se filtra a sus lotes).",
  })
  findAll(@Request() req): Promise<CorralResumen[]> {
    return this.corralesService.findAll(req.user);
  }

  @Get("mapa")
  @Permissions("lectura:corral")
  @ApiOperation({
    summary: "Mapa de corrales activos (panel de Lotes)",
    description:
      "Por corral, las fichas de animales (n°, estado, color del lote). " +
      "Enfermería muestra animales de varios lotes.",
  })
  mapa(@Request() req): Promise<CorralMapa[]> {
    return this.corralesService.mapa(req.user);
  }

  @Get("enfermerias")
  @Permissions("lectura:corral")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION, RolesConst.OPERARIO)
  @ApiOperation({
    summary: "Corrales de enfermería activos (picker para enviar animales)",
  })
  findEnfermerias(@Request() req): Promise<Corral[]> {
    return this.corralesService.findEnfermerias(req.user);
  }

  @Post()
  @Permissions("escritura:corral")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
  @ApiOperation({ summary: "Crear un corral (común o enfermería)" })
  create(@Body() dto: CreateCorralDto, @Request() req): Promise<Corral> {
    return this.corralesService.create(dto, req.user);
  }

  @Patch(":id")
  @Permissions("escritura:corral")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
  @ApiOperation({
    summary: "Editar corral (nombre, capacidad informativa, descripción)",
    description: "El tipo no es editable tras la creación.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del corral" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCorralDto,
    @Request() req,
  ): Promise<Corral> {
    return this.corralesService.update(id, dto, req.user);
  }

  @Patch(":id/activo")
  @Permissions("escritura:corral")
  @Roles(RolesConst.SYS_ADMIN, RolesConst.ANFITRION)
  @ApiOperation({
    summary: "Habilitar / deshabilitar un corral",
    description:
      "No se puede deshabilitar un común con lotes activos asignados ni una " +
      "enfermería con animales adentro.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del corral" })
  toggleActivo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCorralActivoDto,
    @Request() req,
  ): Promise<Corral> {
    return this.corralesService.toggleActivo(id, dto.activo, req.user);
  }
}
