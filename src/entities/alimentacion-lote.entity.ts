import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Alimentacion } from "./alimentacion.entity";
import { Lote } from "./lote.entity";

/** Reparto de una alimentación a un lote (animales vivos contados + kg). */
@Entity("alimentacion_lote")
export class AlimentacionLote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_alimentacion" })
  idAlimentacion: number;

  @ManyToOne(() => Alimentacion, (a) => a.lotes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_alimentacion" })
  alimentacion: Alimentacion;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  /** Snapshot del titular del lote al momento de alimentar (filtro por cliente). */
  @Column({ name: "id_cliente", type: "varchar", length: 128, nullable: true })
  idCliente: string | null;

  @Column({ name: "n_animales", type: "int" })
  nAnimales: number;

  @Column({ name: "n_animales_enfermeria", type: "int", default: 0 })
  nAnimalesEnfermeria: number;

  @Column({ name: "cantidad_kg", type: "decimal", precision: 12, scale: 2 })
  cantidadKg: number;

  @Column({
    name: "cantidad_enfermeria_kg",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  cantidadEnfermeriaKg: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
