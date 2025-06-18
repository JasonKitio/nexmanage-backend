import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

// Entities
import { Contrat } from './entities/contrat.entity';
import { Presence } from '../presence/entities/presence.entity';
import { tache } from '../tache/entities/tache.entity';
import { Utilisateur } from '../User/entities/utilisateur.entity';

// Services
import { ContractService } from './contract.service';
import { TwilioService } from '../twillio/twillio.service';

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
      Utilisateur
      
    ]),TwilioModule
  ],
  controllers: [ContractController],
  providers: [
    ContractService,
    TwilioService,
  ],
  exports: [
    ContractService,
   
  ],
})
export class ContractModule {}
