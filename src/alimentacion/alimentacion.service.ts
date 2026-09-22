import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { Alimentacion } from "../entities/alimentacion.entity";
import { AlimentacionLote } from "../entities/alimentacion-lote.entity";
import { Corral } from "../entities/corral.entity";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Partida } from "../entities/partida.entity";
import { Dieta, DietaVersion } from "../entities/dieta.entity";
import { LoteCorralAsignacion } from "../entities/lote-corral-asignacion.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { SalidaAnimal } from "../entities/salida-animal.entity";
import { Roles } from "src/constantes";
import { FirestoreCacheService } from "../cache/firestore-cache.service";
import {
  AjusteLoteDto,
  CreateAlimentacionDto,
  CreateAlimentacionesMasivaDto,
} from "./dto/create-alimentacion.dto";
import { ActualizarAlimentacionDto } from "./dto/actualizar-alimentacion.dto";

/** Fila interna del reparto por lote (antes de armar la vista). */
export interface RepartoRow {
  loteId: number;
  loteNombre: string;
  idCliente: string | null;
  nAnimales: number;
  nAnimalesEnfermeria: number;
}

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
  /** Hora de la alimentación 'HH:MM:SS' (default 12:00). */
  hora: string;
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
    @InjectRepository(Partida)
    private partidaRepository: Repository<Partida>,
    @InjectRepository(Dieta)
    private dietaRepository: Repository<Dieta>,
    @InjectRepository(DietaVersion)
    private dietaVersionRepository: Repository<DietaVersion>,
    @InjectRepository(LoteCorralAsignacion)
    private asignacionRepository: Repository<LoteCorralAsignacion>,
    @InjectRepository(AnimalMovimiento)
    private movimientoRepository: Repository<AnimalMovimiento>,
    @InjectRepository(SalidaAnimal)
    private salidaAnimalRepository: Repository<SalidaAnimal>,
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
   * Registra una alimentación de corral (una fila = un instante fecha+hora).
   * Reconstruye los animales del corral EN ESE INSTANTE (tasa = cantidad /
   * vivos en el común; enfermería = vivos del lote en enfermería, estimación
   * extra) y guarda el reparto por lote.
   */
  async crear(
    dto: CreateAlimentacionDto,
    user: any,
  ): Promise<AlimentacionView> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa actual asociada");
    }
    const corral = await this.validarCorralAlimentar(dto.idCorral, empresaId);
    const { dieta, version } = await this.validarDieta(dto.idDieta, empresaId);

    const idAlimentacion =
      await this.alimentacionRepository.manager.transaction(async (em) => {
        const alRepo = em.getRepository(Alimentacion);
        const alLoteRepo = em.getRepository(AlimentacionLote);
        return this.crearFila(em, alRepo, alLoteRepo, {
          empresaId,
          corral,
          dieta,
          version,
          fechaStr: dto.fecha,
          horaStr: dto.hora,
          cantidadKg: Number(dto.cantidadKg),
          ajuste: dto.ajuste,
          idUsuario: user?.id ?? null,
        });
      });

    return this.obtenerDetalle(idAlimentacion);
  }

  /**
   * Carga VARIAS alimentaciones (filas) en un solo request: mismo corral, cada
   * fila con su dieta, fecha, hora y cantidad. El reparto se reconstruye POR
   * FILA al instante fecha+hora de esa fila; todo en una transacción.
   */
  async crearMasivas(
    dto: CreateAlimentacionesMasivaDto,
    user: any,
  ): Promise<{ creadas: number }> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa actual asociada");
    }
    if (dto.filas.length === 0) {
      throw new BadRequestException("Cargá al menos una fila de alimentación");
    }
    const corral = await this.validarCorralAlimentar(dto.idCorral, empresaId);
    const creadas = await this.alimentacionRepository.manager.transaction(
      async (em) => {
        const alRepo = em.getRepository(Alimentacion);
        const alLoteRepo = em.getRepository(AlimentacionLote);
        let n = 0;
        for (const fila of dto.filas) {
          const { dieta, version } = await this.validarDieta(
            fila.idDieta,
            empresaId,
          );
          await this.crearFila(em, alRepo, alLoteRepo, {
            empresaId,
            corral,
            dieta,
            version,
            fechaStr: fila.fecha,
            horaStr: fila.hora,
            cantidadKg: Number(fila.cantidadKg),
            ajuste: fila.ajuste,
            idUsuario: user?.id ?? null,
          });
          n += 1;
        }
        return n;
      },
    );
    return { creadas };
  }

  /** Crea una alimentación (una fila) reconstruyendo el corral al instante T. */
  private async crearFila(
    em: EntityManager,
    alRepo: Repository<Alimentacion>,
    alLoteRepo: Repository<AlimentacionLote>,
    p: {
      empresaId: number;
      corral: Corral;
      dieta: Dieta;
      version: DietaVersion;
      fechaStr: string;
      horaStr?: string;
      cantidadKg: number;
      ajuste?: AjusteLoteDto[];
      idUsuario: string | null;
    },
  ): Promise<number> {
    const { fecha, hora, reparto, tasas } = await this.resolverReparto(
      p.empresaId,
      p.corral.id,
      p.fechaStr,
      p.horaStr,
      p.cantidadKg,
      p.ajuste,
    );
    return this.crearUna(em, alRepo, alLoteRepo, {
      empresaId: p.empresaId,
      corral: p.corral,
      dieta: p.dieta,
      version: p.version,
      fecha,
      hora,
      cantidadCorralKg: p.cantidadKg,
      reparto,
      tasas,
      idUsuario: p.idUsuario,
    });
  }

  /**
   * Resuelve el instante T (fecha+hora), el reparto (override `ajuste` o
   * reconstrucción del corral en T) y las tasas a partir de la cantidad.
   */
  private async resolverReparto(
    empresaId: number,
    idCorral: number,
    fechaStr: string,
    horaStr: string | undefined,
    cantidadKg: number,
    ajuste?: AjusteLoteDto[],
  ): Promise<{
    fecha: Date;
    hora: string;
    reparto: RepartoRow[];
    tasas: ReturnType<AlimentacionService["calcularTasas"]>;
  }> {
    const fecha = this.aDate(fechaStr);
    if (!fecha) throw new BadRequestException("Fecha inválida");
    const hora = this.normalizarHora(horaStr) ?? "12:00:00";
    const T = this.instanteStr(fechaStr, hora);
    const reparto =
      ajuste && ajuste.length > 0
        ? await this.repartoDesdeAjuste(ajuste, empresaId)
        : await this.estadoCorralEn(idCorral, T);
    const totalNCorral = reparto.reduce((acc, r) => acc + r.nAnimales, 0);
    if (totalNCorral === 0) {
      throw new BadRequestException(
        "No hay animales vivos para alimentar en este corral en esa fecha/hora",
      );
    }
    const tasas = this.calcularTasas(cantidadKg, reparto);
    return { fecha, hora, reparto, tasas };
  }

  /** Reparto a partir del ajuste editable del usuario (valida los lotes). */
  private async repartoDesdeAjuste(
    ajuste: AjusteLoteDto[],
    empresaId: number,
  ): Promise<RepartoRow[]> {
    const ids = ajuste.map((a) => a.loteId);
    const lotes = await this.loteEntidadRepository.find({
      where: { id: In(ids) },
    });
    const loteById = new Map(lotes.map((l) => [l.id, l]));
    const reparto: RepartoRow[] = [];
    for (const a of ajuste) {
      const lote = loteById.get(a.loteId);
      if (!lote || lote.idEmpresa !== empresaId) {
        throw new BadRequestException(
          "Un lote del ajuste no pertenece a tu empresa",
        );
      }
      if (a.nAnimales + a.nAnimalesEnfermeria <= 0) continue;
      reparto.push({
        loteId: lote.id,
        loteNombre: lote.nombre,
        idCliente: lote.idCliente,
        nAnimales: a.nAnimales,
        nAnimalesEnfermeria: a.nAnimalesEnfermeria,
      });
    }
    return reparto;
  }

  /** Edita una alimentación (fecha/hora/dieta/cantidad/ajuste) y RECALCULA el reparto. */
  async editar(
    id: number,
    dto: ActualizarAlimentacionDto,
    user: any,
  ): Promise<AlimentacionView> {
    const al = await this.alimentacionRepository.findOne({ where: { id } });
    if (!al) throw new NotFoundException("Alimentación no encontrada");
    if (!this.esSysAdmin(user)) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(al.idEmpresa)) {
        throw new ForbiddenException(
          "No tiene permisos sobre esta alimentación",
        );
      }
    }
    const cantidadKg =
      dto.cantidadKg != null
        ? Number(dto.cantidadKg)
        : Number(al.cantidadCorralKg);
    const { fecha, hora, reparto, tasas } = await this.resolverReparto(
      al.idEmpresa,
      al.idCorral,
      dto.fecha,
      dto.hora,
      cantidadKg,
      dto.ajuste,
    );

    // Dieta nueva (opcional): validar y resolver su versión vigente.
    let idDieta = al.idDieta;
    let idDietaVersion = al.idDietaVersion;
    if (dto.idDieta != null && dto.idDieta !== al.idDieta) {
      const { dieta, version } = await this.validarDieta(
        dto.idDieta,
        al.idEmpresa,
      );
      idDieta = dieta.id;
      idDietaVersion = version.id;
    }

    await this.alimentacionRepository.manager.transaction(async (em) => {
      const alRepo = em.getRepository(Alimentacion);
      const alLoteRepo = em.getRepository(AlimentacionLote);
      await alLoteRepo.delete({ idAlimentacion: al.id });
      al.fecha = fecha;
      al.hora = hora;
      al.idDieta = idDieta;
      al.idDietaVersion = idDietaVersion;
      al.cantidadCorralKg = redondear(cantidadKg, 2);
      al.cantidadKg = redondear(tasas.cantidadTotal, 2);
      al.cantidadEnfermeriaKg = redondear(tasas.cantidadEnfermeria, 2);
      al.cantidadPorAnimal = redondear(tasas.rate, 4);
      al.nAnimales = tasas.totalNCorral;
      al.nAnimalesEnfermeria = tasas.totalNEnfermeria;
      await alRepo.save(al);
      await alLoteRepo.save(
        reparto.map((r) =>
          alLoteRepo.create({
            idAlimentacion: al.id,
            idLote: r.loteId,
            idCliente: r.idCliente,
            nAnimales: r.nAnimales,
            cantidadKg: redondear(tasas.rate * r.nAnimales, 2),
            nAnimalesEnfermeria: r.nAnimalesEnfermeria,
            cantidadEnfermeriaKg: redondear(
              tasas.rate * r.nAnimalesEnfermeria,
              2,
            ),
          }),
        ),
      );
    });

    return this.obtenerDetalle(al.id);
  }

  // ---------------------------------------------------------------------------
  // Helpers del alta
  // ---------------------------------------------------------------------------

  /** Valida que el corral sea común, activo y de la empresa. */
  private async validarCorralAlimentar(
    idCorral: number,
    empresaId: number,
  ): Promise<Corral> {
    const corral = await this.corralRepository.findOne({
      where: { id: idCorral },
    });
    if (!corral || corral.idEmpresa !== empresaId || !corral.activo) {
      throw new BadRequestException("El corral indicado no está disponible");
    }
    if (corral.tipo === "enfermeria") {
      throw new BadRequestException(
        "Los corrales de enfermería se alimentan a través del corral de su lote",
      );
    }
    return corral;
  }

  /**
   * Vista previa de la reconstrucción del corral en un instante (fecha+hora):
   * lotes con sus animales en común y en enfermería. La usa el modal para
   * precargar los conteos editables antes de registrar.
   */
  async estadoCorral(
    idCorral: number,
    fecha: string,
    hora: string | undefined,
    user: any,
  ): Promise<RepartoRow[]> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa actual asociada");
    }
    const corral = await this.validarCorralAlimentar(idCorral, empresaId);
    const f = this.aDate(fecha);
    if (!f) throw new BadRequestException("Fecha inválida");
    const T = this.instanteStr(fecha, this.normalizarHora(hora) ?? "12:00:00");
    return this.estadoCorralEn(corral.id, T);
  }

  private async validarDieta(
    idDieta: number,
    empresaId: number,
  ): Promise<{ dieta: Dieta; version: DietaVersion }> {
    const dieta = await this.dietaRepository.findOne({
      where: { id: idDieta },
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
    return { dieta, version };
  }

  private calcularTasas(
    cantidadCorralKg: number,
    reparto: RepartoRow[],
  ): {
    totalNCorral: number;
    totalNEnfermeria: number;
    rate: number;
    cantidadEnfermeria: number;
    cantidadTotal: number;
  } {
    const totalNCorral = reparto.reduce((acc, r) => acc + r.nAnimales, 0);
    const totalNEnfermeria = reparto.reduce(
      (acc, r) => acc + r.nAnimalesEnfermeria,
      0,
    );
    const rate = cantidadCorralKg / totalNCorral;
    const cantidadEnfermeria = rate * totalNEnfermeria;
    return {
      totalNCorral,
      totalNEnfermeria,
      rate,
      cantidadEnfermeria,
      cantidadTotal: cantidadCorralKg + cantidadEnfermeria,
    };
  }

  private async crearUna(
    em: EntityManager,
    alRepo: Repository<Alimentacion>,
    alLoteRepo: Repository<AlimentacionLote>,
    p: {
      empresaId: number;
      corral: Corral;
      dieta: Dieta;
      version: DietaVersion;
      fecha: Date;
      hora: string;
      cantidadCorralKg: number;
      reparto: RepartoRow[];
      tasas: ReturnType<AlimentacionService["calcularTasas"]>;
      idUsuario: string | null;
    },
  ): Promise<number> {
    const t = p.tasas;
    const al = await alRepo.save(
      alRepo.create({
        idEmpresa: p.empresaId,
        idCorral: p.corral.id,
        idDieta: p.dieta.id,
        idDietaVersion: p.version.id,
        fecha: p.fecha,
        hora: p.hora,
        cantidadKg: redondear(t.cantidadTotal, 2),
        cantidadCorralKg: p.cantidadCorralKg,
        cantidadEnfermeriaKg: redondear(t.cantidadEnfermeria, 2),
        cantidadPorAnimal: redondear(t.rate, 4),
        nAnimales: t.totalNCorral,
        nAnimalesEnfermeria: t.totalNEnfermeria,
        idUsuario: p.idUsuario,
      }),
    );
    await alLoteRepo.save(
      p.reparto.map((r) =>
        alLoteRepo.create({
          idAlimentacion: al.id,
          idLote: r.loteId,
          idCliente: r.idCliente,
          nAnimales: r.nAnimales,
          cantidadKg: redondear(t.rate * r.nAnimales, 2),
          nAnimalesEnfermeria: r.nAnimalesEnfermeria,
          cantidadEnfermeriaKg: redondear(t.rate * r.nAnimalesEnfermeria, 2),
        }),
      ),
    );
    return al.id;
  }

  /**
   * Reconstruye la composición del corral en el instante T (fecha+hora):
   *  - lotes del corral en T → query de intervalos `lote_corral_asignacion`;
   *  - por animal: ingresó (`partida.fecha`, o `lote.fecha` si no tiene
   *    partida), vivo en T (no salió ni murió antes de T) y en común o en
   *    enfermería según el último movimiento ≤ T.
   * Devuelve por lote: nAnimales (común) y nAnimalesEnfermeria.
   */
  private async estadoCorralEn(
    idCorral: number,
    T: Date,
  ): Promise<RepartoRow[]> {
    const asign = await this.asignacionRepository
      .createQueryBuilder("a")
      .where("a.id_corral = :c", { c: idCorral })
      .andWhere("a.desde <= :T", { T })
      .andWhere("(a.hasta IS NULL OR a.hasta > :T)", { T })
      .getMany();
    const loteIds = Array.from(new Set(asign.map((a) => a.idLote)));

    if (loteIds.length === 0) return [];

    const lotes = await this.loteEntidadRepository.find({
      where: { id: In(loteIds) },
    });
    const loteById = new Map(lotes.map((l) => [l.id, l]));
    const animales = await this.animalRepository.find({
      where: { idLote: In(loteIds) },
    });
    if (animales.length === 0) return [];
    const ids = animales.map((a) => a.id);
    const partidaIds = Array.from(
      new Set(
        animales
          .map((a) => a.idPartida)
          .filter((id): id is number => id != null),
      ),
    );
    const partidas =
      partidaIds.length > 0
        ? await this.partidaRepository.find({ where: { id: In(partidaIds) } })
        : [];
    const partidaFecha = new Map(partidas.map((p) => [p.id, p.fecha]));

    const movs = await this.movimientoRepository.find({
      where: { idAnimal: In(ids) },
      order: { fecha: "ASC", hora: "ASC" },
    });
    const salidas = await this.salidaAnimalRepository.find({
      where: { idAnimal: In(ids) },
      relations: { salida: true },
    });

    const movByAnimal = new Map<number, AnimalMovimiento[]>();
    for (const m of movs) {
      const arr = movByAnimal.get(m.idAnimal) ?? [];
      arr.push(m);
      movByAnimal.set(m.idAnimal, arr);
    }
    const salidaMin = new Map<number, Date>();
    for (const sa of salidas) {
      const inst = this.instanteDe(
        sa.salida?.fecha,
        sa.salida?.hora ?? "12:00:00",
      );
      const prev = salidaMin.get(sa.idAnimal);
      if (!prev || inst < prev) salidaMin.set(sa.idAnimal, inst);
    }

    const comun = new Map<number, number>();
    const enf = new Map<number, number>();
    for (const a of animales) {
      // Ingreso de negocio: fecha de su partida, o del lote si no tiene.
      const fechaIngreso =
        (a.idPartida != null ? partidaFecha.get(a.idPartida) : null) ??
        loteById.get(a.idLote)?.fecha ??
        null;
      const inicio =
        fechaIngreso != null
          ? this.instanteDe(fechaIngreso, "00:00:00")
          : a.createdAt;
      if (!(inicio <= T)) continue; // el animal todavía no había ingresado
      const ms = movByAnimal.get(a.id) ?? [];
      let muerto = false;
      let ultimoEnf: AnimalMovimiento | null = null;
      for (const m of ms) {
        if (this.instanteDe(m.fecha, m.hora) > T) continue;
        if (m.estadoDespues === "muerto") muerto = true;
        if (m.tipo === "a_enfermeria" || m.tipo === "de_enfermeria") {
          ultimoEnf = m; // ms ordenado asc → queda el último ≤ T
        }
      }
      if (muerto) continue;
      const ex = salidaMin.get(a.id);
      if (ex && ex <= T) continue; // ya había salido
      if (ultimoEnf?.tipo === "a_enfermeria") {
        enf.set(a.idLote, (enf.get(a.idLote) ?? 0) + 1);
      } else {
        comun.set(a.idLote, (comun.get(a.idLote) ?? 0) + 1);
      }
    }

    const reparto: RepartoRow[] = [];
    for (const loteId of loteIds) {
      const nCorral = comun.get(loteId) ?? 0;
      const nEnf = enf.get(loteId) ?? 0;
      if (nCorral + nEnf === 0) continue;
      const lote = loteById.get(loteId);
      reparto.push({
        loteId,
        loteNombre: lote?.nombre ?? "",
        idCliente: lote?.idCliente ?? null,
        nAnimales: nCorral,
        nAnimalesEnfermeria: nEnf,
      });
    }
    return reparto;
  }

  /** 'HH:MM' | 'HH:MM:SS' → 'HH:MM:SS' (o null si no es válida). */
  private normalizarHora(h?: string): string | null {
    if (!h) return null;
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(h.trim());
    if (!m) return null;
    return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  }

  /** Instante local a partir de una fecha 'YYYY-MM-DD' y una hora 'HH:MM[:SS]'. */
  private instanteStr(fechaIso: string, hora: string): Date {
    const [y, mo, d] = fechaIso.slice(0, 10).split("-").map(Number);
    const [h, mi, s] = (hora || "12:00:00")
      .split(":")
      .map((x) => parseInt(x, 10) || 0);
    return new Date(y || 1970, (mo || 1) - 1, d || 1, h, mi, s);
  }

  /**
   * Instante local a partir de una columna DATE (pg/TypeORM puede devolverla
   * como `Date` o como string 'YYYY-MM-DD') y una hora 'HH:MM[:SS]'.
   */
  private instanteDe(
    fecha: Date | string | null | undefined,
    hora: string,
  ): Date {
    let iso = "1970-01-01";
    if (fecha) {
      iso =
        typeof fecha === "string"
          ? fecha.slice(0, 10)
          : fecha.toISOString().slice(0, 10);
    }
    return this.instanteStr(iso, hora);
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
      hora: a.hora ?? "12:00:00",
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
