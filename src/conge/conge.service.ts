import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conge } from './entities/conge.entity';
import { Utilisateur } from 'src/User/entities/utilisateur.entity';
import { UtilisateurEntreprise } from 'src/UtilisateurEntreprise/entities/utilisateur-entreprise.entity';
import { CreateCongeDto } from './dto/create-conge.dto';
import { UpdateStatutCongeDto } from './dto/update-statut-conge';
import { StatutConge } from 'src/utils/enums/enums';
import { NotificationService } from './notification.service';

@Injectable()
export class CongeService {
  constructor(
    @InjectRepository(Conge)
    private congeRepository: Repository<Conge>,
    @InjectRepository(Utilisateur)
    private utilisateurRepository: Repository<Utilisateur>,
    @InjectRepository(UtilisateurEntreprise)
    private utilisateurEntrepriseRepository: Repository<UtilisateurEntreprise>,
    private notificationService: NotificationService,
  ) {}

  // Calculer la durée en jours entre deux dates
  private calculateDuration(dateDebut: Date, dateFin: Date): number {
    const startDate = new Date(dateDebut);
    const endDate = new Date(dateFin);
    const timeDifference = endDate.getTime() - startDate.getTime();
    const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24)) + 1;
    return daysDifference;
  }

  // Créer une demande de congé
  async createConge(userId: string, createCongeDto: CreateCongeDto): Promise<Conge> {
    const utilisateur = await this.utilisateurRepository.findOne({
      where: { idUtilisateur: userId },
      relations: ['entreprises', 'entreprises.entreprise'],
    });

    if (!utilisateur) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const utilisateurEntreprise = utilisateur.entreprises?.[0];
    if (!utilisateurEntreprise) {
      throw new ForbiddenException('Utilisateur non associé à une entreprise');
    }

    // Valider les dates
    const dateDebut = new Date(createCongeDto.dateDebut);
    const dateFin = new Date(createCongeDto.dateFin);

    if (dateDebut >= dateFin) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début');
    }

    if (dateDebut < new Date()) {
      throw new BadRequestException('La date de début ne peut pas être dans le passé');
    }

    // Calculer la durée
    const dureeJours = this.calculateDuration(dateDebut, dateFin);

    // Créer la demande de congé
    const conge = this.congeRepository.create({
      motif: createCongeDto.motif,
      dateDebut,
      dateFin,
      dureeJours,
      utilisateur,
      statut: StatutConge.EN_ATTENTE,
    });

    const savedConge = await this.congeRepository.save(conge);

    // Notifier les admins de l'entreprise
    await this.notifyCompanyAdmins(utilisateur.idUtilisateur, utilisateurEntreprise.entreprise.idEntreprise, savedConge);

    return savedConge;
  }

  // Notifier les administrateurs de l'entreprise
  private async notifyCompanyAdmins(expediteurId: string, entrepriseId: string, conge: Conge): Promise<void> {
    // Récupérer tous les admins de l'entreprise
    const admins = await this.utilisateurEntrepriseRepository.find({
      where: {
        entreprise: { idEntreprise: entrepriseId },
        isOwner: true,
      },
      relations: ['utilisateur'],
    });

    // Préparer les données de notification
    const adminIds = admins.map(admin => admin.utilisateur.idUtilisateur);
    const title = 'Nouvelle demande de congé';
    const message = `${conge.utilisateur.nom} ${conge.utilisateur.email} a fait une demande de congé du ${conge.dateDebut.toLocaleDateString()} au ${conge.dateFin.toLocaleDateString()} (${conge.dureeJours} jours)`;

    // Envoyer les notifications à tous les admins
    await this.notificationService.sendNotificationToMultipleUsers(
      expediteurId,
      adminIds,
      title,
      message,
      'CONGE_REQUEST',
      { 
        congeId: conge.id,
        motif: conge.motif,
        dateDebut: conge.dateDebut,
        dateFin: conge.dateFin,
        dureeJours: conge.dureeJours,
        utilisateurNom: `${conge.utilisateur.nom} ${conge.utilisateur.email}`
      }
    );
  }

  // Obtenir toutes les demandes de congé pour une entreprise
  async getCongesByEntreprise(userId: string): Promise<Conge[]> {
    const utilisateurEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: userId },
        isOwner: true,
      },
      relations: ['entreprise'],
    });

    if (!utilisateurEntreprise) {
      throw new ForbiddenException('Accès non autorisé - Admin requis');
    }

    return await this.congeRepository.find({
      where: {
        utilisateur: {
          entreprises: {
            entreprise: { idEntreprise: utilisateurEntreprise.entreprise.idEntreprise }
          }
        }
      },
      relations: ['utilisateur'],
      order: { dateCreation: 'DESC' },
    });
  }

  // Obtenir une demande de congé spécifique par ID
  async getCongeById(userId: string, congeId: string): Promise<Conge> {
    const utilisateurEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: userId },
        isOwner: true,
      },
      relations: ['entreprise'],
    });

    if (!utilisateurEntreprise) {
      throw new ForbiddenException('Accès non autorisé - Admin requis');
    }

    const conge = await this.congeRepository.findOne({
      where: { id: congeId },
      relations: ['utilisateur', 'utilisateur.entreprises', 'utilisateur.entreprises.entreprise'],
    });

    if (!conge) {
      throw new NotFoundException('Demande de congé non trouvée');
    }

    const congeEntreprise = conge.utilisateur.entreprises?.find(
      ue => ue.entreprise.idEntreprise === utilisateurEntreprise.entreprise.idEntreprise
    );

    if (!congeEntreprise) {
      throw new ForbiddenException('Cette demande de congé n\'appartient pas à votre entreprise');
    }

    return conge;
  }

  // Approuver ou refuser une demande de congé
  async updateStatutConge(
    adminId: string,
    congeId: string,
    updateStatutDto: UpdateStatutCongeDto,
  ): Promise<Conge> {
    const conge = await this.getCongeById(adminId, congeId);

    if (conge.statut !== StatutConge.EN_ATTENTE) {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }

    if (updateStatutDto.statut === StatutConge.REFUSE && !updateStatutDto.motifRefus) {
      throw new BadRequestException('Le motif de refus est obligatoire');
    }

    // Mettre à jour le statut
    conge.statut = updateStatutDto.statut;
    if (updateStatutDto.motifRefus) {
      conge.motifRefus = updateStatutDto.motifRefus;
    }

    const updatedConge = await this.congeRepository.save(conge);

    // Notifier l'employé du résultat
    const title = updateStatutDto.statut === StatutConge.ACCEPTE
      ? 'Demande de congé acceptée'
      : 'Demande de congé refusée';

    const message = updateStatutDto.statut === StatutConge.ACCEPTE
      ? `Votre demande de congé du ${conge.dateDebut.toLocaleDateString()} au ${conge.dateFin.toLocaleDateString()} a été acceptée`
      : `Votre demande de congé du ${conge.dateDebut.toLocaleDateString()} au ${conge.dateFin.toLocaleDateString()} a été refusée. Motif: ${updateStatutDto.motifRefus}`;

    await this.notificationService.sendNotification(
      adminId,
      conge.utilisateur.idUtilisateur,
      title,
      message,
      'CONGE_RESPONSE',
      { 
        congeId: conge.id,
        statut: updateStatutDto.statut,
        motifRefus: updateStatutDto.motifRefus,
        dateDebut: conge.dateDebut,
        dateFin: conge.dateFin
      }
    );

    return updatedConge;
  }

  // Supprimer (soft delete) une demande de congé
  async deleteConge(adminId: string, congeId: string): Promise<void> {
    const conge = await this.getCongeById(adminId, congeId);
    await this.congeRepository.softDelete(conge.id);
  }

  // Restaurer une demande de congé supprimée
  async restoreConge(adminId: string, congeId: string): Promise<Conge> {
    const utilisateurEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: adminId },
        isOwner: true,
      },
      relations: ['entreprise'],
    });

    if (!utilisateurEntreprise) {
      throw new ForbiddenException('Accès non autorisé - Admin requis');
    }

    await this.congeRepository.restore(congeId);
    return await this.getCongeById(adminId, congeId);
  }

  // Obtenir les congés d'un employé spécifique
  async getMesConges(userId: string): Promise<Conge[]> {
    return await this.congeRepository.find({
      where: { utilisateur: { idUtilisateur: userId } },
      order: { dateCreation: 'DESC' },
    });
  }
}
