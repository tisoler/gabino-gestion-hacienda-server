import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor, FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AlimentacionService, AlimentacionView } from "./alimentacion.service";
import { OcrService } from "./ocr.service";
import { ExcelService } from "./excel.service";
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
  constructor(
    private readonly service: AlimentacionService,
    private readonly ocr: OcrService,
    private readonly excel: ExcelService,
  ) {}

  @Post("importar-xlsx")
  @Permissions("escritura:alimento")
  @UseInterceptors(
    FileInterceptor("archivo", { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiOperation({
    summary: "Importar planilla Excel de alimentación — preview por hoja",
    description:
      "Lee la tabla izquierda (FECHA|ALIMENTO|CANTIDAD|OBS) de cada hoja y " +
      "devuelve un preview best-effort (corral del nombre de hoja, fechas, " +
      "dietas, cantidades y cambios de corral). El guardado real es posterior.",
  })
  async importarXlsx(
    @Request() req,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    void req;
    if (!archivo) return { hojas: [] };
    return this.excel.analizarPlanilla(archivo.buffer);
  }

  @Post("importar-ocr")
  @Permissions("escritura:alimento")
  @UseInterceptors(FilesInterceptor("archivos", 20))
  @ApiOperation({
    summary: "Importar planillas de alimentación (fotos) — OCR + preview",
    description:
      "Detecta los renglones de la grilla, corre tesseract (TSV) y devuelve " +
      "un preview best-effort (corral del encabezado, fechas y cambios de " +
      "corral por observación). El guardado real es un paso posterior.",
  })
  async importarOcr(
    @Request() req,
    @UploadedFiles() archivos?: Express.Multer.File[],
  ) {
    void req;
    if (!archivos || archivos.length === 0) {
      return { imagenes: [] };
    }
    const imagenes = (
      await Promise.all(
        archivos.map(async (a) => {
          const r = await this.ocr.analizarPlanilla(a.buffer, a.originalname);
          return r.map((x) => ({
            nombre: x.nombre || a.originalname || "planilla",
            corralHeader: x.corralHeader,
            filas: x.filas,
          }));
        }),
      )
    ).flat();
    return { imagenes };
  }

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

  @Get("filtros")
  @Permissions("lectura:alimento")
  @ApiOperation({
    summary: "Opciones de filtros (clientes/corrales/lotes con alimentaciones)",
    description:
      "Cada lista se restringe por los DEMÁS filtros (encadenados, sin rango " +
      "de fechas). Lo usa la vista para no traer todo el histórico.",
  })
  @ApiQuery({ name: "idCorral", required: false, type: Number })
  @ApiQuery({ name: "idLote", required: false, type: Number })
  @ApiQuery({ name: "idCliente", required: false })
  filtros(
    @Request() req,
    @Query("idCorral") idCorral?: number,
    @Query("idLote") idLote?: number,
    @Query("idCliente") idCliente?: string,
  ) {
    return this.service.filtros(req.user, {
      idCorral: idCorral != null ? Number(idCorral) : undefined,
      idLote: idLote != null ? Number(idLote) : undefined,
      idCliente,
    });
  }

  @Get()
  @Permissions("lectura:alimento")
  @ApiOperation({ summary: "Listar alimentaciones (histórico) con filtros" })
  @ApiQuery({ name: "idCorral", required: false, type: Number })
  @ApiQuery({ name: "idLote", required: false, type: Number })
  @ApiQuery({ name: "idCliente", required: false })
  @ApiQuery({ name: "fechaDesde", required: false, description: "YYYY-MM-DD" })
  @ApiQuery({ name: "fechaHasta", required: false, description: "YYYY-MM-DD" })
  @ApiQuery({ name: "page", required: false, description: "Página (base 1)" })
  @ApiQuery({
    name: "pageSize",
    required: false,
    description: "Filas por página (máx 100)",
  })
  listar(
    @Request() req,
    @Query("idCorral") idCorral?: number,
    @Query("idLote") idLote?: number,
    @Query("idCliente") idCliente?: string,
    @Query("fechaDesde") fechaDesde?: string,
    @Query("fechaHasta") fechaHasta?: string,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
  ): Promise<{ data: AlimentacionView[]; total: number }> {
    return this.service.listar(req.user, {
      idCorral: idCorral != null ? Number(idCorral) : undefined,
      idLote: idLote != null ? Number(idLote) : undefined,
      idCliente,
      fechaDesde,
      fechaHasta,
      page: page != null ? Number(page) : undefined,
      pageSize: pageSize != null ? Number(pageSize) : undefined,
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

  @Delete(":id")
  @Permissions("escritura:alimento")
  @ApiOperation({
    summary: "Eliminar una alimentación (borrado físico)",
    description:
      "Sólo si NO está liquidada; una liquidada es inmutable para el futuro módulo de liquidaciones.",
  })
  @ApiParam({ name: "id", type: Number, description: "ID de la alimentación" })
  eliminar(
    @Param("id", ParseIntPipe) id: number,
    @Request() req,
  ): Promise<void> {
    return this.service.eliminar(id, req.user);
  }
}
