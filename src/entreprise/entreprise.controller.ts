import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  Res,
  HttpException,
  HttpStatus,
  HttpCode,
  Req
  
} from '@nestjs/common';
import { EntrepriseService } from './entreprise.service';
import { CreateEntrepriseDto } from './dto/create-entreprise.dto';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { PaginationDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../utils/enums/enums';
import { Response } from 'express';
import { AssignManagerDto } from './dto/assignManager.dto';

@Controller('entreprises')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntrepriseController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

 @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createEntreprise(
    @Body() createEntrepriseDto: CreateEntrepriseDto,
    @Req() req: any
  ) {
    const adminId = req.user.idUtilisateur;
    return await this.entrepriseService.createEntreprise(createEntrepriseDto, adminId);
  }

  @Get()
   @Roles(Role.ADMIN)
  async findAll(@Query() paginationDto: PaginationDto) {
    return this.entrepriseService.findAll(paginationDto);
  }
   @Get('my-companies')
  getMyCompanies(@Req() req, @Query() paginationDto: PaginationDto) {
    return this.entrepriseService.getMyCompanies(req.user.idUtilisateur, paginationDto);
  }

  @Get('deleted')
  @Roles(Role.ADMIN)
  async findAllDeleted(@Query() paginationDto: PaginationDto) {
    return this.entrepriseService.findAllDeleted(paginationDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.entrepriseService.findOne(id);
  }

  @Get(':id/users')
  async getUsersByEntreprise(
    @Param('id') id: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.entrepriseService.getUsersByEntreprise(id, paginationDto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateEntrepriseDto: UpdateEntrepriseDto,
    @Request() req: any,
  ) {
    return this.entrepriseService.update(id, updateEntrepriseDto, req.user.idUtilisateur);
  }

  


@Patch(':id/assign-manager')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async assignManager(
    @Param('id') entrepriseId: string,
    @Body() assignManagerDto: AssignManagerDto,
    @Req() req: any
  ) {
    const currentUserId = req.user.idUtilisateur;
    const currentUserRole = req.user.role;
    
    return await this.entrepriseService.assignManager(
      entrepriseId, 
      assignManagerDto.newManagerId, 
      currentUserId,
      currentUserRole
    );
  }

  @Post(':id/invite')
  async inviteUser(
    @Param('id') id: string,
    @Body() inviteUserDto: InviteUserDto,
    @Request() req: any,
  ) {
    return this.entrepriseService.inviteUser(id, inviteUserDto, req.user.idUtilisateur);
  }

  @Post(':id/transfer-ownership')
  async transferOwnership(
    @Param('id') id: string,
    @Body() transferOwnershipDto: TransferOwnershipDto,
    @Request() req: any,
  ) {
    return this.entrepriseService.transferOwnership(
      id,
      transferOwnershipDto,
      req.user.idUtilisateur,
    );
  }

  @Get(':id/export/csv')
  async exportToCSV(@Param('id') id: string, @Res() res: Response) {
    const csvData = await this.entrepriseService.exportToCSV(id);
    res.header('Content-Type', 'text/csv');
    res.attachment(`entreprise-${id}-data.csv`);
    return res.send(csvData);
  }

  @Get(':id/export/pdf')
  async exportToPDF(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.entrepriseService.exportToPDF(id);
    res.header('Content-Type', 'application/pdf');
    res.attachment(`entreprise-${id}-data.pdf`);
    return res.send(pdfBuffer);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.entrepriseService.remove(id, req.user.idUtilisateur);
  }

  @Post(':id/restore')
  @Roles(Role.ADMIN)
  async restore(@Param('id') id: string) {
    return this.entrepriseService.restore(id);
  }
}