import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Utilisateur } from '../../User/entities/utilisateur.entity';
import { Entreprise } from 'src/entreprise/entities/entreprise.entity';

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  contenu: string;

  @CreateDateColumn()
  dateEnvoi: Date;

  @Column({ default: false })
  lu: boolean;

  @ManyToOne(() => Utilisateur)
  @JoinColumn({ name: 'expediteurId' })
  expediteur: Utilisateur;

  @Column()
  expediteurId: string;

  @ManyToOne(() => Utilisateur)
  @JoinColumn({ name: 'destinataireId' })
  destinataire: Utilisateur;

  @Column()
  destinataireId: string;
   @ManyToOne(
    () => Entreprise,
    (entreprise) => entreprise.messages,
    {
      nullable: true,
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "entrepriseId" })
  entreprise: Entreprise

  @Column({nullable:true})
  entrepriseId: string
}