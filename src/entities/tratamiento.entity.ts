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
import { Animal } from "./animal.entity";
import { AnimalMovimiento } from "./animal-movimiento.entity";
import { Insumo } from "./insumo.entity";
import { Lote } from "./lote.entity";

/**
 * UNA fila por aplicación masiva de tratamiento(s) al lote: el evento de
 * costo. Los `tratamiento_aplicado` con alcance='lote' cuelgan de su
 * cabecera; imputar costos = por cabecera, sin duplicar.
 */
@Entity("tratamiento_aplicado_lote")
export class TratamientoAplicadoLote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  @Column({ type: "date" })
  fecha: Date;

  @Column({ type: "time", default: "12:00:00" })
  hora: string;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  @OneToMany(() => TratamientoAplicado, (a) => a.aplicacionLote)
  aplicados: TratamientoAplicado[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/**
 * Catálogo de tratamientos veterinarios (sin categorías). `idEmpresa` NULL =
 * tratamiento GLOBAL; con valor = de esa empresa. Unicidad por alcance +
 * nombre (índice en la migración 020).
 */
@Entity("tratamiento")
export class Tratamiento {
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

  /** ON/OFF manual (con escritura:veterinaria). */
  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/**
 * Aplicación de un tratamiento a UN animal (`idAnimal` requerido).
 * `idMovimiento` opcional: presente cuando nace de un movimiento a/desde
 * enfermería; NULL en aplicaciones directas (historial) o masivas al lote.
 * `alcance` = 'animal' (individual) | 'lote' (masiva al lote).
 * `fecha`+`hora` = instante del tratamiento (orden cronológico del historial).
 */
@Entity("tratamiento_aplicado")
export class TratamientoAplicado {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_animal" })
  idAnimal: number;

  @ManyToOne(() => Animal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_animal" })
  animal: Animal;

  @Column({ name: "id_movimiento", type: "int", nullable: true })
  idMovimiento: number | null;

  @ManyToOne(() => AnimalMovimiento, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "id_movimiento" })
  movimiento: AnimalMovimiento;

  @Column({ name: "id_tratamiento" })
  idTratamiento: number;

  @ManyToOne(() => Tratamiento, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "id_tratamiento" })
  tratamiento: Tratamiento;

  /** Precio del tratamiento al aplicarlo (default: precio de referencia). */
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  precio: number | null;

  @Column({ type: "date" })
  fecha: Date;

  @Column({ type: "time", default: "12:00:00" })
  hora: string;

  /** 'animal' = individual (con o sin movimiento) | 'lote' = masiva al lote. */
  @Column({ type: "varchar", length: 10, default: "animal" })
  alcance: string;

  /**
   * Cabecera de la aplicación masiva (sólo alcance='lote'). NULL en
   * individuales. Imputar costos = por cabecera.
   */
  @Column({ name: "id_aplicacion_lote", type: "int", nullable: true })
  idAplicacionLote: number | null;

  @ManyToOne(() => TratamientoAplicadoLote, (c) => c.aplicados, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "id_aplicacion_lote" })
  aplicacionLote: TratamientoAplicadoLote;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  /**
   * Si el tratamiento ya fue liquidado. Las liquidaciones pueden ser
   * parciales (fila por fila), por eso la bandera va en el detalle.
   */
  @Column({ default: false })
  liquidada: boolean;

  @OneToMany(() => TratamientoAplicadoInsumo, (i) => i.aplicado)
  insumos: TratamientoAplicadoInsumo[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/** Insumo de un tratamiento aplicado (uno o más), con su precio aplicado. */
@Entity("tratamiento_aplicado_insumo")
export class TratamientoAplicadoInsumo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_tratamiento_aplicado" })
  idTratamientoAplicado: number;

  @ManyToOne(() => TratamientoAplicado, (a) => a.insumos, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "id_tratamiento_aplicado" })
  aplicado: TratamientoAplicado;

  @Column({ name: "id_insumo" })
  idInsumo: number;

  @ManyToOne(() => Insumo, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "id_insumo" })
  insumo: Insumo;

  /** Precio del insumo al aplicarlo (default: precio de referencia). */
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  precio: number | null;
}
