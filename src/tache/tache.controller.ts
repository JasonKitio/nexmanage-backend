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
  HttpStatus,
  HttpCode,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common"
import { Response } from "express"
import { TacheService } from "./tache.service"
import { CreateTacheDto } from "./dto/create-tache.dto"
import { UpdateTacheDto } from "./dto/update-tache.dto"
import { QueryTacheDto } from "./dto/query-tache.dto"
import { Priorite, StatutTache } from "src/utils/enums/enums"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from "@nestjs/swagger"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("taches")
@Controller("taches")
export class TacheController {
  constructor(private readonly tacheService: TacheService) {}

  // ENDPOINTS POUR LES TÂCHES PAR ENTREPRISE

  @Post("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Créer une tâche pour une entreprise",
    description: "Crée une nouvelle tâche liée à une entreprise spécifique",
  })
  @ApiParam({
    name: "entrepriseId",
    description: "ID de l'entreprise",
    type: "string",
  })
  async createForEntreprise(
    @Param('entrepriseId') entrepriseId: string, // ✅ Ajout du décorateur @Param
    @Body(ValidationPipe) createTacheDto: CreateTacheDto
  ) {
    return {
      statusCode: HttpStatus.CREATED,
      message: "Tâche créée avec succès pour l'entreprise",
      data: await this.tacheService.createForEntreprise(entrepriseId, createTacheDto),
    }
  }

  @Get("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Obtenir toutes les tâches d'une entreprise",
    description: "Récupère la liste de toutes les tâches d'une entreprise avec filtres optionnels",
  })
  async findAllForEntreprise(
    @Param('entrepriseId') entrepriseId: string, 
    @Query() queryDto: QueryTacheDto
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: "Tâches de l'entreprise récupérées avec succès",
      data: await this.tacheService.findAllForEntreprise(entrepriseId, queryDto),
    }
  }

   @Get("entreprise/:entrepriseId/export")
  @ApiOperation({
    summary: "Exporter les tâches d'une entreprise",
    description: "Exporte toutes les tâches d'une entreprise au format Excel",
  })
  async exportTachesEntreprise(@Param('entrepriseId') entrepriseId: string, @Res() res: Response) {
    const buffer = await this.tacheService.exportTachesEntreprise(entrepriseId)

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="taches_entreprise_${entrepriseId}.xlsx"`,
      "Content-Length": buffer.length,
    })

    res.send(buffer)
  }

  @Get("entreprise/:entrepriseId/:tacheId")
  @ApiOperation({
    summary: "Obtenir une tâche spécifique d'une entreprise",
    description: "Récupère les détails d'une tâche spécifique d'une entreprise",
  })
  async findOneForEntreprise(
    @Param('entrepriseId') entrepriseId: string, // ✅ Ajout du décorateur @Param
    @Param('tacheId') tacheId: string // ✅ Ajout du décorateur @Param
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: "Tâche récupérée avec succès",
      data: await this.tacheService.findOneForEntreprise(entrepriseId, tacheId),
    }
  }

  @Patch("entreprise/:entrepriseId/:tacheId")
  @ApiOperation({
    summary: "Mettre à jour une tâche d'une entreprise",
    description: "Met à jour une tâche spécifique d'une entreprise",
  })
  async updateForEntreprise(
    @Param('entrepriseId') entrepriseId: string, // ✅ Ajout du décorateur @Param
    @Param('tacheId') tacheId: string, // ✅ Ajout du décorateur @Param
    @Body(ValidationPipe) updateTacheDto: UpdateTacheDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: "Tâche mise à jour avec succès",
      data: await this.tacheService.updateForEntreprise(entrepriseId, tacheId, updateTacheDto),
    }
  }

  @Delete("entreprise/:entrepriseId/:tacheId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Supprimer une tâche d'une entreprise",
    description: "Supprime (soft delete) une tâche spécifique d'une entreprise",
  })
  async removeForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Param('tacheId') tacheId: string,
  ): Promise<void> {
    await this.tacheService.removeForEntreprise(entrepriseId, tacheId);
  }

  @Post("entreprise/:entrepriseId/:tacheId/duplicate")
  @ApiOperation({
    summary: "Dupliquer une tâche d'une entreprise",
    description: "Crée une copie d'une tâche existante pour une entreprise",
  })
  async duplicateForEntreprise(
    @Param('entrepriseId') entrepriseId: string, // ✅ Ajout du décorateur @Param
    @Param('tacheId') tacheId: string // ✅ Ajout du décorateur @Param
  ) {
    return {
      statusCode: HttpStatus.CREATED,
      message: "Tâche dupliquée avec succès",
      data: await this.tacheService.duplicateForEntreprise(entrepriseId, tacheId),
    }
  }

  @Patch("entreprise/:entrepriseId/:tacheId/restore")
  @ApiOperation({
    summary: "Restaurer une tâche supprimée d'une entreprise",
    description: "Restaure une tâche précédemment supprimée pour une entreprise",
  })
  async restoreForEntreprise(
    @Param('entrepriseId') entrepriseId: string, // ✅ Ajout du décorateur @Param
    @Param('tacheId') tacheId: string // ✅ Ajout du décorateur @Param
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: "Tâche restaurée avec succès",
      data: await this.tacheService.restoreForEntreprise(entrepriseId, tacheId),
    }
  }

  @Get("entreprise/:entrepriseId/deleted")
  @ApiOperation({
    summary: "Obtenir les tâches supprimées d'une entreprise",
    description: "Récupère toutes les tâches supprimées d'une entreprise",
  })
  async findDeletedForEntreprise(
    @Param('entrepriseId') entrepriseId: string // ✅ Ajout du décorateur @Param
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: "Tâches supprimées récupérées avec succès",
      data: await this.tacheService.findDeletedForEntreprise(entrepriseId),
    }
  }

  @Get("entreprise/:entrepriseId/filter")
  @ApiOperation({
    summary: "Filtrer les tâches d'une entreprise par priorité ou statut",
    description: "Récupère les tâches d'une entreprise filtrées par priorité et/ou statut",
  })
  @ApiQuery({
    name: "priorite",
    enum: Priorite,
    required: false,
    description: "Filtrer par priorité",
  })
  @ApiQuery({
    name: "statut",
    enum: StatutTache,
    required: false,
    description: "Filtrer par statut",
  })
  async findByPrioriteOrStatutForEntreprise(
    @Param('entrepriseId') entrepriseId: string, // ✅ Ajout du décorateur @Param
    @Query('priorite') priorite?: Priorite,
    @Query('statut') statut?: StatutTache,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: "Tâches filtrées récupérées avec succès",
      data: await this.tacheService.findByPrioriteOrStatutForEntreprise(entrepriseId, priorite, statut),
    }
  }

 

  @Get("entreprise/:entrepriseId/statistiques")
  @ApiOperation({
    summary: "Obtenir les statistiques des tâches d'une entreprise",
    description: "Récupère les statistiques détaillées des tâches d'une entreprise",
  })
  async getStatistiquesEntreprise(@Param('entrepriseId') entrepriseId: string) {
    return {
      statusCode: HttpStatus.OK,
      message: "Statistiques récupérées avec succès",
      data: await this.tacheService.getStatistiquesEntreprise(entrepriseId),
    }
  }
}