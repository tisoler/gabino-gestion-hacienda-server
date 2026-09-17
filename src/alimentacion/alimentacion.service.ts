import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Alimentacion } from "../entities/alimentacion.entity";
import { AlimentacionLote } from "../entities/alimentacion-lote.entity";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Dieta, DietaVersion } from "../entities/dieta.entity";
import { Roles } from "src/constantes";
import { FirestoreCacheService } from "../cache/firestore-cache.service";
import { CreateAlimentacionDto } from "./dto/create-alimentacion.dto";

export interface RepartoLote {
  loteId: number;
  loteNombre: string;
  idCliente: string | null;
  clienteNombre: string | null;
  /** Animales vivos del lote EN el corral común. */
  nAnimales: number;
  cantidadKg: number;
  /** Animales vivos del lote en ENFERMERÍA (estimación extra). */
  nAnimalesEnfermeria: number;
  cantidadEnfermeriaKg: number;
}

export interface AlimentacionView {
  id: number;
  fecha: string;
  /** Total (corral + enfermería). */
  cantidadKg: number;
  /** Lo ingresado para el corral. */
  cantidadCorralKg: number;
  /** Estimación para enfermería. */
  cantidadEnfermeriaKg: number;
  cantidadPorAnimal: number;
  /** Animales vivos en el corral común. */
  nAnimales: number;
  nAnimalesEnfermeria: number;
  corral: { id: number; nombre: string };
  dieta: { id: number; nombre: string; version: number };
  empresa: { id: number; nombre: string } | null;
  lotes: RepartoLote[];
}

const redondear = (n: number, dec = 2) => {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
};

@Injectable()
export class AlimentacionService {
  constructor(
    @InjectRepository(Alimentacion)
    private alimentacionRepository: Repository<Alimentacion>,
    @InjectRepository(AlimentacionLote)
    private loteRepository: Repository<AlimentacionLote>,
    @InjectRepository(Corral)
    private corralRepository: Repository<Corral>,
    @InjectRepository(Lote)
    private loteEntidadRepository: Repository<Lote>,
    @InjectRepository(Animal)
    private animalRepository: Repository<Animal>,
    @InjectRepository(Dieta)
    private dietaRepository: Repository<Dieta>,
    @InjectRepository(DietaVersion)
    private dietaVersionRepository: Repository<DietaVersion>,
    private cache: FirestoreCacheService,
  ) {}

  private empresaActual(user: any): number | null {
    const id = user?.currentEmpresaId ?? null;
    return id ? Number(id) : null;
  }

  private esSysAdmin(user: any): boolean {
    return !!user?.roles?.includes(Roles.SYS_ADMIN);
  }

  /**
   * Registra una alimentación de corral: calcula la tasa por animal
   * (cantidad / animales VIVOS de los lotes del corral, incluyendo los de
   * enfermería del lote, excluyendo muertos) y guarda el reparto por lote.
   */
  async crear(
    dto: CreateAlimentacionDto,
    user: any,
  ): Promise<AlimentacionView> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa actual asociada");
    }

    const corral = await this.corralRepository.findOne({
      where: { id: dto.idCorral },
    });
    if (!corral || corral.idEmpresa !== empresaId || !corral.activo) {
      throw new BadRequestException("El corral indicado no está disponible");
    }
    if (corral.tipo === "enfermeria") {
      throw new BadRequestException(
        "Los corrales de enfermería se alimentan a través del corral de su lote",
      );
    }

    const dieta = await this.dietaRepository.findOne({
      where: { id: dto.idDieta },
      relations: ["versiones"],
    });
    if (
      !dieta ||
      !dieta.activa ||
      (dieta.idEmpresa != null && dieta.idEmpresa !== empresaId)
    ) {
      throw new BadRequestException("Elegí una dieta activa disponible");
    }
    const version =
      (dieta.versiones ?? []).find((v) => v.activa) ??
      (dieta.versiones ?? []).slice().sort((a, b) => b.version - a.version)[0];
    if (!version) {
      throw new BadRequestException("La dieta no tiene una versión vigente");
    }

    const fecha = dto.fecha ? this.aDate(dto.fecha) : this.hoyDate();
    if (!fecha) throw new BadRequestException("Fecha inválida");

    // Reparto por lote: vivos EN el corral + vivos en ENFERMERÍA (estimación extra).
    const reparto = await this.calcularReparto(corral);
    const totalNCorral = reparto.reduce((acc, r) => acc + r.nAnimales, 0);
    const totalNEnfermeria = reparto.reduce(
      (acc, r) => acc + r.nAnimalesEnfermeria,
      0,
    );
    if (totalNCorral === 0) {
      throw new BadRequestException(
        "No hay animales vivos para alimentar en este corral",
      );
    }
    // Tasa por animal sobre los animales DEL CORRAL; los de enfermería se
    // SUMAN (estimación a la misma tasa), no se reparten del corral.
    const rate = Number(dto.cantidadKg) / totalNCorral;
    const cantidadEnfermeria = rate * totalNEnfermeria;
    const cantidadTotal = Number(dto.cantidadKg) + cantidadEnfermeria;

    const idAlimentacion =
      await this.alimentacionRepository.manager.transaction(async (em) => {
        const alRepo = em.getRepository(Alimentacion);
        const alLoteRepo = em.getRepository(AlimentacionLote);
        const al = await alRepo.save(
          alRepo.create({
            idEmpresa: empresaId,
            idCorral: corral.id,
            idDieta: dieta.id,
            idDietaVersion: version.id,
            fecha,
            cantidadKg: redondear(cantidadTotal, 2),
            cantidadCorralKg: dto.cantidadKg,
            cantidadEnfermeriaKg: redondear(cantidadEnfermeria, 2),
            cantidadPorAnimal: redondear(rate, 4),
            nAnimales: totalNCorral,
            nAnimalesEnfermeria: totalNEnfermeria,
            idUsuario: user?.id ?? null,
          }),
        );
        await alLoteRepo.save(
          reparto.map((r) =>
            alLoteRepo.create({
              idAlimentacion: al.id,
              idLote: r.loteId,
              idCliente: r.idCliente,
              nAnimales: r.nAnimales,
              cantidadKg: redondear(rate * r.nAnimales, 2),
              nAnimalesEnfermeria: r.nAnimalesEnfermeria,
              cantidadEnfermeriaKg: redondear(rate * r.nAnimalesEnfermeria, 2),
            }),
          ),
        );
        return al.id;
      });

    return this.obtenerDetalle(idAlimentacion);
  }

  /**
   * Reparto por lote de los animales VIVOS de un corral COMÚN:
   *  - nAnimales = vivos EN el corral (id_corral_enfermeria NULL)
   *  - nAnimalesEnfermeria = vivos del lote en ENFERMERÍA (estimación extra)
   * Los muertos no cuentan.
   */
  private async calcularReparto(corral: Corral): Promise<
    {
      loteId: number;
      loteNombre: string;
      idCliente: string | null;
      nAnimales: number;
      nAnimalesEnfermeria: number;
    }[]
  > {
    const lotes = await this.loteEntidadRepository.find({
      where: { idCorral: corral.id, activo: true },
      order: { id: "ASC" },
    });
    const reparto: {
      loteId: number;
      loteNombre: string;
      idCliente: string | null;
      nAnimales: number;
      nAnimalesEnfermeria: number;
    }[] = [];
    for (const lote of lotes) {
      const nCorral = await this.animalRepository
        .createQueryBuilder("a")
        .where(
          "a.id_lote = :lote AND a.estado IN ('sano','enfermo') AND a.id_corral_enfermeria IS NULL",
          { lote: lote.id },
        )
        .getCount();
      const nEnfermeria = await this.animalRepository
        .createQueryBuilder("a")
        .where(
          "a.id_lote = :lote AND a.estado IN ('sano','enfermo') AND a.id_corral_enfermeria IS NOT NULL",
          { lote: lote.id },
        )
        .getCount();
      if (nCorral + nEnfermeria > 0) {
        reparto.push({
          loteId: lote.id,
          loteNombre: lote.nombre,
          idCliente: lote.idCliente,
          nAnimales: nCorral,
          nAnimalesEnfermeria: nEnfermeria,
        });
      }
    }
    return reparto;
  }

  /** Lista de alimentaciones (con filtros opcionales) para el histórico/reporte. */
  async listar(
    user: any,
    f: {
      idCorral?: number;
      idLote?: number;
      idCliente?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    } = {},
  ): Promise<AlimentacionView[]> {
    const empresaId = this.empresaActual(user);
    const isAdmin = this.esSysAdmin(user);
    const qb = this.alimentacionRepository
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.corral", "corral")
      .leftJoinAndSelect("a.dieta", "dieta")
      .leftJoinAndSelect("a.dietaVersion", "dv")
      .leftJoinAndSelect("a.empresa", "empresa")
      .leftJoinAndSelect("a.lotes", "al")
      .leftJoinAndSelect("al.lote", "lote");

    if (empresaId) {
      qb.where("a.id_empresa = :e", { e: empresaId });
    } else if (!isAdmin) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (userEmpresas.length === 0) return [];
      qb.where("a.id_empresa IN (:...ids)", { ids: userEmpresas });
    }

    if (f.idCorral) qb.andWhere("a.id_corral = :c", { c: f.idCorral });
    if (f.fechaDesde) qb.andWhere("a.fecha >= :desde", { desde: f.fechaDesde });
    if (f.fechaHasta) qb.andWhere("a.fecha <= :hasta", { hasta: f.fechaHasta });
    if (f.idLote) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM alimentacion_lote x WHERE x.id_alimentacion = a.id AND x.id_lote = :lote)",
        { lote: f.idLote },
      );
    }
    if (f.idCliente) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM alimentacion_lote y WHERE y.id_alimentacion = a.id AND y.id_cliente = :cli)",
        { cli: f.idCliente },
      );
    }

    qb.orderBy("a.fecha", "DESC").addOrderBy("a.id", "DESC");
    const filas = await qb.getMany();
    const usuarios = await this.cache.getOrLoadUsuarios();
    const nombreByUid = new Map(usuarios.map((u) => [u.uid, u.nombreUsuario]));
    return filas.map((a) => this.toView(a, nombreByUid));
  }

  private async obtenerDetalle(id: number): Promise<AlimentacionView> {
    const a = await this.alimentacionRepository.findOne({
      where: { id },
      relations: [
        "corral",
        "dieta",
        "dietaVersion",
        "empresa",
        "lotes",
        "lotes.lote",
      ],
    });
    if (!a) throw new NotFoundException("Alimentación no encontrada");
    const usuarios = await this.cache.getOrLoadUsuarios();
    const nombreByUid = new Map(usuarios.map((u) => [u.uid, u.nombreUsuario]));
    return this.toView(a, nombreByUid);
  }

  private toView(
    a: Alimentacion,
    nombreByUid: Map<string, string | null>,
  ): AlimentacionView {
    const lotes = (a.lotes ?? [])
      .slice()
      .sort((x, y) => x.idLote - y.idLote)
      .map((l) => ({
        loteId: l.idLote,
        loteNombre: l.lote?.nombre ?? "",
        idCliente: l.idCliente,
        clienteNombre: l.idCliente
          ? (nombreByUid.get(l.idCliente) ?? null)
          : null,
        nAnimales: l.nAnimales,
        cantidadKg: Number(l.cantidadKg),
        nAnimalesEnfermeria: l.nAnimalesEnfermeria,
        cantidadEnfermeriaKg: Number(l.cantidadEnfermeriaKg),
      }));
    return {
      id: a.id,
      fecha: this.fechaIso(a.fecha),
      cantidadKg: Number(a.cantidadKg),
      cantidadCorralKg: Number(a.cantidadCorralKg),
      cantidadEnfermeriaKg: Number(a.cantidadEnfermeriaKg),
      cantidadPorAnimal: Number(a.cantidadPorAnimal),
      nAnimales: a.nAnimales,
      nAnimalesEnfermeria: a.nAnimalesEnfermeria,
      corral: {
        id: a.corral?.id ?? a.idCorral,
        nombre: a.corral?.nombre ?? "",
      },
      dieta: {
        id: a.dieta?.id ?? a.idDieta,
        nombre: a.dieta?.nombre ?? "",
        version: a.dietaVersion?.version ?? 0,
      },
      empresa:
        a.empresa?.id != null
          ? { id: a.empresa.id, nombre: a.empresa.nombre }
          : null,
      lotes,
    };
  }

  private aDate(iso?: string): Date | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private hoyDate(): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private fechaIso(f: Date | string | null): string {
    if (f == null) return "";
    if (typeof f === "string") return f.slice(0, 10);
    const y = f.getFullYear();
    const m = `${f.getMonth() + 1}`.padStart(2, "0");
    const d = `${f.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
