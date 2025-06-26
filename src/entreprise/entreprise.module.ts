import { Module,forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntrepriseService } from './entreprise.service';
import { EntrepriseController } from './entreprise.controller';
import { Entreprise } from './entities/entreprise.entity';
import { Utilisateur } from '../User/entities/utilisateur.entity';
import { UtilisateurEntreprise } from '../UtilisateurEntreprise/entities/utilisateur-entreprise.entity';
import { TwilioModule } from 'src/twillio/twillio.module';
import { CacheModule } from 'src/cache/cache.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Entreprise, Utilisateur, UtilisateurEntreprise]),
    TwilioModule,
    CacheModule,
     forwardRef(() => AuthModule),
  ],
  controllers: [EntrepriseController],
  providers: [EntrepriseService],
  exports: [EntrepriseService,TypeOrmModule],
})
export class EntrepriseModule {}
