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
import { Corral } from "./corral.entity";
import { Dieta, DietaVersion } from "./dieta.entity";
import { AlimentacionLote } from "./alimentacion-lote.entity";

/**
 * Evento de alimentación de un corral: se prepara `cantidadKg` de una dieta
 * (versión vigente) en una `fecha` y se reparte entre los lotes del corral en
 * proporción a sus animales VIVOS (los de enfermería cuentan como del lote).
 */
@Entity("alimentacion")
export class Alimentacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ name: "id_corral" })
  idCorral: number;

  @ManyToOne(() => Corral)
  @JoinColumn({ name: "id_corral" })
  corral: Corral;

  @Column({ name: "id_dieta" })
  idDieta: number;

  @ManyToOne(() => Dieta)
  @JoinColumn({ name: "id_dieta" })
  dieta: Dieta;

  @Column({ name: "id_dieta_version" })
  idDietaVersion: number;

  @ManyToOne(() => DietaVersion)
  @JoinColumn({ name: "id_dieta_version" })
  dietaVersion: DietaVersion;

  @Column({ type: "date" })
  fecha: Date;

  /** Instante de la alimentación (default 12:00). Junto a `fecha` forma T. */
  @Column({ type: "time", default: "12:00:00" })
  hora: string;

  @Column({ name: "cantidad_kg", type: "decimal", precision: 12, scale: 2 })
  cantidadKg: number;

  /** Lo ingresado para el corral (sus animales presentes). */
  @Column({
    name: "cantidad_corral_kg",
    type: "decimal",
    precision: 12,
    scale: 2,
  })
  cantidadCorralKg: number;

  /** Estimación para los animales del lote que están en enfermería. */
  @Column({
    name: "cantidad_enfermeria_kg",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  cantidadEnfermeriaKg: number;

  @Column({
    name: "cantidad_por_animal",
    type: "decimal",
    precision: 12,
    scale: 4,
  })
  cantidadPorAnimal: number;

  @Column({ name: "n_animales", type: "int" })
  nAnimales: number;

  @Column({ name: "n_animales_enfermeria", type: "int", default: 0 })
  nAnimalesEnfermeria: number;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  @OneToMany(() => AlimentacionLote, (l) => l.alimentacion)
  lotes: AlimentacionLote[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
