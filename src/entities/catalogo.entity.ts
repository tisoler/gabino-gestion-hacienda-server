import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Empresa } from "./empresa.entity";

/**
 * Base de los catálogos multitenant (raza, categoría, proveedor, lugar de
 * origen, motivo). `idEmpresa` NULL = valor GLOBAL (visible para todas las
 * empresas, p.ej. las razas por defecto); con valor = valor agregado por/para
 * esa empresa. La unicidad por (empresa, nombre lowercase) la garantiza un
 * índice único expresivo en la BD (ver migración 004).
 */
export abstract class CatalogoBase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa", type: "int", nullable: true })
  idEmpresa: number | null;

  @ManyToOne(() => Empresa, { nullable: true })
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ type: "varchar", length: 150 })
  nombre: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/** Raza de animal (globales: Braford, Brangus, Hereford, Aberdeen-Angus, Cruza europea). */
@Entity("raza")
export class Raza extends CatalogoBase {}

/** Categoría de animal (globales: Ternero/a, Novillo/Vaquillona, Toro/Vaca, MEJ). */
@Entity("categoria")
export class Categoria extends CatalogoBase {}

/** Proveedor del que se adquiere un lote. */
@Entity("proveedor")
export class Proveedor extends CatalogoBase {}

/** Lugar de origen del lote (un proveedor puede tener varios). */
@Entity("lugar_origen")
export class LugarOrigen extends CatalogoBase {}

/** Motivo/causa sanitaria de un movimiento o cambio de estado del animal. */
@Entity("motivo")
export class Motivo extends CatalogoBase {}
