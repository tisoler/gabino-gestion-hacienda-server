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
import { Ingrediente } from "./catalogo.entity";

/**
 * Dieta (lógica) de una empresa, identificada por `nombre`. `idEmpresa` NULL =
 * dieta GLOBAL (visible/usable por todas las empresas, como los catálogos
 * globales). `activa` es el ON/OFF de la dieta ENTERA (la controla el usuario
 * con escritura:dieta). Cada vez que se carga una nueva composición se crea una
 * `DietaVersion`; la vigente es siempre la última (`DietaVersion.activa`), las
 * anteriores quedan inactivas como histórico (permite el futuro histórico de
 * alimentación de corrales). Una dieta no se edita: se versiona.
 */
@Entity("dieta")
export class Dieta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa", type: "int", nullable: true })
  idEmpresa: number | null;

  @ManyToOne(() => Empresa, { nullable: true })
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column()
  nombre: string;

  /** ON/OFF de la dieta entera (manual). */
  @Column({ default: true })
  activa: boolean;

  @OneToMany(() => DietaVersion, (v) => v.dieta)
  versiones: DietaVersion[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/** Una composición (versión) de una dieta. La vigente tiene `activa = true`. */
@Entity("dieta_version")
export class DietaVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_dieta" })
  idDieta: number;

  @ManyToOne(() => Dieta, (d) => d.versiones, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_dieta" })
  dieta: Dieta;

  @Column({ type: "int" })
  version: number;

  /** Versión vigente (la más nueva). Las anteriores quedan false (histórico). */
  @Column({ default: true })
  activa: boolean;

  @OneToMany(() => DietaVersionIngrediente, (i) => i.version)
  ingredientes: DietaVersionIngrediente[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

/** Ingrediente + proporción (%) de una versión de dieta. Suma = 100. */
@Entity("dieta_version_ingrediente")
export class DietaVersionIngrediente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_dieta_version" })
  idDietaVersion: number;

  @ManyToOne(() => DietaVersion, (v) => v.ingredientes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_dieta_version" })
  version: DietaVersion;

  @Column({ name: "id_ingrediente" })
  idIngrediente: number;

  @ManyToOne(() => Ingrediente)
  @JoinColumn({ name: "id_ingrediente" })
  ingrediente: Ingrediente;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  porcentaje: number;
}
