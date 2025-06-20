import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Utilisateur } from '../../User/entities/utilisateur.entity';
import { tache } from '../../tache/entities/tache.entity';
import { Point } from 'src/utils/types/type';
import { Presence } from 'src/presence/entities/presence.entity';
import { Commentaire } from 'src/commentaires/entities/commentaire.entity';

@Entity()
export class Contrat {
  @PrimaryGeneratedColumn('uuid')
  idContrat: string;

  @Column('geometry', {
    spatialFeatureType: 'Point',
    srid: 4326, // Système de coordonnées WGS 84 (standard GPS)
  })
  lieu: Point;

  @Column({ type: 'timestamp' })
  dateDebut: Date;

  @Column({ type: 'timestamp' })
  dateFin: Date;

  @Column({ nullable: true })
  description: string;

  // la duree de la pause d'un contract en minutes.
  @Column({ nullable: true })
  pause: number;

  @Column({ default: false })
  estGabarit: boolean;

  @Column({ nullable: true })
  nomGabarit: string;

  // Nombre de jours répétition
  @Column({ nullable: true })
  nombreJoursRepetition: number;

  @CreateDateColumn({ type: 'timestamp' })
  dateCreation: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_at: Date;

  @DeleteDateColumn({ type: 'timestamp' })
  delete_at: Date | null;

  @ManyToMany(() => tache, { cascade: ['insert', 'update'] })
  @JoinTable()
  taches: tache[];

  @ManyToMany(() => Utilisateur, {
    nullable: true,
    cascade: ['insert', 'update'],
  })
@JoinTable()
  utilisateur: Utilisateur[];

  @OneToMany(() => Presence, (presence) => presence.contrat)
  presence: Presence[];

  @OneToMany(() => Commentaire, (comment) => comment.contrat)
  comment: Commentaire[];
    contract: { type: "Point"; coordinates: [number, number]; };
}
