import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CongeService } from './conge.service';
import { CongeController } from './conge.controller';
import { Conge } from './entities/conge.entity';
import { Utilisateur } from 'src/User/entities/utilisateur.entity';
import { UtilisateurEntreprise } from 'src/UtilisateurEntreprise/entities/utilisateur-entreprise.entity';
import { NotificationService } from './notification.service';
import { MessageModule } from 'src/message/message.module';
import { AuthModule } from 'src/auth/auth.module';
import { Entreprise } from 'src/entreprise/entities/entreprise.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conge, Utilisateur, UtilisateurEntreprise,Entreprise]),
      forwardRef(() => MessageModule),
    AuthModule
  ],
  controllers: [CongeController],
  providers: [CongeService, NotificationService],
  exports: [CongeService],
})
export class CongeModule {}