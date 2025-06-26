import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common"
import  { Repository } from "typeorm"
import  { Conge } from "./entities/conge.entity"
import  { Utilisateur } from "src/User/entities/utilisateur.entity"
import  { UtilisateurEntreprise } from "../UtilisateurEntreprise/entities/utilisateur-entreprise.entity"
import  { Entreprise } from "../entreprise/entities/entreprise.entity"
import  { CreateCongeDto } from "./dto/create-conge.dto"
import  { UpdateStatutCongeDto } from "./dto/update-statut-conge"
import { StatutConge } from "src/utils/enums/enums"
import  { NotificationService } from "./notification.service"
import * as ExcelJS from "exceljs"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class CongeService {
  constructor(
    @InjectRepository(Conge)
    private readonly congeRepository: Repository<Conge>,
    @InjectRepository(Utilisateur)
    private readonly utilisateurRepository: Repository<Utilisateur>,
    @InjectRepository(UtilisateurEntreprise)
    private  readonly utilisateurEntrepriseRepository: Repository<UtilisateurEntreprise>,
    @InjectRepository(Entreprise)
    private readonly entrepriseRepository: Repository<Entreprise>,
    private notificationService: NotificationService,
  ) {}

  // MÉTHODES POUR LES CONGÉS PAR ENTREPRISE

  // Créer une demande de congé pour une entreprise
// Dans votre CongeService

async createCongeForEntreprise(entrepriseId: string, userId: string, createCongeDto: CreateCongeDto): Promise<Conge> {
  // AJOUT: Vérification en début de méthode
  if (!userId) {
    throw new BadRequestException('userId ne peut pas être null ou undefined');
  }
  
  if (!entrepriseId) {
    throw new BadRequestException('entrepriseId ne peut pas être null ou undefined');
  }

  console.log('Debug - userId reçu:', userId);
  console.log('Debug - entrepriseId reçu:', entrepriseId);

  // Vérifier que l'entreprise existe
  const entreprise = await this.entrepriseRepository.findOne({
    where: { idEntreprise: entrepriseId },
  })
  if (!entreprise) {
    throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
  }
 
  // Vérifier que l'utilisateur appartient à l'entreprise
  await this.validateUserInEntreprise(userId, entrepriseId)
 
  const utilisateur = await this.utilisateurRepository.findOne({
    where: { idUtilisateur: userId },
  })
  if (!utilisateur) {
    throw new NotFoundException("Utilisateur non trouvé")
  }
 
  // Valider les dates
  const dateDebut = new Date(createCongeDto.dateDebut)
  const dateFin = new Date(createCongeDto.dateFin)
  if (dateDebut >= dateFin) {
    throw new BadRequestException("La date de fin doit être postérieure à la date de début")
  }
  if (dateDebut < new Date()) {
    throw new BadRequestException("La date de début ne peut pas être dans le passé")
  }
 
  // Vérifier les conflits avec d'autres congés approuvés
  await this.checkCongeConflict(userId, entrepriseId, dateDebut, dateFin)
 
  // Calculer la durée
  const dureeJours = this.calculateDuration(dateDebut, dateFin)
 
  // Créer la demande de congé
  const conge = this.congeRepository.create({
    motif: createCongeDto.motif,
    dateDebut,
    dateFin,
    dureeJours,
    utilisateur,
    entreprise,
    entrepriseId,
    statut: StatutConge.EN_ATTENTE,
  })
 
  const savedConge = await this.congeRepository.save(conge)
 
  // Notifier les admins de l'entreprise
  await this.notifyCompanyAdminsForEntreprise(userId, entrepriseId, savedConge);
 
  return savedConge
}

  // Obtenir toutes les demandes de congé d'une entreprise
  async getCongesByEntreprise(entrepriseId: string): Promise<Conge[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return await this.congeRepository.find({
      where: { entrepriseId: entrepriseId },
      relations: ["utilisateur", "entreprise"],
      order: { dateCreation: "DESC" },
    })
  }

  // Obtenir une demande de congé spécifique d'une entreprise
  async getCongeByIdForEntreprise(entrepriseId: string, congeId: string): Promise<Conge> {
    const conge = await this.congeRepository.findOne({
      where: {
        id: congeId,
        entrepriseId: entrepriseId,
      },
      relations: ["utilisateur", "entreprise"],
    })

    if (!conge) {
      throw new NotFoundException("Demande de congé non trouvée pour cette entreprise")
    }

    return conge
  }

  // Obtenir les congés d'un utilisateur dans une entreprise
  async getMesCongesInEntreprise(entrepriseId: string, userId: string): Promise<Conge[]> {
    await this.validateUserInEntreprise(userId, entrepriseId)

    return await this.congeRepository.find({
      where: {
        utilisateur: { idUtilisateur: userId },
        entrepriseId: entrepriseId,
      },
      relations: ["entreprise"],
      order: { dateCreation: "DESC" },
    })
  }

  // Approuver ou refuser une demande de congé dans une entreprise
  async updateStatutCongeForEntreprise(
    entrepriseId: string,
    adminId: string,
    congeId: string,
    updateStatutDto: UpdateStatutCongeDto,
  ): Promise<Conge> {
    // Vérifier que l'admin appartient à l'entreprise et est admin
    await this.validateAdminInEntreprise(adminId, entrepriseId)

    const conge = await this.getCongeByIdForEntreprise(entrepriseId, congeId)

    if (conge.statut !== StatutConge.EN_ATTENTE) {
      throw new BadRequestException("Cette demande a déjà été traitée")
    }

    if (updateStatutDto.statut === StatutConge.REFUSE && !updateStatutDto.motifRefus) {
      throw new BadRequestException("Le motif de refus est obligatoire")
    }

    // Mettre à jour le statut
    conge.statut = updateStatutDto.statut
    if (updateStatutDto.motifRefus) {
      conge.motifRefus = updateStatutDto.motifRefus
    }

    const updatedConge = await this.congeRepository.save(conge)

    // Notifier l'employé du résultat
    await this.notifyEmployeeDecision(adminId, updatedConge, updateStatutDto)

    return updatedConge
  }

  // Supprimer une demande de congé dans une entreprise
  async deleteCongeForEntreprise(entrepriseId: string, adminId: string, congeId: string): Promise<void> {
    await this.validateAdminInEntreprise(adminId, entrepriseId)
    const conge = await this.getCongeByIdForEntreprise(entrepriseId, congeId)
    await this.congeRepository.softDelete(conge.id)
  }

  // Restaurer une demande de congé dans une entreprise
  async restoreCongeForEntreprise(entrepriseId: string, adminId: string, congeId: string): Promise<Conge> {
    await this.validateAdminInEntreprise(adminId, entrepriseId)
    await this.congeRepository.restore(congeId)
    return await this.getCongeByIdForEntreprise(entrepriseId, congeId)
  }

  // Obtenir les congés par statut dans une entreprise
  async getCongesByStatutForEntreprise(entrepriseId: string, statut: StatutConge): Promise<Conge[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return await this.congeRepository.find({
      where: {
        entrepriseId: entrepriseId,
        statut: statut,
      },
      relations: ["utilisateur", "entreprise"],
      order: { dateCreation: "DESC" },
    })
  }

  // Obtenir les congés par période dans une entreprise
  async getCongesByPeriodForEntreprise(entrepriseId: string, dateDebut: Date, dateFin: Date): Promise<Conge[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return await this.congeRepository
      .createQueryBuilder("conge")
      .leftJoinAndSelect("conge.utilisateur", "utilisateur")
      .leftJoinAndSelect("conge.entreprise", "entreprise")
      .where("conge.entrepriseId = :entrepriseId", { entrepriseId })
      .andWhere("(conge.dateDebut BETWEEN :dateDebut AND :dateFin OR conge.dateFin BETWEEN :dateDebut AND :dateFin)", {
        dateDebut,
        dateFin,
      })
      .orderBy("conge.dateDebut", "ASC")
      .getMany()
  }

  // Obtenir les statistiques des congés d'une entreprise
  async getStatistiquesCongesEntreprise(entrepriseId: string): Promise<any> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const totalConges = await this.congeRepository.count({
      where: { entrepriseId: entrepriseId },
    })

    const congesParStatut = await this.congeRepository
      .createQueryBuilder("conge")
      .select("conge.statut", "statut")
      .addSelect("COUNT(*)", "count")
      .where("conge.entrepriseId = :entrepriseId", { entrepriseId })
      .groupBy("conge.statut")
      .getRawMany()

    const congesEnAttente = await this.congeRepository.count({
      where: { entrepriseId: entrepriseId, statut: StatutConge.EN_ATTENTE },
    })

    const totalJoursConges = await this.congeRepository
      .createQueryBuilder("conge")
      .select("SUM(conge.dureeJours)", "total")
      .where("conge.entrepriseId = :entrepriseId", { entrepriseId })
      .andWhere("conge.statut = :statut", { statut: StatutConge.ACCEPTE })
      .getRawOne()

    const congesCeMois = await this.congeRepository.count({
      where: {
        entrepriseId: entrepriseId,
        dateCreation: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      },
    })

    return {
      entreprise: {
        id: entreprise.idEntreprise,
        nom: entreprise.nom,
      },
      totalConges,
      congesParStatut,
      congesEnAttente,
      totalJoursConges: Number.parseInt(totalJoursConges.total) || 0,
      congesCeMois,
    }
  }

  // Exporter les congés d'une entreprise
  async exportCongesEntreprise(entrepriseId: string): Promise<Buffer> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const conges = await this.congeRepository.find({
      where: { entrepriseId: entrepriseId },
      relations: ["utilisateur", "entreprise"],
      order: { dateCreation: "DESC" },
    })

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Congés")

    // En-têtes
    worksheet.columns = [
      { header: "ID", key: "id", width: 40 },
      { header: "Employé", key: "employe", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Motif", key: "motif", width: 50 },
      { header: "Date début", key: "dateDebut", width: 15 },
      { header: "Date fin", key: "dateFin", width: 15 },
      { header: "Durée (jours)", key: "dureeJours", width: 15 },
      { header: "Statut", key: "statut", width: 15 },
      { header: "Motif refus", key: "motifRefus", width: 50 },
      { header: "Date demande", key: "dateCreation", width: 20 },
    ]

    // Données
    conges.forEach((conge) => {
      worksheet.addRow({
        id: conge.id,
        employe: conge.utilisateur.nom,
        email: conge.utilisateur.email,
        motif: conge.motif,
        dateDebut: conge.dateDebut.toLocaleDateString("fr-FR"),
        dateFin: conge.dateFin.toLocaleDateString("fr-FR"),
        dureeJours: conge.dureeJours,
        statut: conge.statut,
        motifRefus: conge.motifRefus || "",
        dateCreation: conge.dateCreation.toLocaleDateString("fr-FR"),
      })
    })

    // Style de l'en-tête
    worksheet.getRow(1).font = { bold: true }
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    }

    // Colorer les lignes selon le statut
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const statut = row.getCell(8).value
        if (statut === StatutConge.ACCEPTE) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8F5E8" },
          }
        } else if (statut === StatutConge.REFUSE) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFEAEA" },
          }
        } else if (statut === StatutConge.EN_ATTENTE) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF4E6" },
          }
        }
      }
    })

    return (await workbook.xlsx.writeBuffer()) as Buffer
  }

  // Obtenir le planning des congés d'une entreprise
  async getPlanningCongesEntreprise(entrepriseId: string, annee: number): Promise<any> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const debutAnnee = new Date(annee, 0, 1)
    const finAnnee = new Date(annee, 11, 31)

    const congesAcceptes = await this.congeRepository.find({
      where: {
        entrepriseId: entrepriseId,
        statut: StatutConge.ACCEPTE,
        dateDebut: debutAnnee,
        dateFin: finAnnee,
      },
      relations: ["utilisateur"],
      order: { dateDebut: "ASC" },
    })

    // Grouper par mois
    const planningParMois = {}
    for (let mois = 0; mois < 12; mois++) {
      planningParMois[mois + 1] = []
    }

    congesAcceptes.forEach((conge) => {
      const moisDebut = conge.dateDebut.getMonth() + 1
      const moisFin = conge.dateFin.getMonth() + 1

      // Si le congé s'étend sur plusieurs mois
      for (let mois = moisDebut; mois <= moisFin; mois++) {
        planningParMois[mois].push({
          id: conge.id,
          employe: conge.utilisateur.nom,
          email: conge.utilisateur.email,
          dateDebut: conge.dateDebut,
          dateFin: conge.dateFin,
          dureeJours: conge.dureeJours,
          motif: conge.motif,
        })
      }
    })

    return {
      entreprise: {
        id: entreprise.idEntreprise,
        nom: entreprise.nom,
      },
      annee,
      planningParMois,
      totalCongesAcceptes: congesAcceptes.length,
    }
  }

  // MÉTHODES PRIVÉES

  private async validateUserInEntreprise(userId: string, entrepriseId: string): Promise<void> {
    const userInEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: userId },
        entreprise: { idEntreprise: entrepriseId },
      },
    })

    if (!userInEntreprise) {
      throw new ForbiddenException("L'utilisateur n'appartient pas à cette entreprise")
    }
  }

  private async validateAdminInEntreprise(adminId: string, entrepriseId: string): Promise<void> {
    const adminInEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: adminId },
        entreprise: { idEntreprise: entrepriseId },
        isOwner: true,
      },
    })

    if (!adminInEntreprise) {
      throw new ForbiddenException("Accès non autorisé - Admin requis pour cette entreprise")
    }
  }

  private async checkCongeConflict(
    userId: string,
    entrepriseId: string,
    dateDebut: Date,
    dateFin: Date,
  ): Promise<void> {
    const conflictingConge = await this.congeRepository
      .createQueryBuilder("conge")
      .where("conge.utilisateur.idUtilisateur = :userId", { userId })
      .andWhere("conge.entrepriseId = :entrepriseId", { entrepriseId })
      .andWhere("conge.statut = :statut", { statut: StatutConge.ACCEPTE })
      .andWhere(
        "(conge.dateDebut BETWEEN :dateDebut AND :dateFin OR conge.dateFin BETWEEN :dateDebut AND :dateFin OR (:dateDebut BETWEEN conge.dateDebut AND conge.dateFin))",
        { dateDebut, dateFin },
      )
      .getOne()

    if (conflictingConge) {
      throw new BadRequestException(
        `Conflit détecté avec un congé déjà approuvé du ${conflictingConge.dateDebut.toLocaleDateString()} au ${conflictingConge.dateFin.toLocaleDateString()}`,
      )
    }
  }

  private calculateDuration(dateDebut: Date, dateFin: Date): number {
    const startDate = new Date(dateDebut)
    const endDate = new Date(dateFin)
    const timeDifference = endDate.getTime() - startDate.getTime()
    const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24)) + 1
    return daysDifference
  }

private async notifyCompanyAdminsForEntreprise(
  expediteurId: string,
  entrepriseId: string,
  conge: Conge,
): Promise<void> {
  console.log('Debug notifyCompanyAdminsForEntreprise:');
  console.log('Expediteur ID:', expediteurId);
  console.log('Entreprise ID:', entrepriseId);
  console.log('Conge ID:', conge.id);
 
  // Vérifications renforcées
  if (!expediteurId) {
    console.error('ERREUR: expediteurId est null/undefined');
    throw new Error('expediteurId ne peut pas être null ou undefined');
  }
  
  if (!entrepriseId) {
    console.error('ERREUR: entrepriseId est null/undefined');
    throw new Error('entrepriseId ne peut pas être null ou undefined');
  }

  if (!conge || !conge.id) {
    console.error('ERREUR: conge est null/undefined ou sans ID');
    throw new Error('conge ne peut pas être null ou undefined');
  }
 
  const admins = await this.utilisateurEntrepriseRepository.find({
    where: {
      entreprise: { idEntreprise: entrepriseId },
      isOwner: true,
    },
    relations: ["utilisateur"],
  })

  console.log('Admins trouvés:', admins.length);
 
  if (admins.length === 0) {
    console.warn('Aucun admin trouvé pour l\'entreprise', entrepriseId);
    return; // Pas d'erreur, juste un avertissement
  }

  const adminIds = admins.map((admin) => admin.utilisateur.idUtilisateur)
  console.log('Admin IDs:', adminIds);
 
  const title = "Nouvelle demande de congé"
  const message = `${conge.utilisateur.nom} ${conge.utilisateur.email} a fait une demande de congé du ${conge.dateDebut.toLocaleDateString()} au ${conge.dateFin.toLocaleDateString()} (${conge.dureeJours} jours)`
 
  try {
    await this.notificationService.sendNotificationToMultipleUsers(
      entrepriseId,
      expediteurId,
      adminIds,
      title,
      message,
      "CONGE_REQUEST",
      {
        congeId: conge.id,
        motif: conge.motif,
        dateDebut: conge.dateDebut,
        dateFin: conge.dateFin,
        dureeJours: conge.dureeJours,
        utilisateurNom: `${conge.utilisateur.nom} ${conge.utilisateur.email}`,
        entrepriseId: entrepriseId,
      },
    )
    console.log('Notifications envoyées avec succès');
  } catch (error) {
    // console.error('Erreur lors de l\'envoi des notifications:', error);
    // Ne pas faire échouer toute la création du congé pour un problème de notification
    // throw error; // Commentez cette ligne si vous ne voulez pas que ça fasse échouer la création
  }
}
  private async notifyEmployeeDecision(
    adminId: string,
    conge: Conge,
    updateStatutDto: UpdateStatutCongeDto,
  ): Promise<void> {
    const title =
      updateStatutDto.statut === StatutConge.ACCEPTE ? "Demande de congé acceptée" : "Demande de congé refusée"

    const message =
      updateStatutDto.statut === StatutConge.ACCEPTE
        ? `Votre demande de congé du ${conge.dateDebut.toLocaleDateString()} au ${conge.dateFin.toLocaleDateString()} a été acceptée`
        : `Votre demande de congé du ${conge.dateDebut.toLocaleDateString()} au ${conge.dateFin.toLocaleDateString()} a été refusée. Motif: ${updateStatutDto.motifRefus}`

    await this.notificationService.sendNotification(
      conge.entrepriseId,
      adminId,
      conge.utilisateur.idUtilisateur,
      title,
      message,
      "CONGE_RESPONSE",
      {
        congeId: conge.id,
        statut: updateStatutDto.statut,
        motifRefus: updateStatutDto.motifRefus,
        dateDebut: conge.dateDebut,
        dateFin: conge.dateFin,
        entrepriseId: conge.entrepriseId,
      },
    )
  }

//   
}