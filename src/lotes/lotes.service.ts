import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Corral } from "../entities/corral.entity";
import { Empresa } from "../entities/empresa.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Pesaje } from "../entities/pesaje.entity";
import { Roles, PALETA_LOTE } from "src/constantes";
import { CreateLoteDto } from "./dto/create-lote.dto";
import { UpdateLoteDto } from "./dto/update-lote.dto";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { CreateAnimalesMasivaDto } from "./dto/create-animales-masiva.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { TraerEnfermeriaDto } from "./dto/traer-enfermeria.dto";
import { CargarPesajesDto, EditarPesajeDto } from "./dto/pesajes.dto";
import { FirestoreCacheService } from "../cache/firestore-cache.service";
import { CatalogosService } from "../catalogos/catalogos.service";

export interface LoteResumen {
  id: number;
  idEmpresa: number;
  nombreEmpresa: string | null;
  nombre: string;
  descripcion: string | null;
  fecha: Date | null;
  idCliente: string | null;
  nombreCliente: string | null;
  idProveedor: number | null;
  nombreProveedor: string | null;
  idLugarOrigen: number | null;
  nombreLugarOrigen: string | null;
  idCorral: number | null;
  corralNombre: string | null;
  color: string | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  nAnimales: number;
}

@Injectable()
export class LotesService {
  constructor(
    @InjectRepository(Lote)
    private loteRepository: Repository<Lote>,
    @InjectRepository(Animal)
    private animalRepository: Repository<Animal>,
    @InjectRepository(Corral)
    private corralRepository: Repository<Corral>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectRepository(AnimalMovimiento)
    private movimientoRepository: Repository<AnimalMovimiento>,
    @InjectRepository(Pesaje)
    private pesajeRepository: Repository<Pesaje>,
    private cache: FirestoreCacheService,
    private catalogos: CatalogosService,
  ) {}

  /**
   * Lista lotes visibles para el usuario.
   *  - sys-admin: todos (o los de `currentEmpresaId` si llega).
   *  - anfitrión/operario: los de sus empresas.
   *  - cliente: sólo sus propias partidas (`id_cliente = uid`) dentro de sus
   *    empresas (aislamiento: no ve lotes de otros clientes).
   */
  async findAll(user: any, currentEmpresaId?: number): Promise<LoteResumen[]> {
    const query = this.loteRepository
      .createQueryBuilder("lote")
      .leftJoinAndSelect("lote.empresa", "empresa")
      .leftJoinAndSelect("lote.corral", "corral")
      .leftJoinAndSelect("lote.proveedor", "proveedor")
      .leftJoinAndSelect("lote.lugarOrigen", "lugarOrigen");
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    const isCliente = !isAdmin && user.roles?.includes(Roles.CLIENTE);
    const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
      Number(e),
    );

    if (currentEmpresaId) {
      if (!isAdmin && !userEmpresas.includes(currentEmpresaId)) {
        return [];
      }
      query.andWhere("lote.id_empresa = :cid", { cid: currentEmpresaId });
    } else if (!isAdmin) {
      if (userEmpresas.length === 0) return [];
      query.andWhere("lote.id_empresa IN (:...ids)", { ids: userEmpresas });
    }

    if (isCliente) {
      query.andWhere("lote.id_cliente = :uid", { uid: user.id });
    }

    query.andWhere("lote.activo = :a", { a: true });
    query.orderBy("lote.fecha", "DESC").addOrderBy("lote.id", "DESC");

    return this.enriquecer(await query.getMany());
  }

  async findOne(id: number, user: any) {
    const lote = await this.getLoteVerificado(id, user, [
      "corral",
      "proveedor",
      "lugarOrigen",
    ]);
    const animales = await this.animalRepository.find({
      where: { idLote: id },
      relations: ["raza", "categoria", "pelaje"],
      order: { nAnimal: "ASC", id: "ASC" },
    });
    const nombreCliente = await this.nombreDeCliente(lote.idCliente);
    // Serie de pesajes del lote (para las columnas intermedias y la gráfica).
    const animalIds = animales.map((a) => a.id);
    const pesajes = animalIds.length
      ? await this.pesajeRepository.find({
          where: { idAnimal: In(animalIds) },
          order: { fecha: "ASC", id: "ASC" },
        })
      : [];
    const { corral, proveedor, lugarOrigen, ...base } = lote as any;
    return {
      ...base,
      nombreCliente,
      corralNombre: corral?.nombre ?? null,
      nombreProveedor: proveedor?.nombre ?? null,
      nombreLugarOrigen: lugarOrigen?.nombre ?? null,
      animales: animales.map((a) => this.animalJson(a)),
      pesajes: pesajes.map((p) => this.pesajeJson(p)),
    };
  }

  /** Serializa un pesaje (decimals → number, fecha → 'YYYY-MM-DD'). */
  private pesajeJson(p: Pesaje): any {
    return {
      id: p.id,
      animalId: p.idAnimal,
      fecha: this.fechaIso(p.fecha),
      tipo: p.tipo,
      peso: Number(p.peso),
      desbaste: Number(p.desbaste ?? 0),
      pesoNeto: p.pesoNeto != null ? Number(p.pesoNeto) : null,
    };
  }

  /** Date (o 'YYYY-MM-DD' de pg) → 'YYYY-MM-DD' sin corrimiento de zona. */
  private fechaIso(f: Date | string | null): string | null {
    if (f == null) return null;
    if (typeof f === "string") return f.slice(0, 10);
    const y = f.getFullYear();
    const m = `${f.getMonth() + 1}`.padStart(2, "0");
    const d = `${f.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async create(
    createLoteDto: CreateLoteDto,
    user: any,
    currentEmpresaId?: number,
  ): Promise<Lote> {
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);

    let idEmpresa: number;
    if (isAdmin) {
      if (!createLoteDto.idEmpresa) {
        throw new BadRequestException(
          "Debe indicar la empresa destino del lote",
        );
      }
      idEmpresa = createLoteDto.idEmpresa;
    } else {
      const target = currentEmpresaId;
      if (!target) {
        throw new BadRequestException("El usuario no tiene una empresa actual");
      }
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(target)) {
        throw new ForbiddenException(
          "No tiene permisos para crear un lote en esa empresa",
        );
      }
      idEmpresa = target;
    }

    if (createLoteDto.idCliente) {
      await this.validarTitularDeEmpresa(createLoteDto.idCliente, idEmpresa);
    }
    if (createLoteDto.idProveedor != null) {
      await this.catalogos.validarValor(
        "proveedor",
        createLoteDto.idProveedor,
        idEmpresa,
        "proveedor",
      );
    }
    if (createLoteDto.idLugarOrigen != null) {
      await this.catalogos.validarValor(
        "lugar_origen",
        createLoteDto.idLugarOrigen,
        idEmpresa,
        "lugar de origen",
      );
    }
    if (createLoteDto.idCorral != null) {
      await this.validarCorralComun(createLoteDto.idCorral, idEmpresa);
    }

    const color = createLoteDto.color ?? (await this.siguienteColor(idEmpresa));

    const lote = this.loteRepository.create({
      idEmpresa,
      nombre: createLoteDto.nombre,
      descripcion: createLoteDto.descripcion ?? null,
      fecha: this.aDate(createLoteDto.fecha),
      idCliente: createLoteDto.idCliente ?? null,
      idProveedor: createLoteDto.idProveedor ?? null,
      idLugarOrigen: createLoteDto.idLugarOrigen ?? null,
      idCorral: createLoteDto.idCorral ?? null,
      color,
    });
    return this.loteRepository.save(lote);
  }

  async update(
    id: number,
    updateLoteDto: UpdateLoteDto,
    user: any,
  ): Promise<Lote> {
    const lote = await this.getLoteVerificado(id, user);

    if (updateLoteDto.nombre != null) lote.nombre = updateLoteDto.nombre;
    if (updateLoteDto.descripcion !== undefined) {
      lote.descripcion = updateLoteDto.descripcion ?? null;
    }
    if (updateLoteDto.fecha !== undefined) {
      lote.fecha = this.aDate(updateLoteDto.fecha);
    }
    if (updateLoteDto.idCliente !== undefined) {
      if (updateLoteDto.idCliente) {
        await this.validarTitularDeEmpresa(
          updateLoteDto.idCliente,
          lote.idEmpresa,
        );
        lote.idCliente = updateLoteDto.idCliente;
      } else {
        lote.idCliente = null;
      }
    }
    if (updateLoteDto.idProveedor !== undefined) {
      if (updateLoteDto.idProveedor != null) {
        await this.catalogos.validarValor(
          "proveedor",
          updateLoteDto.idProveedor,
          lote.idEmpresa,
          "proveedor",
        );
      }
      lote.idProveedor = updateLoteDto.idProveedor ?? null;
    }
    if (updateLoteDto.idLugarOrigen !== undefined) {
      if (updateLoteDto.idLugarOrigen != null) {
        await this.catalogos.validarValor(
          "lugar_origen",
          updateLoteDto.idLugarOrigen,
          lote.idEmpresa,
          "lugar de origen",
        );
      }
      lote.idLugarOrigen = updateLoteDto.idLugarOrigen ?? null;
    }
    if (updateLoteDto.idCorral !== undefined) {
      if (updateLoteDto.idCorral) {
        await this.validarCorralComun(updateLoteDto.idCorral, lote.idEmpresa);
        lote.idCorral = updateLoteDto.idCorral;
      } else {
        lote.idCorral = null;
      }
    }
    if (updateLoteDto.color !== undefined) {
      lote.color = updateLoteDto.color ?? null;
    }
    return this.loteRepository.save(lote);
  }

  // ---------------------------------------------------------------------------
  // Animales (pesajes de la partida)
  // ---------------------------------------------------------------------------

  async addAnimal(
    idLote: number,
    dto: CreateAnimalDto,
    user: any,
  ): Promise<any> {
    const lote = await this.getLoteVerificado(idLote, user);
    const caravana = dto.caravana?.trim();
    if (!caravana) {
      throw new BadRequestException("La caravana es obligatoria");
    }
    await this.validarCaravanaLibre(lote.id, caravana, undefined);
    await this.catalogos.validarValor(
      "pelaje",
      dto.idPelaje,
      lote.idEmpresa,
      "pelaje",
    );
    if (dto.idRaza != null) {
      await this.catalogos.validarValor(
        "raza",
        dto.idRaza,
        lote.idEmpresa,
        "raza",
      );
    }
    if (dto.idCategoria != null) {
      await this.catalogos.validarValor(
        "categoria",
        dto.idCategoria,
        lote.idEmpresa,
        "categoría",
      );
    }
    const estado = dto.estado ?? "sano";
    if (estado !== "sano" && !dto.motivo?.trim()) {
      throw new BadRequestException(
        "Indicá la razón o enfermedad al dar de alta un animal enfermo o muerto",
      );
    }
    const nAnimal =
      dto.nAnimal ?? (await this.siguienteNAnimal(lote.id, undefined));
    const base = {
      idLote: lote.id,
      nAnimal,
      caravana,
      idPelaje: dto.idPelaje,
      idRaza: dto.idRaza ?? null,
      idCategoria: dto.idCategoria ?? null,
      observaciones: dto.observaciones ?? null,
      estado,
      idCorralEnfermeria: null,
    };
    const saved = await this.animalRepository.save(
      this.animalRepository.create(base),
    );
    // Los pesos SIEMPRE viven en `pesaje`: alta del inicial/final si vinieron.
    await this.aplicarPesosDeDto(
      saved.id,
      dto.fechaPesajeIni,
      dto.pesoInicial,
      dto.desbasteIni,
      dto.fechaPesajeFin,
      dto.pesoFinal,
      dto.desbasteFin,
    );
    if (estado !== "sano") {
      await this.registrarMovimiento({
        idAnimal: saved.id,
        idEmpresa: lote.idEmpresa,
        tipo: "cambio_estado",
        estadoAntes: "sano",
        estadoDespues: estado,
        motivo: dto.motivo,
        user,
      });
    }
    return this.animalJson(await this.cargarAnimal(saved.id));
  }

  /**
   * Alta/edición de animal: crea/actualiza los pesajes 'inicial'/'final' a
   * partir de los campos de peso del DTO (fecha + peso obligatorios juntos) y
   * recalcula la proyección del animal.
   */
  private async aplicarPesosDeDto(
    animalId: number,
    fechaIni?: string,
    pesoIni?: number | null,
    desbasteIni?: number,
    fechaFin?: string,
    pesoFin?: number | null,
    desbasteFin?: number,
  ) {
    if (fechaIni && pesoIni != null) {
      await this.setPesajeTipo(
        animalId,
        "inicial",
        fechaIni,
        pesoIni,
        desbasteIni,
      );
    }
    if (fechaFin && pesoFin != null) {
      await this.setPesajeTipo(
        animalId,
        "final",
        fechaFin,
        pesoFin,
        desbasteFin,
      );
    }
    await this.proyectarAnimal(animalId);
  }

  /**
   * Garantiza UN pesaje por (animal, 'inicial'|'final'): actualiza el existente
   * (incluida la fecha) o crea uno nuevo.
   */
  private async setPesajeTipo(
    animalId: number,
    tipo: "inicial" | "final",
    fechaIso: string,
    peso: number,
    desbaste?: number,
  ) {
    const fecha = this.aDate(fechaIso);
    if (!fecha) return;
    const existente = await this.pesajeRepository.findOne({
      where: { idAnimal: animalId, tipo },
    });
    const neto = Math.round((peso - Number(desbaste ?? 0)) * 100) / 100;
    if (existente) {
      existente.fecha = fecha;
      existente.peso = peso;
      existente.desbaste = desbaste ?? 0;
      existente.pesoNeto = neto;
      await this.pesajeRepository.save(existente);
    } else {
      await this.pesajeRepository.save(
        this.pesajeRepository.create({
          idAnimal: animalId,
          tipo,
          fecha,
          peso,
          desbaste: desbaste ?? 0,
          pesoNeto: neto,
        }),
      );
    }
  }

  /**
   * Recalcula la PROYECCIÓN de `animal` (peso_inicial/final, fechas, desbastes,
   * netos, diferencia y aum. diario) desde sus pesajes 'inicial' y 'final'.
   */
  private async proyectarAnimal(animalId: number) {
    await this.proyectarAnimales([animalId]);
  }

  /**
   * Proyección BULK: 1 SELECT de pesajes + 1 de animales, cálculo en memoria y
   * un único `save(array)` (transacción) en lugar de N×(select+select+update).
   */
  private async proyectarAnimales(animalIds: number[]) {
    if (animalIds.length === 0) return;
    const [pesajes, animales] = await Promise.all([
      this.pesajeRepository.find({
        where: { idAnimal: In(animalIds) },
        order: { fecha: "ASC", id: "ASC" },
      }),
      this.animalRepository.find({ where: { id: In(animalIds) } }),
    ]);
    const porAnimal = new Map<
      number,
      { ini: Pesaje | null; fin: Pesaje | null }
    >();
    for (const p of pesajes) {
      const acc = porAnimal.get(p.idAnimal) ?? { ini: null, fin: null };
      if (p.tipo === "inicial" && !acc.ini) acc.ini = p;
      if (p.tipo === "final" && !acc.fin) acc.fin = p;
      porAnimal.set(p.idAnimal, acc);
    }
    for (const a of animales) {
      const { ini, fin } = porAnimal.get(a.id) ?? { ini: null, fin: null };
      a.fechaPesajeIni = ini?.fecha ?? null;
      a.pesoInicial = ini ? Number(ini.peso) : null;
      a.desbasteIni = ini ? Number(ini.desbaste ?? 0) : 0;
      a.fechaPesajeFin = fin?.fecha ?? null;
      a.pesoFinal = fin ? Number(fin.peso) : null;
      a.desbasteFin = fin ? Number(fin.desbaste ?? 0) : 0;
      Object.assign(a, this.computar(a));
    }
    if (animales.length > 0) await this.animalRepository.save(animales);
  }

  /**
   * Carga masiva de animales al lote: raza (opcional), pelaje (requerido) y
   * categoría (requerida, de la que se infiere el sexo) compartidos + fechas/
   * pesos/desbastes/observaciones opcionales. `animales` trae las caravanas
   * (y N° opcional) de cada fila del preview. Se auto-numera desde el último
   * N° del lote. Todo en una sola transacción.
   */
  async addAnimalesMasiva(
    idLote: number,
    dto: CreateAnimalesMasivaDto,
    user: any,
  ): Promise<{ creados: number; animales: any[] }> {
    const lote = await this.getLoteVerificado(idLote, user);
    if (dto.animales.length !== dto.cantidad) {
      throw new BadRequestException(
        "La cantidad no coincide con las caravanas ingresadas",
      );
    }
    await this.catalogos.validarValor(
      "pelaje",
      dto.idPelaje,
      lote.idEmpresa,
      "pelaje",
    );
    await this.catalogos.validarValor(
      "categoria",
      dto.idCategoria,
      lote.idEmpresa,
      "categoría",
    );
    if (dto.idRaza != null) {
      await this.catalogos.validarValor(
        "raza",
        dto.idRaza,
        lote.idEmpresa,
        "raza",
      );
    }

    // Caravanas: no vacías ni duplicadas dentro del envío.
    const seen = new Set<string>();
    for (const item of dto.animales) {
      const c = item.caravana?.trim();
      if (!c) {
        throw new BadRequestException("Todas las caravanas son obligatorias");
      }
      const key = c.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(`Caravana duplicada: "${c}"`);
      }
      seen.add(key);
      await this.validarCaravanaLibre(lote.id, c, undefined);
    }

    // Peso inicial por animal (total → se reparte; animal → viene por fila).
    const redondear = (n: number) => Math.round(n * 100) / 100;
    let pesoPorAnimal:
      | ((item: (typeof dto.animales)[number]) => {
          peso: number;
          desbaste: number;
        } | null)
      | null = null;
    if (dto.modoInicial === "total") {
      if (!dto.fechaPesajeIni || dto.pesoTotal == null) {
        throw new BadRequestException(
          "Para cargar peso inicial por total indicá la fecha y el peso total",
        );
      }
      const n = dto.animales.length;
      const per = redondear(Number(dto.pesoTotal) / n);
      const desb =
        dto.desbasteTotal != null
          ? redondear(Number(dto.desbasteTotal) / n)
          : 0;
      pesoPorAnimal = () => ({ peso: per, desbaste: desb });
    } else if (dto.modoInicial === "animal") {
      if (!dto.fechaPesajeIni) {
        throw new BadRequestException("Para el peso inicial indicá la fecha");
      }
      pesoPorAnimal = (item) =>
        item.peso != null
          ? { peso: Number(item.peso), desbaste: Number(item.desbaste ?? 0) }
          : null;
    }

    const fechaIni = dto.fechaPesajeIni ? this.aDate(dto.fechaPesajeIni) : null;
    // BULK: 1 save de animales + 1 save de pesajes dentro de UNA transacción.
    const ids = await this.animalRepository.manager.transaction(async (em) => {
      const repo = em.getRepository(Animal);
      let next = await this.siguienteNAnimal(lote.id, undefined, em);
      const nuevos = dto.animales.map((item) =>
        repo.create({
          idLote: lote.id,
          nAnimal: item.nAnimal ?? next++,
          caravana: item.caravana.trim(),
          idPelaje: dto.idPelaje,
          idRaza: dto.idRaza ?? null,
          idCategoria: dto.idCategoria,
          observaciones: dto.observaciones ?? null,
          estado: "sano",
          idCorralEnfermeria: null,
        }),
      );
      const saved = await repo.save(nuevos);
      if (pesoPorAnimal && fechaIni) {
        const pesajeRepo = em.getRepository(Pesaje);
        const pesajes = saved
          .map((a, i) => {
            const w = pesoPorAnimal(dto.animales[i]);
            if (!w) return null;
            return pesajeRepo.create({
              idAnimal: a.id,
              tipo: "inicial",
              fecha: fechaIni,
              peso: w.peso,
              desbaste: w.desbaste,
              pesoNeto: redondear(w.peso - w.desbaste),
            });
          })
          .filter((p): p is NonNullable<typeof p> => p != null);
        if (pesajes.length > 0) await pesajeRepo.save(pesajes);
      }
      return saved.map((a) => a.id);
    });

    // Proyección BULK de los animales creados (peso_inicial/neto desde su pesaje).
    await this.proyectarAnimales(ids);

    const animales = await this.animalRepository.find({
      where: { id: In(ids) },
      relations: ["raza", "categoria", "pelaje"],
      order: { nAnimal: "ASC" },
    });
    return {
      creados: animales.length,
      animales: animales.map((a) => this.animalJson(a)),
    };
  }

  async updateAnimal(
    idLote: number,
    animalId: number,
    dto: UpdateAnimalDto,
    user: any,
  ): Promise<any> {
    const lote = await this.getLoteVerificado(idLote, user);
    const animal = await this.animalRepository.findOne({
      where: { id: animalId, idLote: lote.id },
    });
    if (!animal) {
      throw new NotFoundException("Animal no encontrado");
    }

    if (dto.nAnimal !== undefined) animal.nAnimal = dto.nAnimal;
    if (dto.caravana !== undefined) {
      const caravana = dto.caravana?.trim();
      if (!caravana) {
        throw new BadRequestException("La caravana es obligatoria");
      }
      await this.validarCaravanaLibre(lote.id, caravana, animal.id);
      animal.caravana = caravana;
    }
    if (dto.idPelaje !== undefined) {
      if (dto.idPelaje != null) {
        await this.catalogos.validarValor(
          "pelaje",
          dto.idPelaje,
          lote.idEmpresa,
          "pelaje",
        );
      }
      animal.idPelaje = dto.idPelaje ?? null;
    }
    if (dto.idRaza !== undefined) {
      if (dto.idRaza != null) {
        await this.catalogos.validarValor(
          "raza",
          dto.idRaza,
          lote.idEmpresa,
          "raza",
        );
      }
      animal.idRaza = dto.idRaza ?? null;
    }
    if (dto.idCategoria !== undefined) {
      if (dto.idCategoria != null) {
        await this.catalogos.validarValor(
          "categoria",
          dto.idCategoria,
          lote.idEmpresa,
          "categoría",
        );
      }
      animal.idCategoria = dto.idCategoria ?? null;
    }
    if (dto.observaciones !== undefined) {
      animal.observaciones = dto.observaciones;
    }

    let estadoNuevo: string | null = null;
    const estadoAnterior = animal.estado;
    let motivoTexto: string | null = null;
    if (dto.estado !== undefined && dto.estado !== animal.estado) {
      if (dto.estado === "muerto" && animal.idCorralEnfermeria != null) {
        throw new BadRequestException(
          "Traé primero al animal de enfermería para registrar su fallecimiento",
        );
      }
      const requiereMotivo =
        dto.estado === "enfermo" || dto.estado === "muerto";
      motivoTexto = await this.resolverMotivo(
        dto,
        lote.idEmpresa,
        requiereMotivo,
      );
      animal.estado = dto.estado;
      estadoNuevo = dto.estado;
    }

    // Los pesos NO se escriben directo: se guardan como pesajes (abajo).
    await this.animalRepository.save(animal);

    const hayPesos =
      dto.pesoInicial !== undefined ||
      dto.pesoFinal !== undefined ||
      dto.fechaPesajeIni !== undefined ||
      dto.fechaPesajeFin !== undefined;
    if (hayPesos) {
      await this.aplicarPesosDeDto(
        animal.id,
        dto.fechaPesajeIni,
        dto.pesoInicial,
        dto.desbasteIni,
        dto.fechaPesajeFin,
        dto.pesoFinal,
        dto.desbasteFin,
      );
    }

    if (estadoNuevo) {
      await this.registrarMovimiento({
        idAnimal: animal.id,
        idEmpresa: lote.idEmpresa,
        tipo: "cambio_estado",
        estadoAntes: estadoAnterior,
        estadoDespues: estadoNuevo,
        corralOrigen: await this.nombreCorralActual(animal, lote),
        motivo: motivoTexto,
        user,
      });
    }
    return this.animalJson(await this.cargarAnimal(animal.id));
  }

  async removeAnimal(
    idLote: number,
    animalId: number,
    user: any,
  ): Promise<{ ok: boolean }> {
    const lote = await this.getLoteVerificado(idLote, user);
    const animal = await this.animalRepository.findOne({
      where: { id: animalId, idLote: lote.id },
    });
    if (!animal) {
      throw new NotFoundException("Animal no encontrado");
    }
    await this.animalRepository.delete(animal.id);
    return { ok: true };
  }

  /**
   * Envía el animal a un corral de enfermería (o lo reasigna entre
   * enfermerías). Requiere el motivo/enfermedad: el estado pasa a 'enfermo'
   * y se registra el movimiento en el historial. Sin `idCorral`, usa la
   * primera enfermería activa de la empresa.
   */
  async enviarEnfermeria(
    idLote: number,
    animalId: number,
    dto: { idCorral?: number; motivo?: string; idMotivo?: number },
    user: any,
  ): Promise<any> {
    const lote = await this.getLoteVerificado(idLote, user);
    const animal = await this.animalRepository.findOne({
      where: { id: animalId, idLote: lote.id },
    });
    if (!animal) {
      throw new NotFoundException("Animal no encontrado");
    }
    if (animal.estado === "muerto") {
      throw new BadRequestException("Un animal muerto no puede moverse.");
    }
    if (animal.idCorralEnfermeria != null && !dto.idCorral) {
      throw new BadRequestException("El animal ya está en enfermería.");
    }
    const motivoTexto = await this.resolverMotivo(dto, lote.idEmpresa, true);

    let destino: Corral | null = null;
    if (dto.idCorral) {
      const c = await this.corralRepository.findOne({
        where: { id: dto.idCorral },
      });
      if (
        !c ||
        c.idEmpresa !== lote.idEmpresa ||
        !c.activo ||
        c.tipo !== "enfermeria"
      ) {
        throw new BadRequestException(
          "El corral de enfermería indicado no está disponible",
        );
      }
      destino = c;
    } else {
      destino = await this.corralRepository.findOne({
        where: { idEmpresa: lote.idEmpresa, tipo: "enfermeria", activo: true },
        order: { nombre: "ASC", id: "ASC" },
      });
      if (!destino) {
        throw new BadRequestException(
          "No hay un corral de enfermería activo en la empresa.",
        );
      }
    }

    if (animal.idCorralEnfermeria === destino.id) {
      // Misma enfermería: no-op.
      return this.animalJson(animal);
    }

    const origenNombre = await this.nombreCorralActual(animal, lote);
    const estadoAnterior = animal.estado;
    animal.idCorralEnfermeria = destino.id;
    animal.estado = "enfermo";
    const saved = await this.animalRepository.save(animal);

    await this.registrarMovimiento({
      idAnimal: saved.id,
      idEmpresa: lote.idEmpresa,
      tipo: "a_enfermeria",
      estadoAntes: estadoAnterior,
      estadoDespues: "enfermo",
      corralOrigen: origenNombre,
      corralDestino: destino.nombre,
      motivo: motivoTexto,
      user,
    });
    return this.animalJson(saved);
  }

  /**
   * Trae el animal de enfermería: limpia la excepción (vuelve al corral
   * ACTUAL de su lote por derivación) y aplica el estado de salida elegido
   * ('sano' | 'muerto'). Si sale muerto, la causa es obligatoria. Registra
   * el movimiento en el historial.
   */
  async traerDeEnfermeria(
    idLote: number,
    animalId: number,
    dto: TraerEnfermeriaDto,
    user: any,
  ): Promise<any> {
    const lote = await this.getLoteVerificado(idLote, user);
    const animal = await this.animalRepository.findOne({
      where: { id: animalId, idLote: lote.id },
    });
    if (!animal) {
      throw new NotFoundException("Animal no encontrado");
    }
    if (animal.idCorralEnfermeria == null) {
      throw new BadRequestException("El animal no está en enfermería.");
    }
    if (dto.estado === "muerto" && !dto.motivo?.trim() && !dto.idMotivo) {
      throw new BadRequestException(
        "Indicá la causa del fallecimiento para dar el alta de enfermería",
      );
    }
    const motivoTexto = await this.resolverMotivo(dto, lote.idEmpresa, false);

    const origen = await this.corralRepository.findOne({
      where: { id: animal.idCorralEnfermeria },
    });
    const estadoAnterior = animal.estado;
    animal.idCorralEnfermeria = null;
    animal.estado = dto.estado;
    const saved = await this.animalRepository.save(animal);

    await this.registrarMovimiento({
      idAnimal: saved.id,
      idEmpresa: lote.idEmpresa,
      tipo: "de_enfermeria",
      estadoAntes: estadoAnterior,
      estadoDespues: dto.estado,
      corralOrigen: origen?.nombre ?? null,
      corralDestino: await this.nombreCorralDeLote(lote),
      motivo: motivoTexto,
      user,
    });
    return this.animalJson(saved);
  }

  /** Historial de movimientos del animal, por fecha descendente. */
  async getMovimientos(idLote: number, animalId: number, user: any) {
    const lote = await this.getLoteVerificado(idLote, user);
    const animal = await this.animalRepository.findOne({
      where: { id: animalId, idLote: lote.id },
    });
    if (!animal) {
      throw new NotFoundException("Animal no encontrado");
    }
    const movimientos = await this.movimientoRepository.find({
      where: { idAnimal: animal.id },
      order: { createdAt: "DESC", id: "DESC" },
    });
    const usuarios = await this.cache.getOrLoadUsuarios();
    const nombreByUid = new Map<string, string | null>(
      usuarios.map((u) => [u.uid, u.nombreUsuario]),
    );
    return movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      estadoAntes: m.estadoAntes,
      estadoDespues: m.estadoDespues,
      corralOrigen: m.corralOrigen,
      corralDestino: m.corralDestino,
      motivo: m.motivo,
      idUsuario: m.idUsuario,
      usuarioNombre: m.idUsuario
        ? (nombreByUid.get(m.idUsuario) ?? null)
        : null,
      fecha: m.createdAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Pesajes (serie temporal por animal: inicial + N intermedios + final)
  // ---------------------------------------------------------------------------

  /**
   * Carga el PESO INICIAL de todo el lote. Con `modo: 'total'` reparte
   * `pesoTotal / cantidad` entre los animales; con `modo: 'animal'` usa la
   * lista. Reemplaza el pesaje 'inicial' de cada animal y recalcula la
   * proyección.
   */
  async cargarPesoInicial(idLote: number, dto: CargarPesajesDto, user: any) {
    return this.cargarPesajes(idLote, dto, user, "inicial");
  }

  /**
   * Agrega un PESAJE INTERMEDIO (una fecha nueva) al lote. Mismo mecanismo de
   * total/animal que el inicial.
   */
  async cargarPesajeIntermedio(
    idLote: number,
    dto: CargarPesajesDto,
    user: any,
  ) {
    return this.cargarPesajes(idLote, dto, user, "intermedio");
  }

  private async cargarPesajes(
    idLote: number,
    dto: CargarPesajesDto,
    user: any,
    tipo: "inicial" | "intermedio",
  ): Promise<{ actualizados: number }> {
    const lote = await this.getLoteVerificado(idLote, user);
    const fecha = this.aDate(dto.fecha);
    if (!fecha) throw new BadRequestException("Fecha de pesaje inválida");

    const animales = await this.animalRepository.find({
      where: { idLote: lote.id },
      order: { nAnimal: "ASC", id: "ASC" },
    });
    if (animales.length === 0) {
      throw new BadRequestException(
        "El lote no tiene animales; agregá animales antes de cargar pesos",
      );
    }

    const redondear = (n: number) => Math.round(n * 100) / 100;
    let porAnimal: (a: Animal) => { peso: number; desbaste: number } | null =
      null;

    if (dto.modo === "total") {
      if (dto.pesoTotal == null) {
        throw new BadRequestException("Indicá el peso total del lote");
      }
      const per = redondear(Number(dto.pesoTotal) / animales.length);
      const desb =
        dto.desbasteTotal != null
          ? redondear(Number(dto.desbasteTotal) / animales.length)
          : 0;
      porAnimal = () => ({ peso: per, desbaste: desb });
    } else {
      if (!dto.animales?.length) {
        throw new BadRequestException("Ingresá el peso de cada animal");
      }
      const idsLote = new Set(animales.map((a) => a.id));
      const map = new Map<number, { peso: number; desbaste: number }>();
      for (const r of dto.animales) {
        if (!idsLote.has(r.animalId)) {
          throw new BadRequestException(
            "Un animal indicado no pertenece a este lote",
          );
        }
        map.set(r.animalId, {
          peso: Number(r.peso),
          desbaste: Number(r.desbaste ?? 0),
        });
      }
      porAnimal = (a) => map.get(a.id) ?? null;
    }

    // Pesos objetivo por animal (map, no loop de queries).
    const pesos = new Map<number, { peso: number; desbaste: number }>();
    for (const a of animales) {
      const w = porAnimal(a);
      if (w) pesos.set(a.id, w);
    }
    if (pesos.size === 0) {
      throw new BadRequestException("No hay pesos para guardar");
    }

    // 1) Upsert BULK de pesajes: 1 SELECT + 1 save(array) (transacción única).
    const ids = Array.from(pesos.keys());
    const whereExistentes: any = { idAnimal: In(ids), tipo };
    if (tipo === "intermedio") whereExistentes.fecha = fecha;
    const existentes = await this.pesajeRepository.find({
      where: whereExistentes,
    });
    const porAnimalExistente = new Map<number, Pesaje>(
      existentes.map((p) => [p.idAnimal, p]),
    );
    const aGuardar: Pesaje[] = [];
    for (const [animalId, w] of pesos) {
      const neto = redondear(w.peso - Number(w.desbaste ?? 0));
      const e = porAnimalExistente.get(animalId);
      if (e) {
        e.fecha = fecha;
        e.peso = w.peso;
        e.desbaste = w.desbaste;
        e.pesoNeto = neto;
        aGuardar.push(e);
      } else {
        aGuardar.push(
          this.pesajeRepository.create({
            idAnimal: animalId,
            tipo,
            fecha,
            peso: w.peso,
            desbaste: w.desbaste,
            pesoNeto: neto,
          }),
        );
      }
    }
    await this.pesajeRepository.save(aGuardar);

    // 2) Proyección BULK de los animales afectados.
    await this.proyectarAnimales(ids);
    return { actualizados: ids.length };
  }

  /** Edita un pesaje puntual (peso/desbaste/fecha). Recalcula la proyección. */
  async editarPesaje(
    idLote: number,
    pesajeId: number,
    dto: EditarPesajeDto,
    user: any,
  ): Promise<any> {
    const lote = await this.getLoteVerificado(idLote, user);
    const pesaje = await this.pesajeRepository.findOne({
      where: { id: pesajeId },
      relations: ["animal"],
    });
    if (!pesaje || pesaje.animal?.idLote !== lote.id) {
      throw new NotFoundException("Pesaje no encontrado");
    }
    if (dto.fecha) {
      const f = this.aDate(dto.fecha);
      if (f) pesaje.fecha = f;
    }
    if (dto.peso !== undefined) pesaje.peso = dto.peso;
    if (dto.desbaste !== undefined) pesaje.desbaste = dto.desbaste;
    pesaje.pesoNeto =
      Math.round((Number(pesaje.peso) - Number(pesaje.desbaste ?? 0)) * 100) /
      100;
    await this.pesajeRepository.save(pesaje);
    await this.proyectarAnimal(pesaje.idAnimal);
    return this.pesajeJson(pesaje);
  }

  /** Elimina un pesaje puntual (p. ej. un intermedo aislado). */
  async eliminarPesaje(idLote: number, pesajeId: number, user: any) {
    const lote = await this.getLoteVerificado(idLote, user);
    const pesaje = await this.pesajeRepository.findOne({
      where: { id: pesajeId },
      relations: ["animal"],
    });
    if (!pesaje || pesaje.animal?.idLote !== lote.id) {
      throw new NotFoundException("Pesaje no encontrado");
    }
    await this.pesajeRepository.delete(pesaje.id);
    await this.proyectarAnimal(pesaje.idAnimal);
    return { ok: true };
  }

  /**
   * Elimina TODOS los pesajes intermedios de una fecha del lote (borra una
   * columna de pesaje intermedio completa). Recalcula la proyección afectados.
   */
  async eliminarPesajesFecha(
    idLote: number,
    fechaIso: string,
    user: any,
  ): Promise<{ eliminados: number }> {
    const lote = await this.getLoteVerificado(idLote, user);
    const fecha = this.aDate(fechaIso);
    if (!fecha) throw new BadRequestException("Fecha inválida");
    const animales = await this.animalRepository.find({
      where: { idLote: lote.id },
      select: ["id"],
    });
    const ids = animales.map((a) => a.id);
    if (ids.length === 0) return { eliminados: 0 };
    const aEliminar = await this.pesajeRepository.find({
      where: { idAnimal: In(ids), tipo: "intermedio", fecha },
    });
    if (aEliminar.length === 0) return { eliminados: 0 };
    await this.pesajeRepository.delete(aEliminar.map((p) => p.id));
    await this.proyectarAnimales(
      Array.from(new Set(aEliminar.map((p) => p.idAnimal))),
    );
    return { eliminados: aEliminar.length };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getLoteVerificado(
    id: number,
    user: any,
    relations?: string[],
  ): Promise<Lote> {
    const lote = await this.loteRepository.findOne({
      where: { id },
      relations,
    });
    if (!lote) {
      throw new NotFoundException("Lote no encontrado");
    }
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    if (!isAdmin) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(lote.idEmpresa)) {
        throw new ForbiddenException("No tiene permisos sobre este lote");
      }
      // Un cliente sólo accede a sus propias partidas.
      if (user.roles?.includes(Roles.CLIENTE) && lote.idCliente !== user.id) {
        throw new NotFoundException("Lote no encontrado");
      }
    }
    return lote;
  }

  /**
   * Valida que el lote pueda asignarse a `idCorral`: corral COMÚN, activo y de
   * la empresa. Un común puede compartir VARIOS lotes activos (ya no se exige
   * que esté libre).
   */
  private async validarCorralComun(idCorral: number, idEmpresa: number) {
    const corral = await this.corralRepository.findOne({
      where: { id: idCorral },
    });
    if (
      !corral ||
      corral.idEmpresa !== idEmpresa ||
      !corral.activo ||
      corral.tipo !== "comun"
    ) {
      throw new BadRequestException(
        "El corral indicado no es un corral común disponible de tu empresa",
      );
    }
  }

  /** Asigna el próximo color de la paleta según cuántos lotes tenga la empresa. */
  private async siguienteColor(idEmpresa: number): Promise<string> {
    const n = await this.loteRepository.count({ where: { idEmpresa } });
    return PALETA_LOTE[n % PALETA_LOTE.length];
  }

  /**
   * Valida que el lote pueda asociarse a `idTitular`: un CLIENTE vinculado a
   * la empresa o el ANFITRIÓN de la empresa (animales propios).
   */
  private async validarTitularDeEmpresa(idCliente: string, idEmpresa: number) {
    const todos = await this.cache.getOrLoadUsuarios();
    const titular = todos.find((u) => u.uid === idCliente);
    if (
      !titular ||
      !(
        titular.roles.includes(Roles.CLIENTE) ||
        titular.roles.includes(Roles.ANFITRION)
      ) ||
      !titular.idEmpresas.includes(idEmpresa)
    ) {
      throw new BadRequestException(
        "El titular indicado no es cliente ni anfitrión de tu empresa",
      );
    }
  }

  /**
   * Resuelve el motivo de un movimiento: por `idMotivo` (validado contra el
   * catálogo) o por texto `motivo` (busca/crea el valor en el catálogo).
   * Devuelve el nombre a guardar como snapshot.
   */
  private async resolverMotivo(
    dto: { motivo?: string; idMotivo?: number },
    idEmpresa: number,
    obligatorio: boolean,
  ): Promise<string | null> {
    if (dto.idMotivo) {
      const m = await this.catalogos.validarValor(
        "motivo",
        dto.idMotivo,
        idEmpresa,
        "motivo",
      );
      return m.nombre;
    }
    if (dto.motivo?.trim()) {
      const m = await this.catalogos.buscarOcrear(
        "motivo",
        dto.motivo,
        idEmpresa,
      );
      return m.nombre;
    }
    if (obligatorio) {
      throw new BadRequestException(
        "Indicá la razón o enfermedad del movimiento",
      );
    }
    return null;
  }

  /** Registra un movimiento sanitario en el historial del animal. */
  private async registrarMovimiento(params: {
    idAnimal: number;
    idEmpresa: number;
    tipo: string;
    estadoAntes?: string | null;
    estadoDespues?: string | null;
    corralOrigen?: string | null;
    corralDestino?: string | null;
    motivo?: string | null;
    user: any;
  }) {
    let idMotivo: number | null = null;
    let motivoNombre: string | null = null;
    if (params.motivo?.trim()) {
      const m = await this.catalogos.buscarOcrear(
        "motivo",
        params.motivo,
        params.idEmpresa,
      );
      idMotivo = m.id;
      motivoNombre = m.nombre;
    }
    await this.movimientoRepository.save(
      this.movimientoRepository.create({
        idAnimal: params.idAnimal,
        tipo: params.tipo,
        estadoAntes: params.estadoAntes ?? null,
        estadoDespues: params.estadoDespues ?? null,
        corralOrigen: params.corralOrigen ?? null,
        corralDestino: params.corralDestino ?? null,
        idMotivo,
        motivo: motivoNombre,
        idUsuario: params.user?.id ?? null,
      }),
    );
  }

  /** Nombre del corral donde está el animal AHORA (enfermería o el del lote). */
  private async nombreCorralActual(
    animal: Animal,
    lote: Lote,
  ): Promise<string | null> {
    const id = animal.idCorralEnfermeria ?? lote.idCorral;
    return this.nombreCorral(id);
  }

  private async nombreCorralDeLote(lote: Lote): Promise<string | null> {
    return this.nombreCorral(lote.idCorral);
  }

  private async nombreCorral(id: number | null): Promise<string | null> {
    if (id == null) return null;
    const c = await this.corralRepository.findOne({ where: { id } });
    return c?.nombre ?? null;
  }

  private async nombreDeCliente(
    idCliente: string | null,
  ): Promise<string | null> {
    if (!idCliente) return null;
    const todos = await this.cache.getOrLoadUsuarios();
    return todos.find((u) => u.uid === idCliente)?.nombreUsuario ?? null;
  }

  private async enriquecer(lotes: Lote[]): Promise<LoteResumen[]> {
    if (lotes.length === 0) return [];

    const ids = lotes.map((l) => l.id);
    const counts = await this.animalRepository
      .createQueryBuilder("a")
      .select("a.idLote", "idLote")
      .addSelect("COUNT(*)", "n")
      .where("a.idLote IN (:...ids)", { ids })
      .groupBy("a.idLote")
      .getRawMany();
    const countBy = new Map<number, number>(
      counts.map((c) => [Number(c.idLote), Number(c.n)]),
    );

    const usuarios = await this.cache.getOrLoadUsuarios();
    const nameByUid = new Map<string, string | null>(
      usuarios.map((u) => [u.uid, u.nombreUsuario]),
    );

    return lotes.map((l) => ({
      id: l.id,
      idEmpresa: l.idEmpresa,
      nombreEmpresa: l.empresa?.nombre ?? null,
      nombre: l.nombre,
      descripcion: l.descripcion,
      fecha: l.fecha,
      idCliente: l.idCliente,
      nombreCliente: l.idCliente ? (nameByUid.get(l.idCliente) ?? null) : null,
      idProveedor: l.idProveedor,
      nombreProveedor: l.proveedor?.nombre ?? null,
      idLugarOrigen: l.idLugarOrigen,
      nombreLugarOrigen: l.lugarOrigen?.nombre ?? null,
      idCorral: l.idCorral,
      corralNombre: l.corral?.nombre ?? null,
      color: l.color,
      activo: l.activo,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      nAnimales: countBy.get(l.id) ?? 0,
    }));
  }

  /**
   * Calcula PESO NETO (peso - desbaste), DIFERENCIA (neto final - neto inicial)
   * y AUM. DIARIO (diferencia / días) según la planilla. Devuelve sólo los
   * campos calculados.
   */
  private computar(animal: Partial<Animal>): Partial<Animal> {
    const redondear = (n: number) => Math.round(n * 100) / 100;

    const desbasteIni = Number(animal.desbasteIni ?? 0);
    const desbasteFin = Number(animal.desbasteFin ?? 0);
    const pesoInicial =
      animal.pesoInicial != null ? Number(animal.pesoInicial) : null;
    const pesoFinal =
      animal.pesoFinal != null ? Number(animal.pesoFinal) : null;

    let pesoNetoIni: number | null = null;
    let pesoNetoFin: number | null = null;
    let diferencia: number | null = null;
    let aumDiario: number | null = null;

    if (pesoInicial != null) pesoNetoIni = redondear(pesoInicial - desbasteIni);
    if (pesoFinal != null) pesoNetoFin = redondear(pesoFinal - desbasteFin);
    if (pesoNetoIni != null && pesoNetoFin != null) {
      diferencia = redondear(pesoNetoFin - pesoNetoIni);
    }
    if (diferencia != null && animal.fechaPesajeIni && animal.fechaPesajeFin) {
      const dias = this.diffDias(animal.fechaPesajeIni, animal.fechaPesajeFin);
      if (dias > 0) aumDiario = Math.round((diferencia / dias) * 10000) / 10000;
    }

    return { pesoNetoIni, pesoNetoFin, diferencia, aumDiario };
  }

  /** Convierte 'YYYY-MM-DD' a Date local (evita corrimientos por UTC). */
  private aDate(iso?: string): Date | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private diffDias(ini: Date, fin: Date): number {
    const a = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const b = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /** Recarga un animal con sus relaciones de catálogo (para responder). */
  private cargarAnimal(id: number): Promise<Animal> {
    return this.animalRepository.findOneOrFail({
      where: { id },
      relations: ["raza", "categoria", "pelaje"],
    });
  }

  /** Próximo N° de animal del lote (máximo actual + 1). */
  private async siguienteNAnimal(
    idLote: number,
    _excluirAnimalId?: number,
    em?: import("typeorm").EntityManager,
  ): Promise<number> {
    const repo = em ? em.getRepository(Animal) : this.animalRepository;
    const row = await repo
      .createQueryBuilder("a")
      .select("COALESCE(MAX(a.n_animal), 0)", "max")
      .where("a.id_lote = :lote", { lote: idLote })
      .getRawOne();
    return Number(row?.max ?? 0) + 1;
  }

  /** La caravana no puede repetirse dentro del lote (case-insensitive). */
  private async validarCaravanaLibre(
    idLote: number,
    caravana: string,
    animalIdActual?: number,
  ) {
    const qb = this.animalRepository
      .createQueryBuilder("a")
      .where("a.id_lote = :lote", { lote: idLote })
      .andWhere("LOWER(a.caravana) = LOWER(:c)", { c: caravana });
    if (animalIdActual) {
      qb.andWhere("a.id != :aid", { aid: animalIdActual });
    }
    const choque = await qb.getOne();
    if (choque) {
      throw new BadRequestException(
        `La caravana "${caravana}" ya existe en este lote`,
      );
    }
  }

  /**
   * Normaliza decimales de pg (vienen como string) a number y aplana las
   * relaciones de catálogo (raza/categoría/pelaje) a sus nombres. El `sexo`
   * se INFIERE de la categoría (ya no es columna del animal).
   */
  private animalJson(a: Animal): any {
    const { raza, categoria, pelaje, ...rest } = a as any;
    delete rest.lote;
    delete rest.corralEnfermeria;
    return {
      ...rest,
      sexo: categoria?.sexo ?? null,
      razaNombre: raza?.nombre ?? null,
      categoriaNombre: categoria?.nombre ?? null,
      categoriaSexo: categoria?.sexo ?? null,
      pelajeNombre: pelaje?.nombre ?? null,
      pesoInicial: a.pesoInicial != null ? Number(a.pesoInicial) : null,
      desbasteIni: Number(a.desbasteIni),
      pesoNetoIni: a.pesoNetoIni != null ? Number(a.pesoNetoIni) : null,
      pesoFinal: a.pesoFinal != null ? Number(a.pesoFinal) : null,
      desbasteFin: Number(a.desbasteFin),
      pesoNetoFin: a.pesoNetoFin != null ? Number(a.pesoNetoFin) : null,
      diferencia: a.diferencia != null ? Number(a.diferencia) : null,
      aumDiario: a.aumDiario != null ? Number(a.aumDiario) : null,
    };
  }
}
