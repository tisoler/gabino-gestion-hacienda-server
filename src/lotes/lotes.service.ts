import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Lote } from "../entities/lote.entity";
import { Animal } from "../entities/animal.entity";
import { Corral } from "../entities/corral.entity";
import { Empresa } from "../entities/empresa.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Roles, PALETA_LOTE } from "src/constantes";
import { CreateLoteDto } from "./dto/create-lote.dto";
import { UpdateLoteDto } from "./dto/update-lote.dto";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { TraerEnfermeriaDto } from "./dto/traer-enfermeria.dto";
import { FirestoreCacheService } from "../cache/firestore-cache.service";
import { CatalogosService } from "../catalogos/catalogos.service";

export interface LoteResumen {
  id: number;
  idEmpresa: number;
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
      relations: ["raza", "categoria"],
      order: { nAnimal: "ASC", id: "ASC" },
    });
    const nombreCliente = await this.nombreDeCliente(lote.idCliente);
    const { corral, proveedor, lugarOrigen, ...base } = lote as any;
    return {
      ...base,
      nombreCliente,
      corralNombre: corral?.nombre ?? null,
      nombreProveedor: proveedor?.nombre ?? null,
      nombreLugarOrigen: lugarOrigen?.nombre ?? null,
      animales: animales.map((a) => this.animalJson(a)),
    };
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
      await this.validarCorralComunLibre(
        createLoteDto.idCorral,
        idEmpresa,
        undefined,
      );
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
        await this.validarCorralComunLibre(
          updateLoteDto.idCorral,
          lote.idEmpresa,
          lote.id,
        );
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
    const base = {
      idLote: lote.id,
      nAnimal: dto.nAnimal ?? null,
      sexo: dto.sexo ?? null,
      pelaje: dto.pelaje ?? null,
      idRaza: dto.idRaza ?? null,
      idCategoria: dto.idCategoria ?? null,
      fechaPesajeIni: this.aDate(dto.fechaPesajeIni),
      pesoInicial: dto.pesoInicial ?? null,
      desbasteIni: dto.desbasteIni ?? 0,
      fechaPesajeFin: this.aDate(dto.fechaPesajeFin),
      pesoFinal: dto.pesoFinal ?? null,
      desbasteFin: dto.desbasteFin ?? 0,
      observaciones: dto.observaciones ?? null,
      estado,
      idCorralEnfermeria: null,
    };
    const computed = this.computar(base as any);
    const animal = this.animalRepository.create({ ...base, ...computed });
    const saved = await this.animalRepository.save(animal);
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
    return this.animalJson(saved);
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
    if (dto.sexo !== undefined) animal.sexo = dto.sexo;
    if (dto.pelaje !== undefined) animal.pelaje = dto.pelaje;
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
    if (dto.fechaPesajeIni !== undefined) {
      animal.fechaPesajeIni = this.aDate(dto.fechaPesajeIni);
    }
    if (dto.pesoInicial !== undefined) animal.pesoInicial = dto.pesoInicial;
    if (dto.desbasteIni !== undefined) animal.desbasteIni = dto.desbasteIni;
    if (dto.fechaPesajeFin !== undefined) {
      animal.fechaPesajeFin = this.aDate(dto.fechaPesajeFin);
    }
    if (dto.pesoFinal !== undefined) animal.pesoFinal = dto.pesoFinal;
    if (dto.desbasteFin !== undefined) animal.desbasteFin = dto.desbasteFin;
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

    Object.assign(animal, this.computar(animal));
    const saved = await this.animalRepository.save(animal);

    if (estadoNuevo) {
      await this.registrarMovimiento({
        idAnimal: saved.id,
        idEmpresa: lote.idEmpresa,
        tipo: "cambio_estado",
        estadoAntes: estadoAnterior,
        estadoDespues: estadoNuevo,
        corralOrigen: await this.nombreCorralActual(animal, lote),
        motivo: motivoTexto,
        user,
      });
    }
    return this.animalJson(saved);
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
   * Valida que el lote pueda asignarse a `idCorral`: común, activo, de la
   * empresa, y libre (o ya ocupado por este mismo lote).
   */
  private async validarCorralComunLibre(
    idCorral: number,
    idEmpresa: number,
    loteIdActual?: number,
  ) {
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
    const ocupante = await this.loteRepository.findOne({
      where: { idCorral, activo: true },
    });
    if (ocupante && ocupante.id !== loteIdActual) {
      throw new BadRequestException(
        `El corral "${corral.nombre}" está ocupado por el lote "${ocupante.nombre}". Liberalo primero.`,
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

  /**
   * Normaliza decimales de pg (vienen como string) a number y aplana las
   * relaciones de catálogo (raza/categoría) a sus nombres.
   */
  private animalJson(a: Animal): any {
    const { raza, categoria, ...rest } = a as any;
    delete rest.lote;
    delete rest.corralEnfermeria;
    return {
      ...rest,
      razaNombre: raza?.nombre ?? null,
      categoriaNombre: categoria?.nombre ?? null,
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
