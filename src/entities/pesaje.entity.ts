import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Animal } from "./animal.entity";

/**
 * Pesaje de un animal en una fecha: la FUENTE DE VERDAD de los pesos.
 *  - tipo: 'inicial' (base) | 'intermedio' (N por animal) | 'final' (egreso).
 *  - `peso` es SIEMPRE por animal (aunque la UI cargue un total del lote, el
 *    server lo reparte). El total del lote se deriva sumando por fecha.
 *  - `desbaste` opcional; `peso_neto` = peso - desbaste (denormalizado).
 */
@Entity("pesaje")
export class Pesaje {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_animal" })
  idAnimal: number;

  @ManyToOne(() => Animal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_animal" })
  animal: Animal;

  @Column({ type: "date" })
  fecha: Date;

  /** 'inicial' | 'intermedio' | 'final' */
  @Column({ type: "varchar", length: 12, default: "intermedio" })
  tipo: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  peso: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  desbaste: number;

  @Column({
    name: "peso_neto",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pesoNeto: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
