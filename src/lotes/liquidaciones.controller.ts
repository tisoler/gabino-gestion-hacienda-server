import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { LotesService } from "./lotes.service";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("liquidaciones")
@Controller("liquidaciones")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class LiquidacionesController {
  constructor(private readonly lotesService: LotesService) {}

  @Get()
  @Permissions("lectura:liquidacion")
  @ApiOperation({
    summary: "Listar liquidaciones (filtros + paginado)",
    description:
      "Un cliente sólo ve las de sus lotes. La creación es sólo desde el " +
      "balance del lote.",
  })
  @ApiQuery({ name: "idLote", required: false, type: Number })
  @ApiQuery({ name: "idCliente", required: false, type: String })
  @ApiQuery({ name: "fechaDesde", required: false, type: String })
  @ApiQuery({ name: "fechaHasta", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  listar(
    @Request() req,
    @Query("idLote") idLote?: string,
    @Query("idCliente") idCliente?: string,
    @Query("fechaDesde") fechaDesde?: string,
    @Query("fechaHasta") fechaHasta?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const n = (v?: string) => {
      const x = v ? Number(v) : NaN;
      return Number.isFinite(x) && x > 0 ? x : undefined;
    };
    return this.lotesService.listarLiquidaciones(req.user, {
      idLote: n(idLote),
      idCliente: idCliente || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      page: n(page),
      pageSize: n(pageSize),
    });
  }

  @Get(":id")
  @Permissions("lectura:liquidacion")
  @ApiOperation({ summary: "Detalle de una liquidación (líneas congeladas)" })
  @ApiParam({ name: "id", type: Number, description: "ID de la liquidación" })
  detalle(@Param("id", ParseIntPipe) id: number, @Request() req) {
    return this.lotesService.getLiquidacion(id, req.user);
  }
}
