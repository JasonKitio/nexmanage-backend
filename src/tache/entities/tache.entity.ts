import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Priorite, StatutTache } from 'src/utils/enums/enums';
import { Entreprise } from 'src/entreprise/entities/entreprise.entity';

@Entity()
export class tache {
  @PrimaryGeneratedColumn('uuid')
  idTache: string;

  @Column({ nullable: true })
  titre: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  TimeEstimated: number;

  @Column({
    type: 'enum',
    enum: Priorite,
    default: Priorite.MOYENNE,
  })
  priorite: Priorite;

  @Column({ type: 'enum', enum: StatutTache })
  type?: StatutTache;

  @CreateDateColumn({ type: 'timestamp' })
  dateCreation: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_at: Date;

  @DeleteDateColumn({ type: 'timestamp' })
  delete_at: Date | null;

    @ManyToOne(
    () => Entreprise,
    (entreprise) => entreprise.taches,
    {
      nullable: true,
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "entrepriseId" })
  entreprise: Entreprise
}
