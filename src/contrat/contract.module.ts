import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

// Entities
import { Contrat } from './entities/contrat.entity';
import { Presence } from '../presence/entities/presence.entity';
import { tache } from '../tache/entities/tache.entity';
import { Utilisateur } from '../User/entities/utilisateur.entity';
import { Commentaire } from 'src/commentaires/entities/commentaire.entity';
import { UtilisateurEntreprise } from '../UtilisateurEntreprise/entities/utilisateur-entreprise.entity';
import { Entreprise } from '../entreprise/entities/entreprise.entity';

// Services
import { ContractService } from './contract.service';
import { TwilioService } from '../twillio/twillio.service';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationService } from './configugation.service';

// Controllers
import { ContractController } from './contract.controller';

import { TwilioModule } from 'src/twillio/twillio.module';

@Module({
  imports: [
    // Configuration pour les tâches programmées (cron jobs)
    ScheduleModule.forRoot(),
    
    // TypeORM pour les entités
    TypeOrmModule.forFeature([
      Contrat,
      Presence,
      tache,
      Utilisateur,
      Commentaire,
      Entreprise,UtilisateurEntreprise
      
    ]),TwilioModule,AuthModule
  ],
  controllers: [ContractController],
  providers: [
    ContractService,
    TwilioService,
    NotificationService
  ],
  exports: [
    ContractService,
   
  ],
})
export class ContractModule {}
