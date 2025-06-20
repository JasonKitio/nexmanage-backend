import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  UseGuards
} from '@nestjs/common';
import { Response } from 'express';
import { TacheService } from './tache.service';
import { CreateTacheDto } from './dto/create-tache.dto';
import { UpdateTacheDto } from './dto/update-tache.dto';
import { QueryTacheDto } from './dto/query-tache.dto';
import { Priorite, StatutTache } from 'src/utils/enums/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../utils/enums/enums';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('taches')
export class TacheController {
  constructor(private readonly tacheService: TacheService) {}

  // Créer une tâche liée à un contrat
  @Post()
  async create(@Body() createTacheDto: CreateTacheDto) {
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tâche créée avec succès',
      data: await this.tacheService.create(createTacheDto),
    };
  }

  // Récupérer toutes les tâches avec filtres optionnels
  @Get()
  async findAll(@Query() queryDto: QueryTacheDto) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tâches récupérées avec succès',
      data: await this.tacheService.findAll(queryDto),
    };
  }

  // Lister les tâches par priorité ou statut
  @Get('filter')
  async findByPrioriteOrStatut(
    @Query('priorite') priorite?: Priorite,
    @Query('statut') statut?: StatutTache,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tâches filtrées récupérées avec succès',
      data: await this.tacheService.findByPrioriteOrStatut(priorite, statut),
    };
  }

//   // Lister les tâches d'un employé sur une période
//   @Get('employe/:employeId/periode')
//   async findByEmployeAndPeriod(
//     @Param('employeId', ParseUUIDPipe) employeId: string,
//     @Query('dateDebut') dateDebut: string,
//     @Query('dateFin') dateFin: string,
//   ) {
//     const debut = new Date(dateDebut);
//     const fin = new Date(dateFin);

//     return {
//       statusCode: HttpStatus.OK,
//       message: 'Tâches de l\'employé récupérées avec succès',
//       data: await this.tacheService.findByEmployeAndPeriod(employeId, debut, fin),
//     };
//   }

  // Exporter les tâches d'un utilisateur
  @Get('export/:employeId')
  async exportTaches(
    @Param('employeId', ParseUUIDPipe) employeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.tacheService.exportTachesUtilisateur(employeId);
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="taches_employe_${employeId}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  // Récupérer les tâches supprimées
  @Get('deleted')
  async findDeleted() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tâches supprimées récupérées avec succès',
      data: await this.tacheService.findDeleted(),
    };
  }

  // Récupérer une tâche par ID
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tâche récupérée avec succès',
      data: await this.tacheService.findOne(id),
    };
  }

  // Mettre à jour une tâche
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTacheDto: UpdateTacheDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tâche mise à jour avec succès',
      data: await this.tacheService.update(id, updateTacheDto),
    };
  }

  // Dupliquer une tâche
  @Post(':id/duplicate')
  async duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tâche dupliquée avec succès',
      data: await this.tacheService.duplicate(id),
    };
  }

  // Restaurer une tâche supprimée
  @Patch(':id/restore')
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tâche restaurée avec succès',
      data: await this.tacheService.restore(id),
    };
  }

  // Suppression logique d'une tâche
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tacheService.remove(id);
    return {
      statusCode: HttpStatus.NO_CONTENT,
      message: 'Tâche supprimée avec succès',
    };
  }
}