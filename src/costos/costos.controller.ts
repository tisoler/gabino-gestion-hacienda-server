import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { CostosService } from "./costos.service";
import { CreateCostoDto } from "./dto/create-costo.dto";
import { UpdateCostoDto } from "./dto/update-costo.dto";
import { ToggleCostoActivoDto } from "./dto/toggle-costo-activo.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("costos")
@Controller("costos")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class CostosController {
  constructor(private readonly costosService: CostosService) {}

  @Get()
  @Permissions("lectura:costo")
  @ApiOperation({
    summary: "Listar costos varios",
    description:
      "Por defecto globales + empresa actual. Con `scope=global|empresa` se " +
      "refina (`idEmpresa` sólo sys-admin) y con `estado=todas` (requiere " +
      "escritura:costo) se incluyen los desactivados.",
  })
  @ApiQuery({ name: "estado", required: false, description: "activas | todas" })
  @ApiQuery({
    name: "scope",
    required: false,
    description: "todas | global | empresa",
  })
  @ApiQuery({
    name: "idEmpresa",
    required: false,
    description: "Empresa del scope (sólo sys-admin)",
  })
  listar(
    @Request() req,
    @Query("estado") estado?: string,
    @Query("scope") scope?: string,
    @Query("idEmpresa") idEmpresa?: string,
  ) {
    const emp = idEmpresa ? Number(idEmpresa) : undefined;
    return this.costosService.listar(
      req.user,
      estado,
      scope,
      emp && Number.isFinite(emp) && emp > 0 ? emp : undefined,
    );
  }

  @Post()
  @Permissions("escritura:costo")
  @ApiOperation({
    summary: "Crear un costo vario",
    description:
      "El sys-admin elige el alcance (`idEmpresa` null = GLOBAL); el resto " +
      "crea para su empresa.",
  })
  crear(@Body() dto: CreateCostoDto, @Request() req) {
    return this.costosService.crear(dto, req.user);
  }

  @Patch(":id")
  @Permissions("escritura:costo")
  @ApiOperation({ summary: "Editar un costo vario" })
  @ApiParam({ name: "id", type: Number, description: "ID del costo" })
  actualizar(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCostoDto,
    @Request() req,
  ) {
    return this.costosService.actualizar(id, dto, req.user);
  }

  @Patch(":id/activo")
  @Permissions("escritura:costo")
  @ApiOperation({ summary: "Activar / desactivar el costo entero" })
  @ApiParam({ name: "id", type: Number, description: "ID del costo" })
  toggleActivo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ToggleCostoActivoDto,
    @Request() req,
  ) {
    return this.costosService.toggleActivo(id, dto.activo, req.user);
  }
}
