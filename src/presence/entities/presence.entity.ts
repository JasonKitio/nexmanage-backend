import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Contrat } from '../../contrat/entities/contrat.entity';
import { Utilisateur } from '../../User/entities/utilisateur.entity';
import { Point } from 'src/utils/types/type';

@Entity()
export class Presence {
  @PrimaryGeneratedColumn('uuid')
  idPresence: string;

  @ManyToOne(() => Utilisateur)
  @JoinColumn({ name: 'utilisateurId' })
  utilisateur: Utilisateur;

  @ManyToOne(() => Contrat, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contratId' })
  contrat: Contrat;

  @Column({ type: 'timestamptz', nullable: true })
  heureArrivee: Date;

  @Column({ type: 'timestamptz', nullable: true })
  heureDepart: Date;

  //position de pointage arrivee
  @Column('geometry', {
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  localisationArrivee: Point;

  //position de pointage depart
  @Column('geometry', {
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  localisationDepart: Point;

  @Column({ nullable: true })
  notes: string;
}
