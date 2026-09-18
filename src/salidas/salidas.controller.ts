import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { SalidasService, SalidaView } from "./salidas.service";
import { ActualizarSalidaFechaDto } from "./dto/actualizar-salida-fecha.dto";
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

  @Patch(":id")
  @Permissions("escritura:salida")
  @ApiOperation({ summary: "Editar la fecha de una salida" })
  @ApiParam({ name: "id", type: Number, description: "ID de la salida" })
  editarFecha(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ActualizarSalidaFechaDto,
    @Request() req,
  ): Promise<{ id: number; fecha: string }> {
    return this.salidasService.editarFecha(id, dto, req.user);
  }
}
