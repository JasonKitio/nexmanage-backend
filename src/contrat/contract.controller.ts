import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  Headers,
  Body,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
  ValidationPipe,
  Query,
} from "@nestjs/common"
import  { ContractService } from "./contract.service"
import  {
  CreateContractDto,
  UpdateContractDto,
  AddTaskToContractDto,
  PointageContratDto,
  SaveAsTemplateDto,
  CreateFromTemplateDto,
  CreateCommentDto,
} from "./dto/create-contrat.dto"
import { FileInterceptor } from "@nestjs/platform-express"
import { diskStorage } from "multer"
import { extname } from "path"
import  { Response } from "express"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { ApiTags, ApiBody, ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger"
import RemoveUsersFromContractDto from "./dto/RemoveUsersFromContract.dto"
import AddUsersToContractDto from "./dto/AddUsersToContract.dto"
import { Contrat } from "./entities/contrat.entity"

@ApiTags("contracts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contracts")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  // ENDPOINTS POUR LES CONTRATS PAR ENTREPRISE

  @Post("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Créer un contrat pour une entreprise",
    description: "Crée un nouveau contrat lié à une entreprise spécifique",
  })
  async createForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Body(ValidationPipe) createContractDto: CreateContractDto,
  ) {
    return this.contractService.createForEntreprise(entrepriseId, createContractDto)
  }

  @Get("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Obtenir tous les contrats d'une entreprise",
    description: "Récupère la liste de tous les contrats d'une entreprise",
  })
  async getContractsByEntreprise(@Param('entrepriseId', ParseUUIDPipe) entrepriseId: string, @Res() res: Response) {
    try {
      const contrats = await this.contractService.getContractsByEntreprise(entrepriseId)

      return res.json({
        success: true,
        data: contrats,
        count: contrats.length,
        message: `${contrats.length} contrat(s) trouvé(s) pour l'entreprise`,
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de la récupération des contrats de l'entreprise",
        error: error.message,
      })
    }
  }

  @Get("entreprise/:entrepriseId/:contractId")
  @ApiOperation({
    summary: "Obtenir un contrat spécifique d'une entreprise",
    description: "Récupère les détails d'un contrat spécifique d'une entreprise",
  })
  async getContractByEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    const contract = await this.contractService.getContractByEntreprise(entrepriseId, contractId)
    return this.contractService.formatContractForDisplay(contract)
  }

  @Patch("entreprise/:entrepriseId/:contractId")
  @ApiOperation({
    summary: "Mettre à jour un contrat d'une entreprise",
    description: "Met à jour un contrat spécifique d'une entreprise",
  })
  async updateContractForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) updateContractDto: UpdateContractDto,
    
  ) {
    return this.contractService.updateContractForEntreprise(entrepriseId, contractId, updateContractDto)
  }

  @Delete("entreprise/:entrepriseId/:contractId")
  @ApiOperation({
    summary: "Supprimer un contrat d'une entreprise",
    description: "Supprime un contrat spécifique d'une entreprise",
  })
  async removeContractFromEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    return this.contractService.removeContractFromEntreprise(entrepriseId, contractId)
  }

  @Post("entreprise/:entrepriseId/:contractId/users")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Ajouter des utilisateurs à un contrat d'entreprise",
    description: "Ajoute des utilisateurs à un contrat spécifique d'une entreprise",
  })
  async addUsersToContractInEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) addUsersDto: AddUsersToContractDto,
   
  ): Promise<Contrat> {
    return await this.contractService.addUsersToContractInEntreprise(
      entrepriseId,
      contractId,
      addUsersDto.utilisateursIds,
    )
  }

  @Delete("entreprise/:entrepriseId/:contractId/users")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Retirer des utilisateurs d'un contrat d'entreprise",
    description: "Retire des utilisateurs d'un contrat spécifique d'une entreprise",
  })
  async removeUsersFromContractInEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) removeUsersDto: RemoveUsersFromContractDto,
  ): Promise<Contrat> {
    return await this.contractService.removeUsersFromContractInEntreprise(
      entrepriseId,
      contractId,
      removeUsersDto.utilisateursIds,
    )
  }

  @Post("entreprise/:entrepriseId/:contractId/pointage")
  @ApiOperation({
    summary: "Pointage pour un contrat d'entreprise",
    description:
      "Effectue un pointage d'arrivée ou de départ pour un contrat spécifique d'une entreprise. Vérifie la distance et les horaires.",
  })
  @ApiResponse({
    status: 201,
    description: "Pointage effectué avec succès",
  })
  @ApiResponse({
    status: 400,
    description: "Erreur de validation (distance, horaires, etc.)",
  })
  @ApiResponse({
    status: 404,
    description: "Contrat ou utilisateur non trouvé",
  })
  async pointagePresenceForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) pointageDto: PointageContratDto,
    @Res() res: Response,
  ) {
    try {
      const presence = await this.contractService.pointagePresenceForEntreprise(entrepriseId, contractId, pointageDto)

      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: presence,
        message: presence.heureDepart
          ? "Pointage de départ effectué avec succès"
          : "Pointage d'arrivée effectué avec succès",
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      if (error.name === "BadRequestException") {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors du pointage",
        error: error.message,
      })
    }
  }

  @Post("entreprise/:entrepriseId/:contractId/commentaire")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads/commentaire",
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join("")
          return cb(null, `${randomName}${extname(file.originalname)}`)
        },
      }),
    }),
  )
  @ApiOperation({
    summary: "Ajouter un commentaire à un contrat d'entreprise",
    description:
      "Ajoute un commentaire à un contrat spécifique d'une entreprise avec possibilité de joindre un fichier",
  })
  async addCommentToContractInEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() commentDto: CreateCommentDto,
    @UploadedFile() file,
    @Res() res: Response,
  ) {
    try {
      if (file) {
        commentDto.fichierJoint = file.path
      }

      const commentaire = await this.contractService.addCommentToContractInEntreprise(
        entrepriseId,
        contractId,
        commentDto,
      )

      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: commentaire,
        message: "Commentaire ajouté avec succès",
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de l'ajout du commentaire",
        error: error.message,
      })
    }
  }

  @Post("entreprise/:entrepriseId/:contractId/tasks")
  @ApiOperation({
    summary: "Ajouter une tâche à un contrat d'entreprise",
    description: "Ajoute une tâche à un contrat spécifique d'une entreprise",
  })
  async addTaskToContractInEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) addTaskDto: AddTaskToContractDto,
    @Res() res: Response,
  ) {
    try {
      const contract = await this.contractService.addTaskToContractInEntreprise(entrepriseId, contractId, addTaskDto)

      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: contract,
        message: "Tâche ajoutée avec succès au contrat",
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de l'ajout de la tâche",
        error: error.message,
      })
    }
  }

  @Get("entreprise/:entrepriseId/:contractId/presences")
  @ApiOperation({
    summary: "Obtenir les présences d'un contrat d'entreprise",
    description: "Récupère toutes les présences d'un contrat spécifique d'une entreprise",
  })
  async getContractPresencesForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Res() res: Response,
  ) {
    try {
      const presences = await this.contractService.getContractPresencesForEntreprise(entrepriseId, contractId)

      return res.json({
        success: true,
        data: presences,
        count: presences.length,
        message: `${presences.length} présence(s) trouvée(s) pour ce contrat`,
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de la récupération des présences",
        error: error.message,
      })
    }
  }

  @Get("entreprise/:entrepriseId/:contractId/tasks")
  @ApiOperation({
    summary: "Obtenir les tâches d'un contrat d'entreprise",
    description: "Récupère toutes les tâches d'un contrat spécifique d'une entreprise",
  })
  async getContractTasksForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Res() res: Response,
  ) {
    try {
      const tasks = await this.contractService.getContractTasksForEntreprise(entrepriseId, contractId)

      return res.json({
        success: true,
        data: tasks,
        count: tasks.length,
        message: `${tasks.length} tâche(s) trouvée(s) pour ce contrat`,
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de la récupération des tâches",
        error: error.message,
      })
    }
  }

  @Get("entreprise/:entrepriseId/:contractId/commentaires")
  @ApiOperation({
    summary: "Obtenir les commentaires d'un contrat d'entreprise",
    description: "Récupère tous les commentaires d'un contrat spécifique d'une entreprise",
  })
  async getContractCommentsForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Res() res: Response,
  ) {
    try {
      const comments = await this.contractService.getContractCommentsForEntreprise(entrepriseId, contractId)

      return res.json({
        success: true,
        data: comments,
        count: comments.length,
        message: `${comments.length} commentaire(s) trouvé(s) pour ce contrat`,
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de la récupération des commentaires",
        error: error.message,
      })
    }
  }

  @Delete("entreprise/:entrepriseId/:contractId/tasks/:taskId")
  @ApiOperation({
    summary: "Retirer une tâche d'un contrat d'entreprise",
    description: "Retire une tâche spécifique d'un contrat d'une entreprise",
  })
  async removeTaskFromContractInEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
  ) {
    try {
      const contract = await this.contractService.removeTaskFromContractInEntreprise(entrepriseId, contractId, taskId)

      return res.json({
        success: true,
        data: contract,
        message: "Tâche retirée avec succès du contrat",
      })
    } catch (error) {
      if (error.name === "NotFoundException") {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        })
      }
      if (error.name === "BadRequestException") {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        })
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Erreur lors de la suppression de la tâche",
        error: error.message,
      })
    }
  }

  @Post("entreprise/:entrepriseId/:contractId/save-template")
  @ApiOperation({
    summary: "Sauvegarder un contrat comme template pour une entreprise",
    description: "Sauvegarde un contrat comme template réutilisable pour une entreprise",
  })
  async saveAsTemplateForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) saveDto: SaveAsTemplateDto,
  ) {
    return this.contractService.saveAsTemplateForEntreprise(entrepriseId, contractId, saveDto)
  }

  @Get('entreprise/:entrepriseId/templates')
  @ApiOperation({ 
    summary: 'Obtenir tous les templates d\'une entreprise',
    description: 'Récupère tous les templates de contrats d\'une entreprise'
  })
  async getAllTemplatesForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string
  ) {
    return this.contractService.getAllTemplatesForEntreprise(entrepriseId);
  }

  @Post("entreprise/:entrepriseId/from-template")
  @ApiOperation({
    summary: "Créer des contrats à partir d'un template pour une entreprise",
    description: "Crée des contrats à partir d'un template existant pour une entreprise",
  })
  async createFromTemplateForEntreprise(
    @Param('entrepriseId', ParseUUIDPipe) entrepriseId: string,
    @Body(ValidationPipe) createDto: CreateFromTemplateDto,
  ) {
    return this.contractService.createFromTemplateForEntreprise(entrepriseId, createDto)
  }

}