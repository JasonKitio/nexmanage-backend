import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Entreprise } from './entities/entreprise.entity';
import { Utilisateur } from '../User/entities/utilisateur.entity';
import { UtilisateurEntreprise } from '../UtilisateurEntreprise/entities/utilisateur-entreprise.entity';
import { CreateEntrepriseDto } from './dto/create-entreprise.dto';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { PaginationDto } from './dto/pagination.dto';
import { Role } from '../utils/enums/enums';
import * as PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { TwilioService } from 'src/twillio/twillio.service';


@Injectable()
export class EntrepriseService {
  constructor(
    @InjectRepository(Entreprise)
    private entrepriseRepository: Repository<Entreprise>,
    @InjectRepository(Utilisateur)
    private utilisateurRepository: Repository<Utilisateur>,
    @InjectRepository(UtilisateurEntreprise)
    private utilisateurEntrepriseRepository: Repository<UtilisateurEntreprise>,
     private twilioService: TwilioService,
  ) {}

async createEntreprise(createEntrepriseDto: CreateEntrepriseDto, adminId: string) {
  // Vérifier que l'utilisateur existe et est un admin
  const admin = await this.utilisateurRepository.findOne({
    where: { idUtilisateur: adminId, role: Role.ADMIN },
  });
  if (!admin) {
    throw new NotFoundException('Administrateur introuvable');
  }

  // Créer l'entreprise
  const entreprise = this.entrepriseRepository.create({
    nom: createEntrepriseDto.nom,
    domaine: createEntrepriseDto.domaine,
    adresse: createEntrepriseDto.adresse,
    email: createEntrepriseDto.email,
    nbre_employers: createEntrepriseDto.nbre_employers,
  });
  
  const savedEntreprise = await this.entrepriseRepository.save(entreprise);

  // Associer l'admin créateur comme gérant de l'entreprise
  const utilisateurEntreprise = this.utilisateurEntrepriseRepository.create({
    utilisateur: admin,
    entreprise: savedEntreprise,
    isOwner: true,
  });
  
  await this.utilisateurEntrepriseRepository.save(utilisateurEntreprise);

  return {
    message: 'Entreprise créée avec succès',
    entreprise: savedEntreprise,
    gerant: admin.nom,
  };
}

async assignManager(
  entrepriseId: string, 
  newManagerId: string, 
  currentUserId: string,
  currentUserRole: Role
) {
  // Vérifier que l'entreprise existe
  const entreprise = await this.entrepriseRepository.findOne({
    where: { idEntreprise: entrepriseId },
  });
  if (!entreprise) {
    throw new NotFoundException('Entreprise introuvable');
  }

  // Vérifier que le nouveau gérant existe et a le bon rôle
  const newManager = await this.utilisateurRepository.findOne({
    where: { 
      idUtilisateur: newManagerId, 
      role: Role.MANAGER 
    },
  });
  if (!newManager) {
    throw new NotFoundException('Nouveau gérant introuvable ou rôle invalide');
  }

  // Si l'utilisateur actuel n'est pas admin, vérifier qu'il est le gérant actuel
  if (currentUserRole !== Role.ADMIN) {
    const currentManagerAssociation = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: currentUserId },
        entreprise: { idEntreprise: entrepriseId },
        isOwner: true,
      },
    });
    
    if (!currentManagerAssociation) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à modifier le gérant de cette entreprise');
    }
  }

  // Retirer le statut de gérant à l'ancien gérant
  await this.utilisateurEntrepriseRepository.update(
    { 
      entreprise: { idEntreprise: entrepriseId },
      isOwner: true 
    },
    { isOwner: false }
  );

  // Vérifier si le nouveau gérant est déjà associé à l'entreprise
  let managerAssociation = await this.utilisateurEntrepriseRepository.findOne({
    where: {
      utilisateur: { idUtilisateur: newManagerId },
      entreprise: { idEntreprise: entrepriseId },
    },
  });

  if (managerAssociation) {
    // Mettre à jour l'association existante
    managerAssociation.isOwner = true;
    await this.utilisateurEntrepriseRepository.save(managerAssociation);
  } else {
    // Créer une nouvelle association
    managerAssociation = this.utilisateurEntrepriseRepository.create({
      utilisateur: newManager,
      entreprise: entreprise,
      isOwner: true,
    });
    await this.utilisateurEntrepriseRepository.save(managerAssociation);
  }

  return {
    message: 'Gérant affecté avec succès',
    entreprise: entreprise.nom,
    nouveauGerant: newManager.nom,
  };
}

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [entreprises, total] = await this.entrepriseRepository.findAndCount({
      where: { delete_at: IsNull() },
      relations: ['utilisateurs', 'utilisateurs.utilisateur'],
      skip,
      take: limit,
      order: { dateCreation: 'DESC' },
    });

    return {
      data: entreprises,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllDeleted(paginationDto: PaginationDto) {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [entreprises, total] = await this.entrepriseRepository.findAndCount({
      where: { delete_at: Not(IsNull()) },
      withDeleted: true,
      relations: ['utilisateurs', 'utilisateurs.utilisateur'],
      skip,
      take: limit,
      order: { delete_at: 'DESC' },
    });

    return {
      data: entreprises,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: id, delete_at: IsNull() },
      relations: ['utilisateurs', 'utilisateurs.utilisateur'],
    });

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable');
    }

    return entreprise;
  }

  async getUsersByEntreprise(id: string, paginationDto: PaginationDto) {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const entreprise = await this.findOne(id);

    const [utilisateurs, total] = await this.utilisateurEntrepriseRepository.findAndCount({
      where: { entreprise: { idEntreprise: id } },
      relations: ['utilisateur'],
      skip,
      take: limit,
      order: { dateAjout: 'DESC' },
    });

    return {
      entreprise: entreprise.nom,
      data: utilisateurs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, updateEntrepriseDto: UpdateEntrepriseDto, userId: string) {
    const entreprise = await this.findOne(id);

    // Vérifier les permissions
    await this.checkUserPermissions(id, userId);

    Object.assign(entreprise, updateEntrepriseDto);
    const updatedEntreprise = await this.entrepriseRepository.save(entreprise);

    return {
      message: 'Entreprise mise à jour avec succès',
      entreprise: updatedEntreprise,
    };
  }

// Dans votre service d'entreprise
async inviteUser(id: string, inviteUserDto: InviteUserDto, inviterId: string) {
  const entreprise = await this.findOne(id);
 
  // Vérifier les permissions
  await this.checkUserPermissions(id, inviterId);
  
  // Vérifier que l'utilisateur existe
  const user = await this.utilisateurRepository.findOne({
    where: { idUtilisateur: inviteUserDto.userId },
  });
  if (!user) {
    throw new NotFoundException('Utilisateur introuvable');
  }
  
  // Vérifier si l'utilisateur n'est pas déjà dans l'entreprise
  const existingRelation = await this.utilisateurEntrepriseRepository.findOne({
    where: {
      utilisateur: { idUtilisateur: inviteUserDto.userId },
      entreprise: { idEntreprise: id },
    },
  });
  if (existingRelation) {
    throw new BadRequestException('Utilisateur déjà membre de cette entreprise');
  }
  
  // L'utilisateur a déjà un compte avec ses identifiants
  
  // Créer la relation
  const utilisateurEntreprise = this.utilisateurEntrepriseRepository.create({
    utilisateur: user,
    entreprise,
    isOwner: false,
  });
  await this.utilisateurEntrepriseRepository.save(utilisateurEntreprise);
  
  // Préparer le message SMS avec les identifiants existants
  const messageSMS = `
🎉 Félicitations ${user.nom} !

Vous avez été invité(e) à rejoindre l'entreprise "${entreprise.nom}".

Vos identifiants de connexion :
📱 Téléphone : ${user.telephone}
🔐 Mot de passe : ${user.motDePasse}

Connectez-vous dès maintenant pour accéder à votre nouvelle entreprise.

Bienvenue dans l'équipe ! 🚀
  `.trim();
  
  // Envoyer le SMS
  try {
    await this.twilioService.sendSMS(user.telephone, messageSMS);
  } catch (error) {
    // Log l'erreur mais ne pas faire échouer l'invitation
    console.error('Erreur lors de l\'envoi du SMS:', error);
    // Optionnel: vous pourriez vouloir supprimer la relation créée si le SMS échoue
  }
  
  return {
    message: 'Utilisateur invité avec succès et SMS envoyé',
    user: user.nom,
    entreprise: entreprise.nom,
    smsEnvoye: true
  };
}

// Méthodes utilitaires pour le service SMS (optionnelles)
generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
  async transferOwnership(
    id: string,
    transferOwnershipDto: TransferOwnershipDto,
    currentOwnerId: string,
  ) {
    const entreprise = await this.findOne(id);

    // Vérifier que l'utilisateur actuel est le propriétaire
    const currentOwnerRelation = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: currentOwnerId },
        entreprise: { idEntreprise: id },
        isOwner: true,
      },
    });

    if (!currentOwnerRelation) {
      throw new ForbiddenException('Seul le propriétaire peut transférer la propriété');
    }

    // Vérifier que le nouveau propriétaire existe et est membre de l'entreprise
    const newOwnerRelation = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: transferOwnershipDto.newOwnerId },
        entreprise: { idEntreprise: id },
      },
      relations: ['utilisateur'],
    });

    if (!newOwnerRelation) {
      throw new NotFoundException('Nouveau propriétaire introuvable dans cette entreprise');
    }

    // Transférer la propriété
    currentOwnerRelation.isOwner = false;
    newOwnerRelation.isOwner = true;

    await this.utilisateurEntrepriseRepository.save([currentOwnerRelation, newOwnerRelation]);

    return {
      message: 'Propriété transférée avec succès',
      newOwner: newOwnerRelation.utilisateur.nom,
      entreprise: entreprise.nom,
    };
  }

  async exportToCSV(id: string): Promise<string> {
    const entreprise = await this.findOne(id);
    const utilisateurs = await this.getUsersByEntreprise(id, { page: 1, limit: 1000 });

    let csvContent = 'Nom,Email,Téléphone,Rôle,Propriétaire,Date d\'ajout\n';
    
    utilisateurs.data.forEach((ue) => {
      const user = ue.utilisateur;
      csvContent += `"${user.nom}","${user.email}","${user.telephone}","${user.role}","${ue.isOwner ? 'Oui' : 'Non'}","${ue.dateAjout}"\n`;
    });

    return csvContent;
  }

  async exportToPDF(id: string): Promise<Buffer> {
    const entreprise = await this.findOne(id);
    const utilisateurs = await this.getUsersByEntreprise(id, { page: 1, limit: 1000 });

    return new Promise((resolve) => {
      const doc = new PDFDocument();
      const buffers: any[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // En-tête
      doc.fontSize(20).text(`Entreprise: ${entreprise.nom}`, 100, 100);
      doc.fontSize(12).text(`Domaine: ${entreprise.domaine}`, 100, 130);
      doc.text(`Adresse: ${entreprise.adresse}`, 100, 150);
      doc.text(`Email: ${entreprise.email}`, 100, 170);
      doc.text(`Nombre d'employés: ${entreprise.nbre_employers}`, 100, 190);

      // Liste des utilisateurs
      doc.fontSize(16).text('Utilisateurs:', 100, 230);
      let yPosition = 260;

      utilisateurs.data.forEach((ue) => {
        const user = ue.utilisateur;
        doc.fontSize(10).text(
          `${user.nom} - ${user.email} - ${user.role} - ${ue.isOwner ? 'Propriétaire' : 'Membre'}`,
          100,
          yPosition,
        );
        yPosition += 20;
      });

      doc.end();
    });
  }

  async remove(id: string, userId: string) {
    const entreprise = await this.findOne(id);

    // Vérifier les permissions
    await this.checkUserPermissions(id, userId);

    // Soft delete
    entreprise.delete_at = new Date();
    await this.entrepriseRepository.save(entreprise);

    return {
      message: 'Entreprise supprimée avec succès',
      entreprise: entreprise.nom,
    };
  }

  async restore(id: string) {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: id },
      withDeleted: true,
    });

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable');
    }

    if (!entreprise.delete_at) {
      throw new BadRequestException('Cette entreprise n\'est pas supprimée');
    }

    entreprise.delete_at = null;
    await this.entrepriseRepository.save(entreprise);

    return {
      message: 'Entreprise restaurée avec succès',
      entreprise: entreprise.nom,
    };
  }

  private async checkUserPermissions(entrepriseId: string, userId: string) {
    const user = await this.utilisateurRepository.findOne({
      where: { idUtilisateur: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Admin peut tout faire
    if (user.role === Role.ADMIN) {
      return;
    }

    // Vérifier si l'utilisateur est propriétaire de l'entreprise
    const userEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: userId },
        entreprise: { idEntreprise: entrepriseId },
        isOwner: true,
      },
    });

    if (!userEntreprise) {
      throw new ForbiddenException('Accès refusé: permissions insuffisantes');
    }
  }

  // Méthode à ajouter dans votre EntrepriseService

async getMyCompanies(userId: string, paginationDto: PaginationDto) {
  const { page = 1, limit = 10 } = paginationDto;
  const skip = (page - 1) * limit;

  // Vérifier que l'utilisateur existe
  const user = await this.utilisateurRepository.findOne({
    where: { idUtilisateur: userId },
  });
  
  if (!user) {
    throw new NotFoundException('Utilisateur introuvable');
  }

  // Récupérer toutes les entreprises où l'utilisateur est propriétaire
  const [userCompanies, total] = await this.utilisateurEntrepriseRepository.findAndCount({
    where: {
      utilisateur: { idUtilisateur: userId },
      isOwner: true,
      entreprise: { delete_at: IsNull() }, // Exclure les entreprises supprimées
    },
    relations: [
      'entreprise',
      'entreprise.utilisateurs',
      'entreprise.utilisateurs.utilisateur'
    ],
    skip,
    take: limit,
    order: { dateAjout: 'DESC' },
  });

  // Formater les données pour inclure les informations des entreprises avec leurs utilisateurs
  const companiesWithUsers = userCompanies.map(userCompany => {
    const entreprise = userCompany.entreprise;
    
    // Compter le nombre total d'utilisateurs dans l'entreprise
    const totalUsers = entreprise.utilisateurs?.length || 0;
    
    // Séparer le propriétaire des autres utilisateurs
    const owner = entreprise.utilisateurs?.find(ue => ue.isOwner === true);
    const employees = entreprise.utilisateurs?.filter(ue => ue.isOwner === false) || [];

    return {
      id: entreprise.idEntreprise,
      nom: entreprise.nom,
      domaine: entreprise.domaine,
      adresse: entreprise.adresse,
      email: entreprise.email,
      nbre_employers: entreprise.nbre_employers,
      dateCreation: entreprise.dateCreation,
      totalUsers,
      owner: owner ? {
        id: owner.utilisateur.idUtilisateur,
        nom: owner.utilisateur.nom,
        email: owner.utilisateur.email,
        telephone: owner.utilisateur.telephone,
        role: owner.utilisateur.role,
        dateAjout: owner.dateAjout,
      } : null,
      employees: employees.map(emp => ({
        id: emp.utilisateur.idUtilisateur,
        nom: emp.utilisateur.nom,
        email: emp.utilisateur.email,
        telephone: emp.utilisateur.telephone,
        role: emp.utilisateur.role,
        dateAjout: emp.dateAjout,
      })),
    };
  });

  return {
    message: 'Mes entreprises récupérées avec succès',
    data: companiesWithUsers,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      userInfo: {
        id: user.idUtilisateur,
        nom: user.nom,
        email: user.email,
        role: user.role,
      },
    },
  };
}
}