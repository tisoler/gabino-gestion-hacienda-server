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
import { Lote } from "./lote.entity";

/**
 * Cabecera de una liquidación de un lote ("lote de ítems pagados"): fecha +
 * total (calculado por el server al guardar). Las líneas con precios
 * congelados van en `liquidacion_item`. El balance usa esas líneas cuando el
 * ítem está liquidado y referencias vivas cuando no.
 */
@Entity("liquidacion")
export class Liquidacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  @Column({ type: "date" })
  fecha: Date;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  @OneToMany(() => LiquidacionItem, (i) => i.liquidacion)
  items: LiquidacionItem[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/**
 * Línea de precio CONGELADO al liquidar (una por precio editable):
 * - alimentación: 1 línea (`concepto='evento'`, cantidad=kg, precio=$/kg).
 * - tratamiento aplicado: 1 línea base (`concepto='tratamiento'`) + N líneas
 *   de insumos (`concepto='insumo'`).
 * - costo vario: 1 línea (`concepto='costo'`, costo=monto).
 * `idReferencia` = id del evento (alimentacion / tratamiento_aplicado /
 * costo_aplicado), sin FK (los liquidados son inmutables y no se borran).
 */
@Entity("liquidacion_item")
export class LiquidacionItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_liquidacion" })
  idLiquidacion: number;

  @ManyToOne(() => Liquidacion, (l) => l.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_liquidacion" })
  liquidacion: Liquidacion;

  /** 'alimentacion' | 'tratamiento' | 'costo'. */
  @Column({ type: "varchar", length: 20 })
  tipo: string;

  @Column({ name: "id_referencia", type: "int" })
  idReferencia: number;

  /** 'evento' | 'tratamiento' | 'insumo' | 'costo'. */
  @Column({ type: "varchar", length: 20 })
  concepto: string;

  @Column({ type: "varchar", length: 255 })
  etiqueta: string;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  cantidad: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  precio: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  costo: number;
}
