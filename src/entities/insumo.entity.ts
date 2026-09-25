import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Empresa } from "./empresa.entity";

/**
 * Categoría de insumo (p.ej. "Fertilizante", "Semilla"). `idEmpresa` NULL =
 * categoría GLOBAL (visible para todas las empresas); con valor = creada
 * por/para esa empresa. Se crean inline desde el modal de insumo: si el
 * nombre tipeado no existe, el server la crea con el alcance del insumo
 * (mismo mecanismo que los insumos nuevos al guardar una dieta).
 */
@Entity("categoria_insumo")
export class CategoriaInsumo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa", type: "int", nullable: true })
  idEmpresa: number | null;

  @ManyToOne(() => Empresa, { nullable: true })
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ type: "varchar", length: 100 })
  nombre: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  descripcion: string | null;

  /** ON/OFF manual (con escritura:insumo). */
  @Column({ default: true })
  activa: boolean;

  @OneToMany(() => Insumo, (i) => i.categoria)
  insumos: Insumo[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/**
 * Insumo: nombre, descripción opcional, precio de referencia (número, sin
 * moneda), unidad ('kg' | 'unidad') y alcance (`idEmpresa` NULL = GLOBAL).
 * `activo` es el ON/OFF manual (con escritura:insumo).
 */
@Entity("insumo")
export class Insumo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 100 })
  nombre: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  descripcion: string | null;

  @Column({ name: "id_categoria", type: "int", nullable: true })
  idCategoria: number | null;

  @ManyToOne(() => CategoriaInsumo, (c) => c.insumos, { nullable: true })
  @JoinColumn({ name: "id_categoria" })
  categoria: CategoriaInsumo;

  @Column({ name: "id_empresa", type: "int", nullable: true })
  idEmpresa: number | null;

  @ManyToOne(() => Empresa, { nullable: true })
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({
    name: "precio_referencia",
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  precioReferencia: number | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  unidad: string | null;

  /** ON/OFF manual (con escritura:insumo). */
  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
