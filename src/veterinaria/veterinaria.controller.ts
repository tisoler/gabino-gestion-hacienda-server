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
import {
  TratamientosService,
  TratamientoAplicadoView,
} from "./veterinaria.service";
import { CreateTratamientoDto } from "./dto/create-tratamiento.dto";
import { UpdateTratamientoDto } from "./dto/update-tratamiento.dto";
import { ToggleTratamientoActivoDto } from "./dto/toggle-tratamiento-activo.dto";
import {
  AplicarAnimalDto,
  AplicarTratamientosDto,
} from "./dto/aplicar-tratamiento.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("veterinaria")
@Controller()
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class VeterinariaController {
  constructor(private readonly service: TratamientosService) {}

  @Get("tratamientos")
  @Permissions("lectura:veterinaria")
  @ApiOperation({
    summary: "Listar el catálogo de tratamientos",
    description:
      "Por defecto globales + empresa actual. Con `scope=global|empresa` se " +
      "refina (`idEmpresa` sólo sys-admin) y con `estado=todas` (requiere " +
      "escritura:veterinaria) se incluyen los desactivados.",
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
  listarCatalogo(
    @Request() req,
    @Query("estado") estado?: string,
    @Query("scope") scope?: string,
    @Query("idEmpresa") idEmpresa?: string,
  ) {
    const emp = idEmpresa ? Number(idEmpresa) : undefined;
    return this.service.listarCatalogo(
      req.user,
      estado,
      scope,
      emp && Number.isFinite(emp) && emp > 0 ? emp : undefined,
    );
  }

  @Post("tratamientos")
  @Permissions("escritura:veterinaria")
  @ApiOperation({
    summary: "Crear un tratamiento del catálogo",
    description:
      "El sys-admin elige el alcance (`idEmpresa` null = GLOBAL); el resto " +
      "crea para su empresa.",
  })
  crearCatalogo(@Body() dto: CreateTratamientoDto, @Request() req) {
    return this.service.crearCatalogo(dto, req.user);
  }

  @Patch("tratamientos/:id/activo")
  @Permissions("escritura:veterinaria")
  @ApiOperation({ summary: "Activar / desactivar un tratamiento del catálogo" })
  @ApiParam({ name: "id", type: Number, description: "ID del tratamiento" })
  toggleActivoCatalogo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ToggleTratamientoActivoDto,
    @Request() req,
  ) {
    return this.service.toggleActivoCatalogo(id, dto.activo, req.user);
  }

  @Patch("tratamientos/:id")
  @Permissions("escritura:veterinaria")
  @ApiOperation({ summary: "Editar un tratamiento del catálogo" })
  @ApiParam({ name: "id", type: Number, description: "ID del tratamiento" })
  actualizarCatalogo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTratamientoDto,
    @Request() req,
  ) {
    return this.service.actualizarCatalogo(id, dto, req.user);
  }

  @Post("tratamientos/aplicar")
  @Permissions("escritura:veterinaria")
  @ApiOperation({
    summary: "Aplicar tratamiento(s) a un animal (sin movimiento)",
    description:
      "Desde el modal del historial: guarda sólo el tratamiento (alcance " +
      "'animal', sin id_movimiento).",
  })
  aplicarAnimal(
    @Body() dto: AplicarAnimalDto,
    @Request() req,
  ): Promise<TratamientoAplicadoView[]> {
    return this.service.aplicarAnimal(dto.idLote, dto.animalId, dto, req.user);
  }

  @Post("lotes/:id/tratamientos")
  @Permissions("escritura:veterinaria")
  @ApiOperation({
    summary: "Aplicar tratamiento(s) a todo el lote",
    description:
      "Un registro por animal activo (sano/enfermo; no muertos ni salidos), " +
      "sin id_movimiento y con alcance 'lote'. Bulk en transacción.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  aplicarLote(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AplicarTratamientosDto,
    @Request() req,
  ) {
    return this.service.aplicarLote(id, dto, req.user);
  }

  @Get("lotes/:id/animales/:animalId/tratamientos/abiertos")
  @Permissions("lectura:veterinaria")
  @ApiOperation({
    summary: "Tratamientos del último envío a enfermería (para el alta)",
    description:
      "Devuelve los tratamientos registrados al llevar al animal, con sus " +
      "insumos, para editarlos o agregar más al traerlo.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  abiertos(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Request() req,
  ): Promise<TratamientoAplicadoView[]> {
    return this.service.abiertos(id, animalId, req.user);
  }

  @Get("lotes/:id/animales/:animalId/historial")
  @Permissions("lectura:lote")
  @ApiOperation({
    summary: "Historial combinado del animal (movimientos + tratamientos)",
    description:
      "Movimientos con el resumen de sus tratamientos (sin insumos) y " +
      "tratamientos directos/masivos como entradas propias, en orden " +
      "cronológico descendente.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID del lote" })
  @ApiParam({ name: "animalId", type: Number, description: "ID del animal" })
  historial(
    @Param("id", ParseIntPipe) id: number,
    @Param("animalId", ParseIntPipe) animalId: number,
    @Request() req,
  ) {
    return this.service.historial(id, animalId, req.user);
  }
}
