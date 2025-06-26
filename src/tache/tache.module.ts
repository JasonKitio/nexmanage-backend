import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TacheService } from './tache.service';
import { TacheController } from './tache.controller';
import { tache } from './entities/tache.entity';
import { AuthModule } from 'src/auth/auth.module';
import { Entreprise } from 'src/entreprise/entities/entreprise.entity';

@Module({
  imports: [TypeOrmModule.forFeature([tache,Entreprise]),AuthModule],
  controllers: [TacheController],
  providers: [TacheService],
  exports: [TacheService],
})
export class TacheModule {}