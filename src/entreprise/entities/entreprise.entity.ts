import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { UtilisateurEntreprise } from 'src/UtilisateurEntreprise/entities/utilisateur-entreprise.entity';
import { Contrat } from 'src/contrat/entities/contrat.entity';

@Entity()
export class Entreprise {
  @PrimaryGeneratedColumn('uuid')
  idEntreprise: string;

  @Column({ nullable: false })
  nom: string;

  @Column({ nullable: false })
  domaine: string;

  @Column({ unique: true })
  email: string;

  @Column()
  adresse: string;

  @Column()
  nbre_employers: number;

  @CreateDateColumn({ type: 'timestamp' })
  dateCreation: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_at: Date;

  @DeleteDateColumn({ type: 'timestamp' })
  delete_at: Date | null;

  @OneToMany(() => UtilisateurEntreprise, (ue) => ue.entreprise)
  utilisateurs!: UtilisateurEntreprise[];
   @OneToMany(
    () => Contrat,
    (contrat) => contrat.entreprise,
  )
  contrats: Contrat[]

}
