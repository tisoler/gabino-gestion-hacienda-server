import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AlimentacionService, AlimentacionView } from "./alimentacion.service";
import {
  CreateAlimentacionDto,
  CreateAlimentacionesMasivaDto,
} from "./dto/create-alimentacion.dto";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("alimentacion")
@Controller("alimentaciones")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class AlimentacionController {
  constructor(private readonly service: AlimentacionService) {}

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
}
