import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ValidationPipe,
  Res,
} from "@nestjs/common"
import  { Response } from "express"
import  { UsersService } from "./user.service"
import  { FilterUsersDto } from "./dto/filter-users.dto"
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from "@nestjs/swagger"
import  { UpdateUtilisateurDto } from "./dto/updateUtilisateur.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Role } from "../utils/enums/enums"
import { Request } from "@nestjs/common"
import  { CreateUserDto } from "../auth/dto/create-user.dto"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ENDPOINTS POUR LES UTILISATEURS PAR ENTREPRISE

  @Post("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Créer un utilisateur pour une entreprise",
    description: "Crée un nouvel utilisateur et l'associe à une entreprise spécifique",
  })
  @ApiParam({
    name: "entrepriseId",
    description: "ID de l'entreprise",
    type: "string",
  })
  async createUserForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Body(ValidationPipe) createUserDto: CreateUserDto,
  ) {
    return {
      success: true,
      message: "Utilisateur créé avec succès pour l'entreprise",
      data: await this.usersService.createUserForEntreprise(entrepriseId, createUserDto),
    }
  }

  @Get("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Obtenir tous les utilisateurs d'une entreprise",
    description: "Récupère la liste de tous les utilisateurs d'une entreprise avec filtres et pagination",
  })
  async findAllForEntreprise(@Param('entrepriseId') entrepriseId: string, @Query() filterDto: FilterUsersDto) {
    return {
      success: true,
      data: await this.usersService.findAllForEntreprise(entrepriseId, filterDto),
    }
  }

  @Get("entreprise/:entrepriseId/:userId")
  @ApiOperation({
    summary: "Obtenir un utilisateur spécifique d'une entreprise",
    description: "Récupère les détails d'un utilisateur spécifique d'une entreprise",
  })
  async findUserByIdForEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('userId') userId: string) {
    return {
      success: true,
      data: await this.usersService.findUserByIdForEntreprise(entrepriseId, userId),
    }
  }

  @Patch("entreprise/:entrepriseId/:userId")
  @ApiOperation({
    summary: "Mettre à jour un utilisateur d'une entreprise",
    description: "Met à jour les informations d'un utilisateur spécifique d'une entreprise",
  })
  async updateUserForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Param('userId') userId: string,
    @Body(ValidationPipe) updateDto: UpdateUtilisateurDto,
  ) {
    return {
      success: true,
      message: "Utilisateur mis à jour avec succès",
      data: await this.usersService.updateUserForEntreprise(entrepriseId, userId, updateDto),
    }
  }

  @Delete("entreprise/:entrepriseId/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Supprimer un utilisateur d'une entreprise",
    description: "Supprime (soft delete) un utilisateur d'une entreprise",
  })
  async softDeleteUserForEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('userId') userId: string) {
    await this.usersService.softDeleteUserForEntreprise(entrepriseId, userId)
    return {
      success: true,
      message: "Utilisateur supprimé avec succès",
    }
  }

  @Patch("entreprise/:entrepriseId/:userId/restore")
  @ApiOperation({
    summary: "Restaurer un utilisateur d'une entreprise",
    description: "Restaure un utilisateur précédemment supprimé d'une entreprise",
  })
  async restoreUserForEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('userId') userId: string) {
    return {
      success: true,
      message: "Utilisateur restauré avec succès",
      data: await this.usersService.restoreUserForEntreprise(entrepriseId, userId),
    }
  }

  @Patch("entreprise/:entrepriseId/:userId/toggle-activation")
  @ApiOperation({
    summary: "Activer/désactiver un utilisateur d'une entreprise",
    description: "Active ou désactive un utilisateur d'une entreprise",
  })
  async toggleActivationForEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('userId') userId: string) {
    const user = await this.usersService.toggleActivationForEntreprise(entrepriseId, userId)
    return {
      success: true,
      message: user.isActif ? "Utilisateur activé" : "Utilisateur désactivé",
      data: user,
    }
  }

  @Get("entreprise/:entrepriseId/deleted")
  @ApiOperation({
    summary: "Obtenir les utilisateurs supprimés d'une entreprise",
    description: "Récupère tous les utilisateurs supprimés d'une entreprise",
  })
  async findDeletedUsersForEntreprise(@Param('entrepriseId') entrepriseId: string, @Query() filterDto: FilterUsersDto) {
    return {
      success: true,
      data: await this.usersService.findDeletedUsersForEntreprise(entrepriseId, filterDto),
    }
  }

  @Get("entreprise/:entrepriseId/role/:role")
  @ApiOperation({
    summary: "Obtenir les utilisateurs par rôle dans une entreprise",
    description: "Récupère tous les utilisateurs d'un rôle spécifique dans une entreprise",
  })
  @ApiParam({
    name: "role",
    enum: Role,
    description: "Rôle des utilisateurs à récupérer",
  })
  async findUsersByRoleForEntreprise(@Param('entrepriseId') entrepriseId: string, @Param('role') role: Role) {
    return {
      success: true,
      data: await this.usersService.findUsersByRoleForEntreprise(entrepriseId, role),
    }
  }

  @Get("entreprise/:entrepriseId/admins")
  @ApiOperation({
    summary: "Obtenir les administrateurs d'une entreprise",
    description: "Récupère tous les utilisateurs ayant le rôle ADMIN dans une entreprise",
  })
  async getAdminsForEntreprise(@Param('entrepriseId') entrepriseId: string) {
    return {
      success: true,
      data: await this.usersService.getAdminsForEntreprise(entrepriseId),
    }
  }

  @Get("entreprise/:entrepriseId/employees")
  @ApiOperation({
    summary: "Obtenir les employés d'une entreprise",
    description: "Récupère tous les utilisateurs ayant le rôle EMPLOYE dans une entreprise",
  })
  async getEmployeesForEntreprise(@Param('entrepriseId') entrepriseId: string) {
    return {
      success: true,
      data: await this.usersService.getEmployeesForEntreprise(entrepriseId),
    }
  }

  @Get("entreprise/:entrepriseId/search")
  @ApiOperation({
    summary: "Rechercher des utilisateurs dans une entreprise",
    description: "Recherche des utilisateurs par nom, email ou téléphone dans une entreprise",
  })
  @ApiQuery({
    name: "q",
    description: "Terme de recherche",
    example: "john",
  })
  async searchUsersInEntreprise(@Param('entrepriseId') entrepriseId: string, @Query('q') searchTerm: string) {
    return {
      success: true,
      data: await this.usersService.searchUsersInEntreprise(entrepriseId, searchTerm),
    }
  }

  @Get("entreprise/:entrepriseId/statistiques")
  @ApiOperation({
    summary: "Obtenir les statistiques des utilisateurs d'une entreprise",
    description: "Récupère les statistiques détaillées des utilisateurs de l'entreprise",
  })
  async getStatistiquesUsersEntreprise(@Param('entrepriseId') entrepriseId: string) {
    return {
      success: true,
      data: await this.usersService.getStatistiquesUsersEntreprise(entrepriseId),
    }
  }

  @Get("entreprise/:entrepriseId/export")
  @ApiOperation({
    summary: "Exporter les utilisateurs d'une entreprise",
    description: "Exporte tous les utilisateurs d'une entreprise au format Excel",
  })
  async exportUsersEntreprise(@Param('entrepriseId') entrepriseId: string, @Res() res: Response) {
    const buffer = await this.usersService.exportUsersEntreprise(entrepriseId)

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="utilisateurs_entreprise_${entrepriseId}.xlsx"`,
      "Content-Length": buffer.length,
    })

    res.send(buffer)
  }

  @Patch("entreprise/:entrepriseId/:userId/role")
  @ApiOperation({
    summary: "Changer le rôle d'un utilisateur dans une entreprise",
    description: "Modifie le rôle d'un utilisateur spécifique dans une entreprise",
  })
  async changeUserRoleForEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Param('userId') userId: string,
    @Body() body: { role: Role },
  ) {
    return {
      success: true,
      message: "Rôle mis à jour avec succès",
      data: await this.usersService.changeUserRoleForEntreprise(entrepriseId, userId, body.role),
    }
  }

  // ENDPOINTS EXISTANTS (pour compatibilité)

  @Get()
  async findAll(@Query() filterDto: FilterUsersDto) {
    return await this.usersService.findAll(filterDto)
  }

  @Get("deleted")
  async findAllDeleted(@Query() filterDto: FilterUsersDto) {
    return await this.usersService.findAllDeleted(filterDto)
  }

  @Get("all")
  async findAllWithDeleted(@Query() filterDto: FilterUsersDto) {
    return await this.usersService.findAllWithDeleted(filterDto)
  }

  @Get("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Récupérer les informations de l'utilisateur connecté" })
  @ApiResponse({
    status: 200,
    description: "Informations de l'utilisateur récupérées avec succès",
  })
  @ApiResponse({
    status: 401,
    description: "Non autorisé - Token invalide",
  })
  @ApiResponse({
    status: 404,
    description: "Utilisateur non trouvé",
  })
  async getMe(@Request() req) {
    const utilisateur = await this.usersService.getMe(req.user.sub)

    return {
      success: true,
      message: "Informations de l'utilisateur récupérées avec succès",
      data: utilisateur,
    }
  }

  @Get(":id")
  async findOne(@Param('id') id: string) {
    return await this.usersService.findById(id)
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string) {
    await this.usersService.softDelete(id)
    return { message: "Utilisateur supprimé avec succès" }
  }

  @Patch(":id/restore")
  async restore(@Param('id') id: string) {
    const user = await this.usersService.restore(id)
    return {
      message: "Utilisateur restauré avec succès",
      user,
    }
  }

  @Patch(":id")
  async updateUtilisateur(@Param('id') id: string, @Body() updateDto: UpdateUtilisateurDto) {
    return this.usersService.updateUtilisateur(id, updateDto)
  }

  @Patch(":id/toggle-activation")
  async toggleActivation(@Param('id') id: string) {
    const user = await this.usersService.toggleActivation(id)
    return {
      message: user.isActif ? "Utilisateur activé" : "Utilisateur désactivé",
      user,
    }
  
}
}
