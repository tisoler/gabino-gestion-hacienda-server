import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Empresa } from "./empresa.entity";

/**
 * Corral de una empresa.
 *  - "comun": aloja UN lote activo (estado libre/ocupado derivado de `lote.id_corral`).
 *  - "enfermeria": sin estado de ocupación; recibe animales de varios lotes
 *    mediante `animal.id_corral_enfermeria`.
 */
@Entity("corral")
export class Corral {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column()
  nombre: string;

  /** 'comun' | 'enfermeria' */
  @Column({ type: "varchar", length: 20 })
  tipo: string;

  @Column({ type: "int", nullable: true })
  capacidad: number;

  @Column({ type: "text", nullable: true })
  descripcion: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ default: true })
  activo: boolean;
}
