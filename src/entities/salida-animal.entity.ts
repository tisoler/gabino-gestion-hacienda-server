import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Salida } from "./salida.entity";
import { Animal } from "./animal.entity";

/**
 * Animal de una salida, con SNAPSHOT de pesos al momento del egreso (no se
 * deforma si luego se editan los pesajes del lote).
 */
@Entity("salida_animal")
export class SalidaAnimal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_salida" })
  idSalida: number;

  @ManyToOne(() => Salida, (s) => s.animales)
  @JoinColumn({ name: "id_salida" })
  salida: Salida;

  @Column({ name: "id_animal" })
  idAnimal: number;

  @ManyToOne(() => Animal)
  @JoinColumn({ name: "id_animal" })
  animal: Animal;

  @Column({
    name: "peso_inicial",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pesoInicial: number | null;

  @Column({ name: "peso_final", type: "decimal", precision: 10, scale: 2 })
  pesoFinal: number;

  @Column({
    name: "diferencia_kg",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  diferenciaKg: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
