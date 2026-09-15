import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Lote } from "./lote.entity";

/**
 * Partida: tanda de animales ingresados juntos dentro de un lote. Agrupa los
 * pesajes INICIALES (cada partida tiene su fecha de carga y su peso inicial).
 * Los pesajes intermedios/finales son del lote completo. Si un lote tiene una
 * sola partida, la UI no muestra la división. El nombre ("Partida N") se
 * DERIVA ordenando por fecha/id dentro del lote.
 */
@Entity("partida")
export class Partida {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  /** Fecha de carga (DATE, sin hora). */
  @Column({ type: "date" })
  fecha: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
