import { Contrat } from 'src/contrat/entities/contrat.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Commentaire {
  @PrimaryGeneratedColumn('uuid')
  idComment: string;

  @Column({ type: 'text', nullable: false })
  message: string;

  @ManyToOne(() => Contrat, (contrat) => contrat.comment, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  contrat: Contrat;

  @CreateDateColumn({ type: 'timestamp' })
  dateCreation: Date;

   @Column({ nullable: true })
  fichierJoint: string;
}
