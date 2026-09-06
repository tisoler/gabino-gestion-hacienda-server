import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Animal } from "./animal.entity";
import { Motivo } from "./catalogo.entity";

/**
 * Movimiento sanitario del animal (historial). Se registra al enviar a
 * enfermería, al traer de enfermería y al cambiar el estado de salud.
 *  - tipo: 'a_enfermeria' | 'de_enfermeria' | 'cambio_estado'
 *  - `corralOrigen`/`corralDestino`: snapshot del nombre del corral al momento
 *    del movimiento (el historial no se deforma si el corral se renombra).
 *  - `motivo`: snapshot del texto + `idMotivo` al catálogo (global o de la
 *    empresa) para el autocomplete.
 */
@Entity("animal_movimiento")
export class AnimalMovimiento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_animal" })
  idAnimal: number;

  @ManyToOne(() => Animal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_animal" })
  animal: Animal;

  @Column({ type: "varchar", length: 30 })
  tipo: string;

  @Column({ name: "estado_antes", type: "varchar", length: 10, nullable: true })
  estadoAntes: string | null;

  @Column({
    name: "estado_despues",
    type: "varchar",
    length: 10,
    nullable: true,
  })
  estadoDespues: string | null;

  @Column({
    name: "corral_origen",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  corralOrigen: string | null;

  @Column({
    name: "corral_destino",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  corralDestino: string | null;

  @Column({ name: "id_motivo", type: "int", nullable: true })
  idMotivo: number | null;

  @ManyToOne(() => Motivo, { nullable: true })
  @JoinColumn({ name: "id_motivo" })
  motivoRef: Motivo;

  @Column({ type: "varchar", length: 150, nullable: true })
  motivo: string | null;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
