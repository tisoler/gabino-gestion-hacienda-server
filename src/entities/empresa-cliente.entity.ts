import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Empresa } from "./empresa.entity";

/**
 * Relación empresa ↔ cliente (muchos a muchos).
 *
 * La fuente de verdad de la relación es esta tabla; en Firestore el cliente
 * lleva un espejo denormalizado (`idEmpresas` en `usuarios/{uid}`) para que
 * la auth resuelva sus empresas sin pegarle a la BD por request.
 *
 * `idCliente` es el UID de Firebase del usuario. No hay FK a usuarios:
 * la identidad vive en Firestore (misma filosofía que el proyecto base).
 */
@Entity("empresa_cliente")
@Unique("uq_empresa_cliente", ["idEmpresa", "idCliente"])
export class EmpresaCliente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "id_empresa" })
  idEmpresa: number;

  @ManyToOne(() => Empresa, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id_empresa" })
  empresa: Empresa;

  @Column({ name: "id_cliente", type: "varchar", length: 128 })
  idCliente: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
