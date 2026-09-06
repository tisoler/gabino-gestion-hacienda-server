import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Roles } from "src/constantes";
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
  loteOcupante: { id: number; nombre: string; color: string | null } | null;
  /** Comunes: animales del lote ocupante. Enfermería: animales adentro. */
  nAnimales: number;
}

export interface TokenAnimal {
  animalId: number;
  nAnimal: number | null;
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
  /** Comunes: lote ocupante (para validar drag & drop). null si libre/enfermería. */
  loteId: number | null;
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
   * un común está "ocupado" si existe un lote activo asignado a él.
   */
  async findAll(user: any): Promise<CorralResumen[]> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) return [];

    const corrals = await this.corralRepository.find({
      where: { idEmpresa: empresaId },
      order: { tipo: "ASC", nombre: "ASC" },
    });
    if (corrals.length === 0) return [];

    // Lote activo ocupante de cada corral (a lo sumo uno; se valida al asignar).
    const lotes = await this.loteRepository.find({
      where: { idEmpresa: empresaId, activo: true },
    });
    const ocupanteByCorral = new Map<number, Lote>();
    for (const l of lotes) {
      if (l.idCorral != null && !ocupanteByCorral.has(l.idCorral)) {
        ocupanteByCorral.set(l.idCorral, l);
      }
    }

    // Conteo de animales por lote (para comunes) y por enfermería.
    const loteIds = Array.from(
      new Set([...ocupanteByCorral.values()].map((l) => l.id)),
    );
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
          loteOcupante: null,
          nAnimales: conteoEnfermeria.get(c.id) ?? 0,
        };
      }
      const lote = ocupanteByCorral.get(c.id) ?? null;
      return {
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        capacidad: c.capacidad,
        descripcion: c.descripcion,
        activo: c.activo,
        estado: lote ? "ocupado" : c.activo ? "libre" : "inactivo",
        loteOcupante: lote
          ? { id: lote.id, nombre: lote.nombre, color: lote.color }
          : null,
        nAnimales: lote ? (conteoLote.get(lote.id) ?? 0) : 0,
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
      nombre: dto.nombre.trim(),
      tipo: dto.tipo,
      capacidad: dto.capacidad ?? null,
      descripcion: dto.descripcion?.trim() || null,
    });
    return this.corralRepository.save(corral);
  }

  /** El tipo no se edita: sólo nombre, capacidad (informativa) y descripción. */
  async update(id: number, dto: UpdateCorralDto, user: any): Promise<Corral> {
    const corral = await this.getCorralVerificado(id, user);
    if (dto.nombre != null) corral.nombre = dto.nombre.trim();
    if (dto.capacidad !== undefined) corral.capacidad = dto.capacidad ?? null;
    if (dto.descripcion !== undefined) {
      corral.descripcion = dto.descripcion?.trim() || null;
    }
    return this.corralRepository.save(corral);
  }

  /**
   * Habilita/deshabilita un corral. No se puede deshabilitar un común ocupado
   * por un lote activo ni una enfermería con animales adentro.
   */
  async toggleActivo(id: number, activo: boolean, user: any): Promise<Corral> {
    const corral = await this.getCorralVerificado(id, user);
    if (!activo && corral.activo) {
      if (corral.tipo === "comun") {
        const ocupante = await this.loteRepository.findOne({
          where: { idCorral: id, activo: true },
        });
        if (ocupante) {
          throw new BadRequestException(
            `El corral está ocupado por el lote "${ocupante.nombre}". Reasignalo primero.`,
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
   * animales del lote ocupante que NO están en enfermería; las enfermerías
   * muestran los animales adentro (de cualquier lote), con el color de su lote.
   *
   * Un CLIENTE (aislamiento, regla 8 de AGENTS): sólo ve los corrales comunes
   * cuyo lote ocupante es SUYO y las enfermerías con SOLO animales de sus
   * lotes (los ajenos se ocultan). No ve otros lotes ni otros animales.
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
        let loteId: number | null = null;
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
          const lote = await this.loteRepository.findOne({
            where: { idCorral: c.id, activo: true },
          });
          if (lote) {
            // Un cliente no ve corrales ajenos (ni siquiera vacíos de él).
            if (esCliente && lote.idCliente !== user.id) {
              return null;
            }
            loteId = lote.id;
            const delLote = await this.animalRepository.find({
              where: { idLote: lote.id, idCorralEnfermeria: IsNull() },
              order: { nAnimal: "ASC", id: "ASC" },
            });
            animales = delLote.map((a) => ({
              animalId: a.id,
              nAnimal: a.nAnimal,
              estado: a.estado,
              loteId: lote.id,
              loteNombre: lote.nombre,
              loteColor: lote.color,
            }));
          }
        }
        return {
          id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          activo: c.activo,
          loteId,
          animales,
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
      estado: a.estado,
      loteId: a.lote?.id ?? a.idLote,
      loteNombre: a.lote?.nombre ?? "",
      loteColor: a.lote?.color ?? null,
    };
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
