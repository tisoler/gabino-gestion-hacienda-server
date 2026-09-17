import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SalidasService, SalidaView } from "./salidas.service";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { Permissions } from "../auth/decorators/permissions.decorator";

@ApiTags("salidas")
@Controller("salidas")
@UseGuards(FirebaseGuard, PermissionsGuard)
@ApiBearerAuth()
export class SalidasController {
  constructor(private readonly salidasService: SalidasService) {}

  @Get()
  @Permissions("lectura:salida")
  @ApiOperation({
    summary: "Histórico de salidas de animales",
    description:
      "Filtros opcionales: idLote, idPartida, idCliente, fechaDesde, fechaHasta. " +
      "Cada salida trae el desglose por animal con la diferencia de peso.",
  })
  listar(
    @Request() req,
    @Query("idLote") idLote?: number,
    @Query("idPartida") idPartida?: number,
    @Query("idCliente") idCliente?: string,
    @Query("fechaDesde") fechaDesde?: string,
    @Query("fechaHasta") fechaHasta?: string,
  ): Promise<SalidaView[]> {
    return this.salidasService.listar(req.user, {
      idLote: idLote ? Number(idLote) : undefined,
      idPartida: idPartida ? Number(idPartida) : undefined,
      idCliente,
      fechaDesde,
      fechaHasta,
    });
  }
}
