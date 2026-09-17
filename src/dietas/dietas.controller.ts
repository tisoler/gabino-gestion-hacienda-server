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
import { DietasService, DietaView } from "./dietas.service";
import { CreateDietaDto } from "./dto/create-dieta.dto";
import { ToggleDietaActivoDto } from "./dto/toggle-dieta-activo.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("dietas")
@Controller("dietas")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class DietasController {
  constructor(private readonly dietasService: DietasService) {}

  @Get()
  @Permissions("lectura:dieta")
  @ApiOperation({
    summary: "Listar dietas con su versión vigente",
    description:
      "Por defecto sólo dietas activas. Con `estado=todas` (requiere " +
      "escritura:dieta) incluye las desactivadas.",
  })
  @ApiQuery({ name: "estado", required: false, description: "activas | todas" })
  listar(
    @Request() req,
    @Query("estado") estado?: string,
  ): Promise<DietaView[]> {
    return this.dietasService.listar(req.user, estado);
  }

  @Post()
  @Permissions("escritura:dieta")
  @ApiOperation({
    summary: "Crear dieta o nueva versión (proporciones que suman 100%)",
    description:
      "No se edita: si ya existe una dieta con el mismo nombre se crea una " +
      "versión nueva y la anterior queda como histórico (inactiva).",
  })
  crear(@Body() dto: CreateDietaDto, @Request() req): Promise<DietaView> {
    return this.dietasService.crear(dto, req.user);
  }

  @Get(":id/versiones")
  @Permissions("escritura:dieta")
  @ApiOperation({ summary: "Histórico de versiones de una dieta" })
  @ApiParam({ name: "id", type: Number, description: "ID de la dieta" })
  versiones(
    @Param("id", ParseIntPipe) id: number,
    @Request() req,
  ): Promise<DietaView[]> {
    return this.dietasService.versiones(id, req.user);
  }

  @Patch(":id/activo")
  @Permissions("escritura:dieta")
  @ApiOperation({ summary: "Activar / desactivar la dieta entera" })
  @ApiParam({ name: "id", type: Number, description: "ID de la dieta" })
  toggleActivo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ToggleDietaActivoDto,
    @Request() req,
  ): Promise<DietaView> {
    return this.dietasService.toggleActivo(id, dto.activa, req.user);
  }
}
