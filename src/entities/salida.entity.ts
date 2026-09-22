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
import { Corral } from "./corral.entity";
import { Partida } from "./partida.entity";
import { SalidaAnimal } from "./salida-animal.entity";

/**
 * Evento de salida de animales de un lote (total o parcial). El grupo que sale
 * tiene pesaje final (se crea si falta) y sus animales pasan a estado 'salido'.
 * `diferenciaKg` = suma de (peso final − peso inicial) del grupo, en BRUTOS.
 */
@Entity("salida")
export class Salida {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote)
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  /**
   * Snapshot del corral del lote AL MOMENTO de la salida. `lote.id_corral` puede
   * pasar a NULL (o cambiar) después; este valor no debe recalcularse.
   */
  @Column({ name: "id_corral", type: "int", nullable: true })
  idCorral: number | null;

  @ManyToOne(() => Corral, { nullable: true })
  @JoinColumn({ name: "id_corral" })
  corral: Corral | null;

  @Column({ name: "id_partida", type: "int", nullable: true })
  idPartida: number | null;

  @ManyToOne(() => Partida, { nullable: true })
  @JoinColumn({ name: "id_partida" })
  partida: Partida;

  @Column({ type: "date" })
  fecha: Date;

  /** Instante de la salida (default 12:00). Junto a `fecha` forma el corte. */
  @Column({ type: "time", default: "12:00:00" })
  hora: string;

  /** 'lote' | 'partida' | 'animales'. */
  @Column({ type: "varchar", length: 12 })
  tipo: string;

  @Column({ name: "n_animales", type: "int" })
  nAnimales: number;

  @Column({
    name: "peso_inicial_total",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  pesoInicialTotal: number;

  @Column({
    name: "peso_final_total",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  pesoFinalTotal: number;

  @Column({
    name: "diferencia_kg",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  diferenciaKg: number;

  @Column({ name: "id_usuario", type: "varchar", length: 128, nullable: true })
  idUsuario: string | null;

  @OneToMany(() => SalidaAnimal, (sa) => sa.salida)
  animales: SalidaAnimal[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
