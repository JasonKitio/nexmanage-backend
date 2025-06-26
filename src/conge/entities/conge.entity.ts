import { Entreprise } from 'src/entreprise/entities/entreprise.entity';
import { Utilisateur } from 'src/User/entities/utilisateur.entity';
import { StatutConge } from 'src/utils/enums/enums';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from 'typeorm';

@Entity()
export class Conge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  motif: string;

  @Column({ type: 'text', nullable: true })
  motifRefus?: string;

  @Column({
    type: 'enum',
    enum: StatutConge,
    default: StatutConge.EN_ATTENTE,
  })
  statut: StatutConge;

  @Column({ type: 'timestamp' })
  dateDebut: Date;

  @Column({ type: 'timestamp' })
  dateFin: Date;

  @Column({ type: 'integer', nullable: true })
  dureeJours: number;

  @ManyToOne(() => Utilisateur, (utilisateur) => utilisateur.conges, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  utilisateur: Utilisateur;

   @ManyToOne(
    () => Entreprise,
    (entreprise) => entreprise.conges,
    {
      nullable: true,
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "entrepriseId" })
  entreprise: Entreprise

  @Column({nullable:true})
  entrepriseId: string

  @CreateDateColumn({ type: 'timestamp' })
  dateCreation: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_at: Date;

  @DeleteDateColumn({ type: 'timestamp' })
  delete_at: Date | null;
}
