import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Empresa } from "./empresa.entity";
import { Animal } from "./animal.entity";
import { Corral } from "./corral.entity";
import { LugarOrigen, Proveedor } from "./catalogo.entity";

/**
 * Lote (partida de animales) hospedado por una empresa. `idCliente` es el UID
 * de Firebase del dueño de la partida (opcional): puede ser un CLIENTE
 * vinculado o el ANFITRIÓN de la empresa (animales propios). No hay FK: la
 * identidad vive en Firestore. `idCorral` es el corral COMÚN donde está la
 * partida; el estado libre/ocupado del corral se deriva de esta columna.
 * `color` se usa para el mapa de corrales (se auto-asigna de la paleta al
 * crear si no viene). `idProveedor`/`idLugarOrigen` vienen de los catálogos
 * (globales o de la empresa).
 */
@Entity("lote")
export class Lote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ name: "id_corral", type: "int", nullable: true })
  idCorral: number | null;

  @ManyToOne(() => Corral, { nullable: true })
  @JoinColumn({ name: "id_corral" })
  corral: Corral;

  @Column({ type: "varchar", length: 9, nullable: true })
  color: string | null;

  @Column({ name: "id_cliente", type: "varchar", length: 128, nullable: true })
  idCliente: string | null;

  @Column({ name: "id_proveedor", type: "int", nullable: true })
  idProveedor: number | null;

  @ManyToOne(() => Proveedor, { nullable: true })
  @JoinColumn({ name: "id_proveedor" })
  proveedor: Proveedor;

  @Column({ name: "id_lugar_origen", type: "int", nullable: true })
  idLugarOrigen: number | null;

  @ManyToOne(() => LugarOrigen, { nullable: true })
  @JoinColumn({ name: "id_lugar_origen" })
  lugarOrigen: LugarOrigen;

  @Column()
  nombre: string;

  @Column({ type: "text", nullable: true })
  descripcion: string;

  @Column({ type: "date", nullable: true })
  fecha: Date | null;

  @OneToMany(() => Animal, (animal) => animal.lote)
  animales: Animal[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ default: true })
  activo: boolean;
}
