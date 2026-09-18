import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Salida } from "../entities/salida.entity";
import { Lote } from "../entities/lote.entity";
import { Roles } from "src/constantes";
import { FirestoreCacheService } from "../cache/firestore-cache.service";
import { ActualizarSalidaFechaDto } from "./dto/actualizar-salida-fecha.dto";

export interface SalidaItemView {
  animalId: number;
  nAnimal: number | null;
  caravana: string | null;
  pesoInicial: number | null;
  pesoFinal: number;
  diferenciaKg: number;
}

export interface SalidaView {
  id: number;
  fecha: string;
  tipo: string;
  nAnimales: number;
  pesoInicialTotal: number;
  pesoFinalTotal: number;
  diferenciaKg: number;
  lote: { id: number; nombre: string };
  corral: { id: number; nombre: string } | null;
  partida: { id: number; nombre: string; fecha: string } | null;
  cliente: { id: string; nombre: string | null } | null;
  empresa: { id: number; nombre: string } | null;
  animales: SalidaItemView[];
}

@Injectable()
export class SalidasService {
  constructor(
    @InjectRepository(Salida)
    private salidaRepository: Repository<Salida>,
    @InjectRepository(Lote)
    private loteRepository: Repository<Lote>,
    private cache: FirestoreCacheService,
  ) {}

  /**
   * Histórico de salidas (con filtros opcionales) para la vista /salidas.
   *  - sys-admin: todas.
   *  - anfitrión/operario: las de sus empresas.
   *  - cliente: sólo las de sus lotes.
   */
  async listar(
    user: any,
    f: {
      idLote?: number;
      idPartida?: number;
      idCliente?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    } = {},
  ): Promise<SalidaView[]> {
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    const isCliente = !isAdmin && user.roles?.includes(Roles.CLIENTE);
    const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
      Number(e),
    );

    const qb = this.salidaRepository
      .createQueryBuilder("s")
      .leftJoinAndSelect("s.lote", "lote")
      .leftJoinAndSelect("lote.corral", "corral")
      .leftJoinAndSelect("s.empresa", "empresa")
      .leftJoinAndSelect("s.partida", "partida")
      .leftJoinAndSelect("s.animales", "sa")
      .leftJoinAndSelect("sa.animal", "animal")
      .orderBy("s.fecha", "DESC")
      .addOrderBy("s.id", "DESC");

    if (f.idLote) qb.andWhere("s.idLote = :idLote", { idLote: f.idLote });
    if (f.idPartida)
      qb.andWhere("s.idPartida = :idPartida", { idPartida: f.idPartida });
    if (f.fechaDesde) qb.andWhere("s.fecha >= :desde", { desde: f.fechaDesde });
    if (f.fechaHasta) qb.andWhere("s.fecha <= :hasta", { hasta: f.fechaHasta });

    if (isAdmin) {
      // todas
    } else if (isCliente) {
      qb.andWhere("lote.idCliente = :uid", { uid: user.id });
    } else {
      if (userEmpresas.length === 0) return [];
      qb.andWhere("s.idEmpresa IN (:...empresas)", { empresas: userEmpresas });
    }
    if (f.idCliente) {
      qb.andWhere("lote.idCliente = :idCliente", { idCliente: f.idCliente });
    }

    const salidas = await qb.getMany();
    if (salidas.length === 0) return [];

    // Nombres de partida ("Partida N") por orden de fecha/id dentro de cada lote.
    const loteIds = [...new Set(salidas.map((s) => s.idLote))];
    const nombrePartida = await this.buildNombrePartida(loteIds);
    const usuarios = await this.cache.getOrLoadUsuarios();
    const nombreByUid = new Map(usuarios.map((u) => [u.uid, u.nombreUsuario]));

    return salidas.map((s) => {
      const animalRows = (s.animales ?? [])
        .slice()
        .sort((a, b) => (a.animal?.nAnimal ?? 0) - (b.animal?.nAnimal ?? 0))
        .map((sa) => ({
          animalId: sa.idAnimal,
          nAnimal: sa.animal?.nAnimal ?? null,
          caravana: sa.animal?.caravana ?? null,
          pesoInicial: sa.pesoInicial != null ? Number(sa.pesoInicial) : null,
          pesoFinal: Number(sa.pesoFinal),
          diferenciaKg: Number(sa.diferenciaKg ?? 0),
        }));
      return {
        id: s.id,
        fecha: this.fechaIso(s.fecha),
        tipo: s.tipo,
        nAnimales: s.nAnimales,
        pesoInicialTotal: Number(s.pesoInicialTotal),
        pesoFinalTotal: Number(s.pesoFinalTotal),
        diferenciaKg: Number(s.diferenciaKg),
        lote: { id: s.lote?.id ?? s.idLote, nombre: s.lote?.nombre ?? "" },
        corral:
          s.lote?.corral?.id != null
            ? { id: s.lote.corral.id, nombre: s.lote.corral.nombre }
            : null,
        partida:
          s.idPartida != null
            ? {
                id: s.idPartida,
                nombre: nombrePartida.get(s.idPartida) ?? "",
                fecha: s.partida?.fecha
                  ? (this.fechaIso(s.partida.fecha) ?? "")
                  : "",
              }
            : null,
        cliente:
          s.lote?.idCliente != null
            ? {
                id: s.lote.idCliente,
                nombre: nombreByUid.get(s.lote.idCliente) ?? null,
              }
            : null,
        empresa:
          s.empresa?.id != null
            ? { id: s.empresa.id, nombre: s.empresa.nombre }
            : null,
        animales: animalRows,
      };
    });
  }

  /** Cambia la fecha de una salida (accesible según la empresa / cliente). */
  async editarFecha(
    id: number,
    dto: ActualizarSalidaFechaDto,
    user: any,
  ): Promise<{ id: number; fecha: string }> {
    const salida = await this.salidaRepository.findOne({
      where: { id },
      relations: ["lote"],
    });
    if (!salida) throw new NotFoundException("Salida no encontrada");

    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    if (!isAdmin) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(salida.idEmpresa)) {
        throw new ForbiddenException("No tiene permisos sobre esta salida");
      }
      if (
        user.roles?.includes(Roles.CLIENTE) &&
        salida.lote?.idCliente !== user.id
      ) {
        throw new NotFoundException("Salida no encontrada");
      }
    }

    const fecha = this.aDate(dto.fecha);
    if (!fecha) throw new BadRequestException("Fecha inválida");
    salida.fecha = fecha;
    await this.salidaRepository.save(salida);
    return { id: salida.id, fecha: dto.fecha };
  }

  /** "Partida N" por orden de fecha/id dentro de cada lote (un query). */
  private async buildNombrePartida(
    loteIds: number[],
  ): Promise<Map<number, string>> {
    const nombres = new Map<number, string>();
    if (loteIds.length === 0) return nombres;
    const lotes = await this.loteRepository
      .createQueryBuilder("lote")
      .leftJoinAndSelect("lote.partidas", "p")
      .where("lote.id IN (:...ids)", { ids: loteIds })
      .getMany();
    for (const lote of lotes) {
      const lista = (lote.partidas ?? []).slice().sort((a, b) => {
        const fa = this.fechaIso(a.fecha) ?? "";
        const fb = this.fechaIso(b.fecha) ?? "";
        if (fa === fb) return a.id - b.id;
        return fa < fb ? -1 : 1;
      });
      lista.forEach((p, i) => nombres.set(p.id, `Partida ${i + 1}`));
    }
    return nombres;
  }

  private fechaIso(d: Date | string | null): string | null {
    if (!d) return null;
    if (typeof d === "string") return d.slice(0, 10);
    const iso = d.toISOString();
    return iso.slice(0, 10);
  }

  private aDate(iso?: string): Date | null {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
}
