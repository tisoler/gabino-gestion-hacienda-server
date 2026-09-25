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
import { InsumosService } from "./insumos.service";
import { CreateInsumoDto } from "./dto/create-insumo.dto";
import { UpdateInsumoDto } from "./dto/update-insumo.dto";
import { ToggleInsumoActivoDto } from "./dto/toggle-insumo-activo.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("insumos")
@Controller("insumos")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @Get()
  @Permissions("lectura:insumo")
  @ApiOperation({
    summary: "Listar insumos con su categoría",
    description:
      "Por defecto globales + empresa actual. Con `scope=global|empresa` se " +
      "refina (`idEmpresa` sólo sys-admin) y con `estado=todas` (requiere " +
      "escritura:insumo) se incluyen los desactivados.",
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
    return this.insumosService.listar(
      req.user,
      estado,
      scope,
      emp && Number.isFinite(emp) && emp > 0 ? emp : undefined,
    );
  }

  @Get("categorias")
  @Permissions("lectura:insumo")
  @ApiOperation({
    summary: "Listar categorías de insumo (globales + empresa)",
    description: "`idEmpresa` sólo sys-admin; el resto usa su empresa actual.",
  })
  @ApiQuery({
    name: "idEmpresa",
    required: false,
    description: "Empresa (sólo sys-admin)",
  })
  categorias(@Request() req, @Query("idEmpresa") idEmpresa?: string) {
    const emp = idEmpresa ? Number(idEmpresa) : undefined;
    return this.insumosService.categorias(
      req.user,
      emp && Number.isFinite(emp) && emp > 0 ? emp : undefined,
    );
  }

  @Post()
  @Permissions("escritura:insumo")
  @ApiOperation({
    summary: "Crear un insumo",
    description:
      "El sys-admin elige el alcance (`idEmpresa` null = GLOBAL); el resto " +
      "crea para su empresa. La categoría puede ser existente (`idCategoria`) " +
      "o nueva (`categoriaNueva`, se crea con el alcance del insumo).",
  })
  crear(@Body() dto: CreateInsumoDto, @Request() req) {
    return this.insumosService.crear(dto, req.user);
  }

  @Patch(":id")
  @Permissions("escritura:insumo")
  @ApiOperation({ summary: "Editar un insumo" })
  @ApiParam({ name: "id", type: Number, description: "ID del insumo" })
  actualizar(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateInsumoDto,
    @Request() req,
  ) {
    return this.insumosService.actualizar(id, dto, req.user);
  }

  @Patch(":id/activo")
  @Permissions("escritura:insumo")
  @ApiOperation({ summary: "Activar / desactivar el insumo entero" })
  @ApiParam({ name: "id", type: Number, description: "ID del insumo" })
  toggleActivo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ToggleInsumoActivoDto,
    @Request() req,
  ) {
    return this.insumosService.toggleActivo(id, dto.activo, req.user);
  }
}
