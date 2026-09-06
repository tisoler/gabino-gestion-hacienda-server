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
  Query,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { LotesService, LoteResumen } from "./lotes.service";
import { CreateLoteDto } from "./dto/create-lote.dto";
import { UpdateLoteDto } from "./dto/update-lote.dto";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { EnviarEnfermeriaDto } from "./dto/enviar-enfermeria.dto";
import { TraerEnfermeriaDto } from "./dto/traer-enfermeria.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("lotes")
@Controller("lotes")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Post()
  @Permissions("escritura:lote")
  @ApiOperation({ summary: "Crear un nuevo lote (partida de animales)" })
  create(@Body() dto: CreateLoteDto, @Request() req) {
    return this.lotesService.create(dto, req.user, req.user.currentEmpresaId);
  }

  @Get()
  @Permissions("lectura:lote")
  @ApiOperation({ summary: "Listar lotes visibles" })
  @ApiQuery({
    name: "currentEmpresaId",
    required: false,
    type: Number,
    description: "Filtrar por empresa",
  })
  findAll(
    @Request() req,
    @Query("currentEmpresaId") currentEmpresaId?: number,
  ): Promise<LoteResumen[]> {
    return this.lotesService.findAll(req.user, currentEmpresaId);
  }

  @Get(":id")
  @Permissions("lectura:lote")
  @ApiOperation({
    summary: "Obtener un lote con sus animales (pesajes de la partida)",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  findOne(@Param("id", ParseIntPipe) id: number, @Request() req) {
    return this.lotesService.findOne(id, req.user);
  }

  @Patch(":id")
  @Permissions("escritura:lote")
  @ApiOperation({ summary: "Actualizar datos del lote" })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateLoteDto,
    @Request() req,
  ) {
    return this.lotesService.update(id, dto, req.user);
  }

  @Post(":id/animales")
  @Permissions("escritura:lote")
  @ApiOperation({
    summary: "Agregar un animal al lote",
    description:
      "Campos según la planilla PESAJE ING-EGR. El server calcula peso neto, " +
      "diferencia y aumento diario.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  addAnimal(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateAnimalDto,
    @Request() req,
  ) {
    return this.lotesService.addAnimal(id, dto, req.user);
  }

  @Patch(":id/animales/:animalId")
  @Permissions("escritura:lote")
  @ApiOperation({ summary: "Editar un animal del lote" })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  updateAnimal(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Body() dto: UpdateAnimalDto,
    @Request() req,
  ) {
    return this.lotesService.updateAnimal(id, animalId, dto, req.user);
  }

  @Delete(":id/animales/:animalId")
  @Permissions("escritura:lote")
  @ApiOperation({ summary: "Eliminar un animal del lote" })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  removeAnimal(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Request() req,
  ) {
    return this.lotesService.removeAnimal(id, animalId, req.user);
  }

  @Post(":id/animales/:animalId/enfermeria")
  @Permissions("escritura:lote")
  @ApiOperation({
    summary: "Enviar un animal a enfermería (o reasignarlo)",
    description:
      "Requiere el motivo/enfermedad: marca `id_corral_enfermeria`, pasa el " +
      "estado a 'enfermo' y registra el movimiento en el historial. Sin " +
      "`idCorral`, usa la primera enfermería activa de la empresa.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  enviarEnfermeria(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Body() dto: EnviarEnfermeriaDto,
    @Request() req,
  ) {
    return this.lotesService.enviarEnfermeria(id, animalId, dto, req.user);
  }

  @Delete(":id/animales/:animalId/enfermeria")
  @Permissions("escritura:lote")
  @ApiOperation({
    summary: "Traer un animal de enfermería",
    description:
      "Limpia `id_corral_enfermeria` (vuelve al corral ACTUAL de su lote por " +
      "derivación) y aplica el estado de salida ('sano' | 'muerto'). Con " +
      "'muerto' la causa es obligatoria. Registra el movimiento.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  traerDeEnfermeria(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Body() dto: TraerEnfermeriaDto,
    @Request() req,
  ) {
    return this.lotesService.traerDeEnfermeria(id, animalId, dto, req.user);
  }

  @Get(":id/animales/:animalId/movimientos")
  @Permissions("lectura:lote")
  @ApiOperation({
    summary: "Historial de movimientos sanitarios del animal",
    description: "Enfermería y cambios de estado, ordenados por fecha DESC.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  getMovimientos(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Request() req,
  ) {
    return this.lotesService.getMovimientos(id, animalId, req.user);
  }
}
