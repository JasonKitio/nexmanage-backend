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
  ValidationPipe,
  Query,
  Res,
  BadRequestException,
} from "@nestjs/common"
import  { Response } from "express"
import  { CongeService } from "./conge.service"
import  { CreateCongeDto } from "./dto/create-conge.dto"
import  { UpdateStatutCongeDto } from "./dto/update-statut-conge"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from "@nestjs/swagger"
import { StatutConge } from "src/utils/enums/enums"

@ApiTags("congés")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("conges")
export class CongeController {
  constructor(private readonly congeService: CongeService) {}

  // ENDPOINTS POUR LES CONGÉS PAR ENTREPRISE

 @Post("entreprise/:entrepriseId")
@ApiOperation({
  summary: "Créer une demande de congé pour une entreprise",
  description: "Crée une nouvelle demande de congé pour un utilisateur dans une entreprise spécifique",
})
@ApiParam({
  name: "entrepriseId",
  description: "ID de l'entreprise",
  type: "string",
})
@ApiResponse({ status: 201, description: "Demande créée avec succès" })
async createForEntreprise(
  @Param('entrepriseId') entrepriseId: string,
  @Request() req,
  @Body(ValidationPipe) createCongeDto: CreateCongeDto,
) {
  const userId = req.user?.sub; // Extraction correcte de l'ID utilisateur

  console.log('Debug Controller:');
  console.log('req.user:', req.user);
  console.log('userId extrait:', userId);
  console.log('entrepriseId:', entrepriseId);

  if (!userId) {
    throw new BadRequestException('Utilisateur non authentifié ou ID utilisateur manquant');
  }

  return {
    success: true,
    message: "Demande de congé créée avec succès",
    // CORRECTION: Utiliser userId au lieu de req.user.userId
    data: await this.congeService.createCongeForEntreprise(entrepriseId, userId, createCongeDto),
  }
}

  @Get("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Obtenir toutes les demandes de congé d'une entreprise",
    description: "Récupère toutes les demandes de congé d'une entreprise (Admin seulement)",
  })
  async getCongesByEntreprise(@Param('entrepriseId') entrepriseId: string) {
    return {
      success: true,
      data: await this.congeService.getCongesByEntreprise(entrepriseId),
    }
  }

   @Get("entreprise/:entrepriseId/export")
  @ApiOperation({
    summary: "Exporter les congés d'une entreprise",
    description: "Exporte toutes les demandes de congé d'une entreprise au format Excel",
  })
  async exportCongesEntreprise(@Param('entrepriseId') entrepriseId: string, @Res() res: Response) {
    const buffer = await this.congeService.exportCongesEntreprise(entrepriseId)

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="conges_entreprise_${entrepriseId}.xlsx"`,
      "Content-Length": buffer.length,
    })

    res.send(buffer)
  }

  @Get("entreprise/:entrepriseId/:congeId")
  @ApiOperation({
    summary: "Obtenir une demande de congé spécifique d'une entreprise",
    description: "Récupère les détails d'une demande de congé spécifique",
  })
  async getCongeByIdForEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('congeId') congeId: string) {
    return {
      success: true,
      data: await this.congeService.getCongeByIdForEntreprise(entrepriseId, congeId),
    }
  }

  @Get("entreprise/:entrepriseId/user/:userId")
  @ApiOperation({
    summary: "Obtenir les congés d'un utilisateur dans une entreprise",
    description: "Récupère toutes les demandes de congé d'un utilisateur spécifique dans une entreprise",
  })
  async getMesCongesInEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('userId') userId: string) {
    return {
      success: true,
      data: await this.congeService.getMesCongesInEntreprise(entrepriseId, userId),
    }
  }

 // 1. CORRECTION DU CONTRÔLEUR
@Patch("entreprise/:entrepriseId/:congeId/statut")
@ApiOperation({
  summary: "Approuver ou refuser une demande de congé dans une entreprise",
  description: "Met à jour le statut d'une demande de congé (Admin seulement)",
})
async updateStatutForEntreprise(
  @Param('entrepriseId') entrepriseId: string,
  @Param('congeId') congeId: string,
  @Request() req,
  @Body(ValidationPipe) updateStatutDto: UpdateStatutCongeDto,
) {
  // CORRECTION: Utiliser req.user.sub au lieu de req.user.userId
  const adminId = req.user?.sub;
  
  console.log('Debug updateStatutForEntreprise:');
  console.log('req.user:', req.user);
  console.log('adminId extrait:', adminId);
  
  if (!adminId) {
    throw new BadRequestException('Utilisateur non authentifié ou ID utilisateur manquant');
  }

  return {
    success: true,
    message: "Statut mis à jour avec succès",
    data: await this.congeService.updateStatutCongeForEntreprise(
      entrepriseId,
      adminId, // Utiliser la variable adminId
      congeId,
      updateStatutDto,
    ),
  }
}

  @Delete("entreprise/:entrepriseId/:congeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Supprimer une demande de congé dans une entreprise",
    description: "Supprime (soft delete) une demande de congé (Admin seulement)",
  })
  async deleteForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Param('congeId') congeId: string,
    @Request() req,
  ) {
    await this.congeService.deleteCongeForEntreprise(entrepriseId, req.user.userId, congeId)
    return {
      success: true,
      message: "Demande de congé supprimée avec succès",
    }
  }

  @Patch("entreprise/:entrepriseId/:congeId/restore")
  @ApiOperation({
    summary: "Restaurer une demande de congé dans une entreprise",
    description: "Restaure une demande de congé supprimée (Admin seulement)",
  })
  async restoreForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Param('congeId') congeId: string,
    @Request() req,
  ) {
    return {
      success: true,
      message: "Demande de congé restaurée avec succès",
      data: await this.congeService.restoreCongeForEntreprise(entrepriseId, req.user.userId, congeId),
    }
  }

  @Get("entreprise/:entrepriseId/statut/:statut")
  @ApiOperation({
    summary: "Obtenir les congés par statut dans une entreprise",
    description: "Récupère toutes les demandes de congé d'un statut spécifique",
  })
  @ApiParam({
    name: "statut",
    enum: StatutConge,
    description: "Statut des congés à récupérer",
  })
  async getCongesByStatutForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Param('statut') statut: StatutConge,
  ) {
    return {
      success: true,
      data: await this.congeService.getCongesByStatutForEntreprise(entrepriseId, statut),
    }
  }

  @Get("entreprise/:entrepriseId/periode")
  @ApiOperation({
    summary: "Obtenir les congés par période dans une entreprise",
    description: "Récupère les congés dans une période donnée",
  })
  @ApiQuery({
    name: "dateDebut",
    description: "Date de début de la période (YYYY-MM-DD)",
    example: "2024-01-01",
  })
  @ApiQuery({
    name: "dateFin",
    description: "Date de fin de la période (YYYY-MM-DD)",
    example: "2024-12-31",
  })
  async getCongesByPeriodForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Query('dateDebut') dateDebut: string,
    @Query('dateFin') dateFin: string,
  ) {
    return {
      success: true,
      data: await this.congeService.getCongesByPeriodForEntreprise(
        entrepriseId,
        new Date(dateDebut),
        new Date(dateFin),
      ),
    }
  }

  @Get("entreprise/:entrepriseId/statistiques")
  @ApiOperation({
    summary: "Obtenir les statistiques des congés d'une entreprise",
    description: "Récupère les statistiques détaillées des congés de l'entreprise",
  })
  async getStatistiquesCongesEntreprise(@Param('entrepriseId') entrepriseId: string) {
    return {
      success: true,
      data: await this.congeService.getStatistiquesCongesEntreprise(entrepriseId),
    }
  }

 

  @Get("entreprise/:entrepriseId/planning/:annee")
  @ApiOperation({
    summary: "Obtenir le planning des congés d'une entreprise",
    description: "Récupère le planning annuel des congés approuvés",
  })
  @ApiParam({
    name: "annee",
    description: "Année du planning",
    example: "2024",
  })
  async getPlanningCongesEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('annee') annee: number) {
    return {
      success: true,
      data: await this.congeService.getPlanningCongesEntreprise(entrepriseId, Number(annee)),
    }
  }

}
