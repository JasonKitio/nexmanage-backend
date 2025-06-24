import { Controller, Get, Post, Patch, Param, Delete, Headers,Body, UseInterceptors, UploadedFile, Res, HttpStatus , UseGuards, HttpCode, ParseUUIDPipe, ValidationPipe, Query} from "@nestjs/common"
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
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../utils/enums/enums';
import { ApiTags,ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import RemoveUsersFromContractDto from './dto/RemoveUsersFromContract.dto';
import AddUsersToContractDto from "./dto/AddUsersToContract.dto"
import { Contrat } from "./entities/contrat.entity"

@ApiTags('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contracts")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post()
  async create( @Body()createContractDto: CreateContractDto, @Headers('timezone') timezone?: string) {
    return this.contractService.create(createContractDto, timezone)
  }

  @Get()
  async findAll() {
    return this.contractService.findAll()
  }

  @Get("templates")
  async getAllTemplates() {
    return this.contractService.getAllTemplates()
  }

  @Get('employee/:employeeId')
  async findContractsByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.contractService.findContractsByEmployeeId(employeeId);
  }

  @Get("presences")
  async findAllPresences() {
    return this.contractService.findAllPresences()
  }

  @Get('presences/employee/:employeeId')
  async findPresencesByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.contractService.findPresencesByEmployeeId(employeeId);
  }

  @Get(":id")
  async findOne(@Param('id') id: string, @Headers('timezone') timezone?: string) {
    const contract = await this.contractService.findOne(id)
    return this.contractService.formatContractForDisplay(contract, timezone)
  }

  @Get(':id/presences')
  async getContractPresences(@Param('id') id: string) {
    return this.contractService.getContractPresences(id);
  }

  @Patch(":id")
  async update(@Param('id') id: string, updateContractDto: UpdateContractDto, @Headers('timezone') timezone?: string) {
    return this.contractService.update(id, updateContractDto, timezone)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.contractService.remove(id);
  }

  @Post(":id/tasks")
  async addTaskToContract(@Param('id') id: string, addTaskDto: AddTaskToContractDto) {
    return this.contractService.addTaskToContract(id, addTaskDto)
  }

    @Post(':id/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Ajouter des utilisateurs à un contrat',
    description: 'Permet d\'ajouter un ou plusieurs utilisateurs à un contrat existant. Vérifie les conflits d\'horaire avant l\'ajout.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID du contrat',
    type: 'string',
    example: 'contract-123-456'
  })
  @ApiQuery({
    name: 'timezone',
    description: 'Fuseau horaire pour les vérifications d\'horaire',
    required: false,
    example: 'Africa/Douala'
  })
  @ApiBody({
    description: 'Liste des IDs des utilisateurs à ajouter',
    type: AddUsersToContractDto
  })
  @ApiResponse({
    status: 200,
    description: 'Utilisateurs ajoutés avec succès au contrat',
    type: Contrat
  })
  @ApiResponse({
    status: 404,
    description: 'Contrat introuvable ou un ou plusieurs utilisateurs introuvables'
  })
  @ApiResponse({
    status: 409,
    description: 'Conflit d\'horaire détecté ou utilisateur déjà assigné'
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides'
  })
  async addUsersToContract(
    @Param('id', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) addUsersDto: AddUsersToContractDto,
    @Query('timezone') timezone: string = 'Africa/Douala'
  ): Promise<Contrat> {
    return await this.contractService.addUsersToContract(
      contractId,
      addUsersDto.utilisateursIds,
      timezone
    );
  }

  @Post(':id/commentaire')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/commentaire',
      filename: (req, file, cb) => {
        const randomName = Array(32)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        return cb(null, `${randomName}${extname(file.originalname)}`);
      },
    }),
  }),
)
async addComment(
  @Param('id') id: string,
  @Body() commentDto: CreateCommentDto,
  @UploadedFile() file,
  @Res() res: Response,
) {
  try {
    // Si un fichier est téléchargé, mettre à jour le DTO avec le chemin du fichier
    if (file) {
      commentDto.fichierJoint = file.path;
    }
    
    const commentaire = await this.contractService.addCommentToContract(id, commentDto);
    
    return res.json({
    success: true,
     commentaire,
  });
  } catch (error) {
    if (error.name === 'NotFoundException') {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message,
    });
  }
}

  @Post(":id/pointage")
  async pointagePresence(@Param('id') id: string,  @Body() pointageDto: PointageContratDto,) {
    return this.contractService.pointagePresence(id, pointageDto)
  }

  @Post(":id/save-template")
  async saveAsTemplate(@Param('id') id: string,  @Body()  saveDto: SaveAsTemplateDto) {
    return this.contractService.saveAsTemplate(id, saveDto)
  }

   @Get('entreprise/:entrepriseId')
  async getContractsByEntreprise(
    @Param('entrepriseId') entrepriseId: string,
    @Res() res: Response,
  ) {
    try {
      const contrats = await this.contractService.getContractsByEntreprise(entrepriseId);
      
      return res.json({
        success: true,
        data: contrats,
        count: contrats.length,
        message: `${contrats.length} contrat(s) trouvé(s) pour l'entreprise`,
      });
    } catch (error) {
      if (error.name === 'NotFoundException') {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Erreur lors de la récupération des contrats de l\'entreprise',
        error: error.message,
      });
    }
  }

  @Post("from-template")
  async createFromTemplate(createDto: CreateFromTemplateDto) {
    return this.contractService.createFromTemplate(createDto)
  }

  @Delete(':id/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Retirer des utilisateurs d\'un contrat',
    description: 'Permet de retirer un ou plusieurs utilisateurs d\'un contrat existant.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID du contrat',
    type: 'string',
    example: 'contract-123-456'
  })
  @ApiBody({
    description: 'Liste des IDs des utilisateurs à retirer',
    type: RemoveUsersFromContractDto
  })
  @ApiResponse({
    status: 200,
    description: 'Utilisateurs retirés avec succès du contrat',
    type: Contrat
  })
  @ApiResponse({
    status: 404,
    description: 'Contrat introuvable'
  })
  @ApiResponse({
    status: 400,
    description: 'Aucun utilisateur assigné à ce contrat ou données invalides'
  })
  async removeUsersFromContract(
    @Param('id', ParseUUIDPipe) contractId: string,
    @Body(ValidationPipe) removeUsersDto: RemoveUsersFromContractDto
  ): Promise<Contrat> {
    return await this.contractService.removeUsersFromContract(
      contractId,
      removeUsersDto.utilisateursIds
    );
  }
}
