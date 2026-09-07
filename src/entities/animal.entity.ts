import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Lote } from "./lote.entity";
import { Corral } from "./corral.entity";
import { Categoria, Pelaje, Raza } from "./catalogo.entity";

/**
 * Animal (cabeza de ganado) dentro de un lote. Campos según la planilla
 * LOTE LEO VULICH.xlsx, hoja PESAJE ING-EGR (fila 5). Los valores netos,
 * diferencia y aumento diario se calculan server-side.
 *
 * `caravana` es la tara del animal (requerida en la app, única por lote). El
 * **sexo ya no es columna**: se infiere de la categoría (`idCategoria` →
 * `categoria.sexo`). `idPelaje`/`idRaza`/`idCategoria` apuntan a los catálogos
 * (globales o de la empresa).
 *
 * Ubicación derivada: si `idCorralEnfermeria` está seteado, el animal está en
 * ese corral de enfermería; si es null, sigue el corral de su lote
 * (`lote.id_corral`). `estado`: 'sano' | 'enfermo' | 'muerto'.
 */
@Entity("animal")
export class Animal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_lote" })
  idLote: number;

  @ManyToOne(() => Lote, (lote) => lote.animales)
  @JoinColumn({ name: "id_lote" })
  lote: Lote;

  @Column({ name: "id_corral_enfermeria", type: "int", nullable: true })
  idCorralEnfermeria: number | null;

  @ManyToOne(() => Corral, { nullable: true })
  @JoinColumn({ name: "id_corral_enfermeria" })
  corralEnfermeria: Corral;

  @Column({ type: "varchar", length: 10, default: "sano" })
  estado: string;

  @Column({ name: "n_animal", type: "int", nullable: true })
  nAnimal: number;

  /** Caravana (tara) del animal. Requerida en la app (DTO); nullable en BD
   *  para no romper filas históricas. Única por lote. */
  @Column({ type: "varchar", length: 50, nullable: true })
  caravana: string | null;

  @Column({ name: "id_pelaje", type: "int", nullable: true })
  idPelaje: number | null;

  @ManyToOne(() => Pelaje, { nullable: true })
  @JoinColumn({ name: "id_pelaje" })
  pelaje: Pelaje;

  @Column({ name: "id_raza", type: "int", nullable: true })
  idRaza: number | null;

  @ManyToOne(() => Raza, { nullable: true })
  @JoinColumn({ name: "id_raza" })
  raza: Raza;

  @Column({ name: "id_categoria", type: "int", nullable: true })
  idCategoria: number | null;

  @ManyToOne(() => Categoria, { nullable: true })
  @JoinColumn({ name: "id_categoria" })
  categoria: Categoria;

  @Column({ name: "fecha_pesaje_ini", type: "date", nullable: true })
  fechaPesajeIni: Date | null;

  @Column({
    name: "peso_inicial",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pesoInicial: number;

  @Column({
    name: "desbaste_ini",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  desbasteIni: number;

  @Column({
    name: "peso_neto_ini",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pesoNetoIni: number;

  @Column({ name: "fecha_pesaje_fin", type: "date", nullable: true })
  fechaPesajeFin: Date | null;

  @Column({
    name: "peso_final",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pesoFinal: number;

  @Column({
    name: "desbaste_fin",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  desbasteFin: number;

  @Column({
    name: "peso_neto_fin",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pesoNetoFin: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  diferencia: number;

  @Column({
    name: "aum_diario",
    type: "decimal",
    precision: 10,
    scale: 4,
    nullable: true,
  })
  aumDiario: number;

  @Column({ type: "text", nullable: true })
  observaciones: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
