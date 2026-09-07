import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Roles } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";
import { CreateCorralDto } from "./dto/create-corral.dto";
import { UpdateCorralDto } from "./dto/update-corral.dto";

export interface CorralResumen {
  id: number;
  nombre: string;
  tipo: string;
  capacidad: number | null;
  descripcion: string | null;
  activo: boolean;
  /** 'libre' | 'ocupado' (comunes) | 'enfermeria' (no tiene estado). */
  estado: string;
  /** Comunes: lotes activos que lo comparten (puede haber más de uno). */
  lotesOcupantes: { id: number; nombre: string; color: string | null }[];
  /** Comunes: animales de los lotes ocupantes. Enfermería: animales adentro. */
  nAnimales: number;
}

export interface TokenAnimal {
  animalId: number;
  nAnimal: number | null;
  caravana: string | null;
  estado: string;
  loteId: number;
  loteNombre: string;
  loteColor: string | null;
}

export interface CorralMapa {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
  /** Comunes: ids de los lotes activos que lo comparten (drag & drop). */
  loteIds: number[];
  animales: TokenAnimal[];
}

@Injectable()
export class CorralesService {
  constructor(
    @InjectRepository(Corral)
    private corralRepository: Repository<Corral>,
    @InjectRepository(Lote)
    private loteRepository: Repository<Lote>,
    @InjectRepository(Animal)
    private animalRepository: Repository<Animal>,
  ) {}

  /**
   * Lista los corrales de la empresa del usuario con el estado DERIVADO:
   * un común está "ocupado" si existe al menos un lote activo asignado a él
   * (pueden compartirlo varios lotes).
   */
  async findAll(user: any): Promise<CorralResumen[]> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) return [];

    const corrals = await this.corralRepository.find({
      where: { idEmpresa: empresaId },
      order: { tipo: "ASC", nombre: "ASC" },
    });
    if (corrals.length === 0) return [];

    // Lotes activos que comparten cada corral común (puede haber más de uno).
    const lotes = await this.loteRepository.find({
      where: { idEmpresa: empresaId, activo: true },
      order: { id: "ASC" },
    });
    const ocupantesByCorral = new Map<number, Lote[]>();
    for (const l of lotes) {
      if (l.idCorral != null) {
        const arr = ocupantesByCorral.get(l.idCorral) ?? [];
        arr.push(l);
        ocupantesByCorral.set(l.idCorral, arr);
      }
    }

    // Conteo de animales por lote (para comunes) y por enfermería.
    const loteIds = lotes.map((l) => l.id);
    const conteoLote = new Map<number, number>();
    if (loteIds.length > 0) {
      const rows = await this.animalRepository
        .createQueryBuilder("a")
        .select("a.idLote", "idLote")
        .addSelect("COUNT(*)", "n")
        .where("a.idLote IN (:...ids)", { ids: loteIds })
        .groupBy("a.idLote")
        .getRawMany();
      for (const r of rows) conteoLote.set(Number(r.idLote), Number(r.n));
    }
    const conteoEnfermeria = new Map<number, number>();
    const rowsEnf = await this.animalRepository
      .createQueryBuilder("a")
      .select("a.idCorralEnfermeria", "corralId")
      .addSelect("COUNT(*)", "n")
      .innerJoin("a.lote", "lote")
      .where("lote.idEmpresa = :e AND a.idCorralEnfermeria IS NOT NULL", {
        e: empresaId,
      })
      .groupBy("a.idCorralEnfermeria")
      .getRawMany();
    for (const r of rowsEnf) {
      conteoEnfermeria.set(Number(r.corralId), Number(r.n));
    }

    return corrals.map((c) => {
      if (c.tipo === "enfermeria") {
        return {
          id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          capacidad: c.capacidad,
          descripcion: c.descripcion,
          activo: c.activo,
          estado: "enfermeria",
          lotesOcupantes: [],
          nAnimales: conteoEnfermeria.get(c.id) ?? 0,
        };
      }
      const ocupantes = ocupantesByCorral.get(c.id) ?? [];
      const nAnimales = ocupantes.reduce(
        (acc, l) => acc + (conteoLote.get(l.id) ?? 0),
        0,
      );
      return {
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        capacidad: c.capacidad,
        descripcion: c.descripcion,
        activo: c.activo,
        estado:
          ocupantes.length > 0 ? "ocupado" : c.activo ? "libre" : "inactivo",
        lotesOcupantes: ocupantes.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          color: l.color,
        })),
        nAnimales,
      };
    });
  }

  async create(dto: CreateCorralDto, user: any): Promise<Corral> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException(
        "No tenés una empresa asociada (o no seleccionaste una)",
      );
    }
    const corral = this.corralRepository.create({
      idEmpresa: empresaId,
      nombre: capitalizarNombre(dto.nombre),
      tipo: dto.tipo,
      capacidad: dto.capacidad ?? null,
      descripcion: dto.descripcion?.trim() || null,
    });
    return this.corralRepository.save(corral);
  }

  /** El tipo no se edita: sólo nombre, capacidad (informativa) y descripción. */
  async update(id: number, dto: UpdateCorralDto, user: any): Promise<Corral> {
    const corral = await this.getCorralVerificado(id, user);
    if (dto.nombre != null) corral.nombre = capitalizarNombre(dto.nombre);
    if (dto.capacidad !== undefined) corral.capacidad = dto.capacidad ?? null;
    if (dto.descripcion !== undefined) {
      corral.descripcion = dto.descripcion?.trim() || null;
    }
    return this.corralRepository.save(corral);
  }

  /**
   * Habilita/deshabilita un corral. No se puede deshabilitar un común con
   * lotes activos asignados ni una enfermería con animales adentro.
   */
  async toggleActivo(id: number, activo: boolean, user: any): Promise<Corral> {
    const corral = await this.getCorralVerificado(id, user);
    if (!activo && corral.activo) {
      if (corral.tipo === "comun") {
        const ocupantes = await this.loteRepository.find({
          where: { idCorral: id, activo: true },
          order: { id: "ASC" },
        });
        if (ocupantes.length > 0) {
          const nombres = ocupantes.map((l) => `"${l.nombre}"`).join(", ");
          throw new BadRequestException(
            `El corral está ocupado por ${ocupantes.length} lote(s): ${nombres}. Reasignalos primero.`,
          );
        }
      } else {
        const dentro = await this.animalRepository.count({
          where: { idCorralEnfermeria: id },
        });
        if (dentro > 0) {
          throw new BadRequestException(
            `Hay ${dentro} animal(es) en este corral de enfermería. Traelos antes de deshabilitarlo.`,
          );
        }
      }
    }
    corral.activo = activo;
    return this.corralRepository.save(corral);
  }

  /**
   * Mapa de corrales activos para el panel de Lotes: los comunes muestran los
   * animales (que NO están en enfermería) de TODOS los lotes activos que los
   * comparten, con el color de su lote; las enfermerías muestran los animales
   * adentro (de cualquier lote).
   *
   * Un CLIENTE (aislamiento, regla 8 de AGENTS): sólo ve los corrales comunes
   * con lotes SUYOS (y únicamente sus animales) y las enfermerías con SOLO
   * animales de sus lotes (los ajenos se ocultan).
   */
  async mapa(user: any): Promise<CorralMapa[]> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) return [];

    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    const esCliente = !isAdmin && user.roles?.includes(Roles.CLIENTE);

    const corrals = await this.corralRepository.find({
      where: { idEmpresa: empresaId, activo: true },
      order: { tipo: "ASC", nombre: "ASC" },
    });

    const items = await Promise.all(
      corrals.map(async (c) => {
        let animales: TokenAnimal[] = [];
        let loteIds: number[] = [];
        if (c.tipo === "enfermeria") {
          const adentro = await this.animalRepository.find({
            where: { idCorralEnfermeria: c.id },
            relations: ["lote"],
            order: { nAnimal: "ASC", id: "ASC" },
          });
          const visibles = esCliente
            ? adentro.filter((a) => a.lote?.idCliente === user.id)
            : adentro;
          animales = visibles.map((a) => this.token(a));
        } else {
          const ocupantes = await this.loteRepository.find({
            where: { idCorral: c.id, activo: true },
            order: { id: "ASC" },
          });
          // Un cliente no ve corrales ajenos (sólo sus lotes dentro del común).
          const visibles = esCliente
            ? ocupantes.filter((l) => l.idCliente === user.id)
            : ocupantes;
          if (esCliente && visibles.length === 0) {
            return null;
          }
          loteIds = visibles.map((l) => l.id);
          if (loteIds.length > 0) {
            const delLote = await this.animalRepository.find({
              where: { idLote: In(loteIds), idCorralEnfermeria: IsNull() },
              relations: ["lote"],
              order: { nAnimal: "ASC", id: "ASC" },
            });
            animales = delLote.map((a) => this.token(a));
          }
        }
        return {
          id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          activo: c.activo,
          loteIds,
          animales: this.ordenarFichas(animales),
        };
      }),
    );

    return items.filter((i): i is CorralMapa => i !== null);
  }

  /** Corrales de enfermería activos de la empresa (para el picker). */
  findEnfermerias(user: any): Promise<Corral[]> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) return Promise.resolve([]);
    return this.corralRepository.find({
      where: { idEmpresa: empresaId, tipo: "enfermeria", activo: true },
      order: { nombre: "ASC" },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private empresaActual(user: any): number | null {
    const id = user.currentEmpresaId ?? null;
    return id ? Number(id) : null;
  }

  private token(a: Animal): TokenAnimal {
    return {
      animalId: a.id,
      nAnimal: a.nAnimal,
      caravana: a.caravana ?? null,
      estado: a.estado,
      loteId: a.lote?.id ?? a.idLote,
      loteNombre: a.lote?.nombre ?? "",
      loteColor: a.lote?.color ?? null,
    };
  }

  /**
   * Orden de las fichas del mapa: primero por id de lote (asc) y luego por
   * número de caravana (orden natural, numérico si son dígitos).
   */
  private ordenarFichas(animales: TokenAnimal[]): TokenAnimal[] {
    return animales.sort((a, b) => {
      if (a.loteId !== b.loteId) return a.loteId - b.loteId;
      const ca = a.caravana ?? "";
      const cb = b.caravana ?? "";
      const natural = ca.localeCompare(cb, "es", { numeric: true });
      if (natural !== 0) return natural;
      return a.animalId - b.animalId;
    });
  }

  private async getCorralVerificado(id: number, user: any): Promise<Corral> {
    const corral = await this.corralRepository.findOne({ where: { id } });
    if (!corral) {
      throw new NotFoundException("Corral no encontrado");
    }
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    if (!isAdmin) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(corral.idEmpresa)) {
        throw new ForbiddenException("No tiene permisos sobre este corral");
      }
    }
    return corral;
  }
}
