import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
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
export class Raza extends CatalogoBase {
  /** Pelajes comunes de esta raza (lado inverso; dueño: `Pelaje.razas`). */
  @ManyToMany(() => Pelaje, (pelaje) => pelaje.razas)
  pelajes: Pelaje[];
}

/**
 * Categoría de animal (globales: Ternero/a, Novillo/Vaquillona, Toro/Vaca, MEJ).
 * `sexo` ('MACHO' | 'HEMBRA' | null=indistinto): al elegir una categoría en el
 * alta/edición del animal, la UI muestra el sexo inferido.
 */
@Entity("categoria")
export class Categoria extends CatalogoBase {
  @Column({ type: "varchar", length: 10, nullable: true })
  sexo: string | null;
}

/** Proveedor del que se adquiere un lote. */
@Entity("proveedor")
export class Proveedor extends CatalogoBase {}

/** Lugar de origen del lote (un proveedor puede tener varios). */
@Entity("lugar_origen")
export class LugarOrigen extends CatalogoBase {}

/**
 * Pelaje (capa) del animal. Catálogo multitenant: puede ser genérico (sin
 * raza) o estar asociado a 1 o N razas vía `raza_pelaje` (relación inversa en
 * `Raza.pelajes`).
 */
@Entity("pelaje")
export class Pelaje extends CatalogoBase {
  @ManyToMany(() => Raza, (raza) => raza.pelajes, { onDelete: "CASCADE" })
  @JoinTable({
    name: "raza_pelaje",
    joinColumn: { name: "id_pelaje", referencedColumnName: "id" },
    inverseJoinColumn: { name: "id_raza", referencedColumnName: "id" },
  })
  razas: Raza[];
}

/** Motivo/causa sanitaria de un movimiento o cambio de estado del animal. */
@Entity("motivo")
export class Motivo extends CatalogoBase {}
