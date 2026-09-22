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
import { AlimentacionService, AlimentacionView } from "./alimentacion.service";
import {
  CreateAlimentacionDto,
  CreateAlimentacionesMasivaDto,
} from "./dto/create-alimentacion.dto";
import { ActualizarAlimentacionDto } from "./dto/actualizar-alimentacion.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("alimentacion")
@Controller("alimentaciones")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class AlimentacionController {
  constructor(private readonly service: AlimentacionService) {}

  @Get("estado-corral")
  @Permissions("escritura:alimento")
  @ApiOperation({
    summary: "Vista previa: animales del corral en un instante (fecha+hora)",
    description:
      "Reconstruye, por lote del corral, los animales en común y en enfermería en ese " +
      "instante. Lo usa el modal de alimentar para precargar los conteos editables.",
  })
  @ApiQuery({ name: "idCorral", type: Number })
  @ApiQuery({ name: "fecha", description: "YYYY-MM-DD" })
  @ApiQuery({ name: "hora", required: false, description: "HH:MM (def 12:00)" })
  estadoCorral(
    @Request() req,
    @Query("idCorral", ParseIntPipe) idCorral: number,
    @Query("fecha") fecha: string,
    @Query("hora") hora?: string,
  ) {
    return this.service.estadoCorral(idCorral, fecha, hora, req.user);
  }

  @Get()
  @Permissions("lectura:alimento")
  @ApiOperation({ summary: "Listar alimentaciones (histórico) con filtros" })
  @ApiQuery({ name: "idCorral", required: false, type: Number })
  @ApiQuery({ name: "idLote", required: false, type: Number })
  @ApiQuery({ name: "idCliente", required: false })
  @ApiQuery({ name: "fechaDesde", required: false, description: "YYYY-MM-DD" })
  @ApiQuery({ name: "fechaHasta", required: false, description: "YYYY-MM-DD" })
  listar(
    @Request() req,
    @Query("idCorral") idCorral?: number,
    @Query("idLote") idLote?: number,
    @Query("idCliente") idCliente?: string,
    @Query("fechaDesde") fechaDesde?: string,
    @Query("fechaHasta") fechaHasta?: string,
  ): Promise<AlimentacionView[]> {
    return this.service.listar(req.user, {
      idCorral: idCorral != null ? Number(idCorral) : undefined,
      idLote: idLote != null ? Number(idLote) : undefined,
      idCliente,
      fechaDesde,
      fechaHasta,
    });
  }

  @Post()
  @Permissions("escritura:alimento")
  @ApiOperation({
    summary: "Alimentar un corral (reparte la cantidad entre los lotes)",
    description:
      "Tasa = cantidad / animales VIVOS de los lotes del corral (incluye los de " +
      "enfermería del lote, excluye muertos). Guarda el histórico por lote.",
  })
  crear(
    @Body() dto: CreateAlimentacionDto,
    @Request() req,
  ): Promise<AlimentacionView> {
    return this.service.crear(dto, req.user);
  }

  @Post("masiva")
  @Permissions("escritura:alimento")
  @ApiOperation({
    summary: "Alimentar un corral con varias filas (mismo corral)",
    description:
      "Cada fila trae dieta, fecha y cantidad. El reparto se calcula una vez " +
      "(mismo corral) y todo se guarda en una transacción.",
  })
  crearMasivas(
    @Body() dto: CreateAlimentacionesMasivaDto,
    @Request() req,
  ): Promise<{ creadas: number }> {
    return this.service.crearMasivas(dto, req.user);
  }

  @Patch(":id")
  @Permissions("escritura:alimento")
  @ApiOperation({
    summary:
      "Editar una alimentación (fecha/hora/dieta/cantidad/ajuste) y recalcular",
  })
  @ApiParam({ name: "id", type: Number, description: "ID de la alimentación" })
  editar(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ActualizarAlimentacionDto,
    @Request() req,
  ): Promise<AlimentacionView> {
    return this.service.editar(id, dto, req.user);
  }
}
