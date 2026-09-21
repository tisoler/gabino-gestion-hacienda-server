import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Lote } from "./lote.entity";
import { Corral } from "./corral.entity";

/**
 * Intervalo de validez de la asignación de un lote a un corral común
 * (historial interno para reconstruir qué lotes estaban en un corral en un
 * instante dado). `hasta = NULL` → vigente. No es editable por el usuario.
 */
@Entity("lote_corral_asignacion")
export class LoteCorralAsignacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  @Column({ name: "id_corral" })
  idCorral: number;

  @ManyToOne(() => Corral, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_corral" })
  corral: Corral;

  @Column({ type: "timestamp" })
  desde: Date;

  @Column({ type: "timestamp", nullable: true })
  hasta: Date | null;
}
