import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntrepriseService } from './entreprise.service';
import { EntrepriseController } from './entreprise.controller';
import { Entreprise } from './entities/entreprise.entity';
import { Utilisateur } from '../User/entities/utilisateur.entity';
import { UtilisateurEntreprise } from '../UtilisateurEntreprise/entities/utilisateur-entreprise.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Entreprise, Utilisateur, UtilisateurEntreprise]),
  ],
  controllers: [EntrepriseController],
  providers: [EntrepriseService],
  exports: [EntrepriseService],
})
export class EntrepriseModule {}
