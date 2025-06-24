import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { CongeService } from './conge.service';
import { CreateCongeDto } from './dto/create-conge.dto';
import { UpdateStatutCongeDto } from './dto/update-statut-conge';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('congés')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conges')
export class CongeController {
  constructor(private readonly congeService: CongeService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle demande de congé' })
  @ApiResponse({ status: 201, description: 'Demande créée avec succès' })
  async create(@Request() req, @Body() createCongeDto: CreateCongeDto) {
    return await this.congeService.createConge(req.user.userId, createCongeDto);
  }

  @Get('mes-conges')
  @ApiOperation({ summary: 'Obtenir mes propres demandes de congé' })
  async getMesConges(@Request() req) {
    return await this.congeService.getMesConges(req.user.userId);
  }

  @Get('entreprise')
  @ApiOperation({ summary: 'Obtenir toutes les demandes de congé de l\'entreprise (Admin seulement)' })
  async getCongesEntreprise(@Request() req) {
    return await this.congeService.getCongesByEntreprise(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une demande de congé spécifique (Admin seulement)' })
  async getCongeById(@Request() req, @Param('id') id: string) {
    return await this.congeService.getCongeById(req.user.userId, id);
  }

  @Patch(':id/statut')
  @ApiOperation({ summary: 'Approuver ou refuser une demande de congé (Admin seulement)' })
  async updateStatut(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStatutDto: UpdateStatutCongeDto,
  ) {
    return await this.congeService.updateStatutConge(req.user.userId, id, updateStatutDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une demande de congé (Admin seulement)' })
  async delete(@Request() req, @Param('id') id: string) {
    await this.congeService.deleteConge(req.user.userId, id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restaurer une demande de congé supprimée (Admin seulement)' })
  async restore(@Request() req, @Param('id') id: string) {
    return await this.congeService.restoreConge(req.user.userId, id);
  }
}
