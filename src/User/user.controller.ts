import { Controller, Get, Post, Delete, Patch, Param, Query, Body, HttpCode, HttpStatus, ParseUUIDPipe,UseGuards } from '@nestjs/common';
import { UsersService } from './user.service';
import { FilterUsersDto } from './dto/filter-users.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { UpdateUtilisateurDto } from './dto/updateUtilisateur.dto';import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../utils/enums/enums';
import { Request } from '@nestjs/common';

@UseGuards(JwtAuthGuard, RolesGuard)

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Récupérer tous les utilisateurs actifs (non supprimés)
  @Get()
  
  async findAll(@Query() filterDto: FilterUsersDto) {
    return await this.usersService.findAll(filterDto);
  }

  // Récupérer tous les utilisateurs supprimés
  @Get('deleted')
  async findAllDeleted(@Query() filterDto: FilterUsersDto) {
    return await this.usersService.findAllDeleted(filterDto);
  }

  // Récupérer tous les utilisateurs (supprimés et actifs)
  @Get('all')
  async findAllWithDeleted(@Query() filterDto: FilterUsersDto) {
    return await this.usersService.findAllWithDeleted(filterDto);
  }

   @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer les informations de l\'utilisateur connecté' })
  @ApiResponse({
    status: 200,
    description: 'Informations de l\'utilisateur récupérées avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Token invalide',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilisateur non trouvé',
  })
  async getMe(@Request() req) {
    const utilisateur = await this.usersService.getMe(req.user.sub);
    
    return {
      success: true,
      message: 'Informations de l\'utilisateur récupérées avec succès',
      data: utilisateur,
    };
  }

  // Récupérer un utilisateur par ID (seulement s'il n'est pas supprimé)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findById(id);
  }

  // Suppression logique d'un utilisateur
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string) {
    await this.usersService.softDelete(id);
    return { message: 'Utilisateur supprimé avec succès' };
  }

  // Restaurer un utilisateur supprimé
  @Patch(':id/restore')
  async restore(@Param('id') id: string) {
    const user = await this.usersService.restore(id);
    return { 
      message: 'Utilisateur restauré avec succès', 
      user 
    };
  }

   @Patch(':id')
  async updateUtilisateur(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateUtilisateurDto,
  ) {
    return this.usersService.updateUtilisateur(id, updateDto);
  }


  // Activer/désactiver un utilisateur
  @Patch(':id/toggle-activation')
  async toggleActivation(@Param('id') id: string) {
    const user = await this.usersService.toggleActivation(id);
    return { 
      message: user.isActif ? 'Utilisateur activé' : 'Utilisateur désactivé', 
      user 
    };
  }

  
}