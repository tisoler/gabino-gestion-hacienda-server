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
import { Lote } from "./lote.entity";

/**
 * Catálogo de costos varios (sin categorías). `idEmpresa` NULL = costo
 * GLOBAL; con valor = de esa empresa. Unicidad por alcance + nombre
 * (índice en la migración 024). Se imputan a lotes vía `costo_aplicado`
 * (cargados en el balance como pendientes o inline al liquidar).
 */
@Entity("costo")
export class Costo {
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

  @Column({
    name: "precio_referencia",
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  precioReferencia: number | null;

  /** ON/OFF manual (con escritura:costo). */
  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/**
 * Costo vario imputado a UN lote: fecha + descripción + monto. `liquidada`
 * indica si ya entró en una liquidación (al liquidarse se congela su monto
 * en `liquidacion_item`). Los creados inline al generar una liquidación nacen
 * liquidados.
 */
@Entity("costo_aplicado")
export class CostoAplicado {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_costo" })
  idCosto: number;

  @ManyToOne(() => Costo, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "id_costo" })
  costo: Costo;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_empresa" })
  empresaRel: Empresa;

  @Column({ type: "date" })
  fecha: Date;

  @Column({ type: "varchar", length: 255 })
  descripcion: string;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  monto: number;

  @Column({ default: false })
  liquidada: boolean;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
