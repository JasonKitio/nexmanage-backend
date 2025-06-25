import { Injectable, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common"
import {  Repository, IsNull, Between, LessThanOrEqual, MoreThanOrEqual, In } from "typeorm"
import  { Contrat } from "./entities/contrat.entity"
import  { tache } from "../tache/entities/tache.entity"
import  { Utilisateur } from "../User/entities/utilisateur.entity"
import  { Presence } from "./../presence/entities/presence.entity"
import  { TwilioService } from "../twillio/twillio.service"
import { Cron } from "@nestjs/schedule"
import * as moment from "moment-timezone"
import  {
  CreateContractDto,
  UpdateContractDto,
  AddTaskToContractDto,
  PointageContratDto,
  SaveAsTemplateDto,
  CreateFromTemplateDto,
  CreateCommentDto,
} from "./dto/create-contrat.dto"
import { StatutTache } from "src/utils/enums/enums"
import  { Point } from "src/utils/types/type"
import  { Commentaire } from "src/commentaires/entities/commentaire.entity"
import  { UtilisateurEntreprise } from "../UtilisateurEntreprise/entities/utilisateur-entreprise.entity"
import  { Entreprise } from "../entreprise/entities/entreprise.entity"
import  { NotificationService } from "./configugation.service"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class ContractService {
constructor(
  @InjectRepository(Contrat)
  private readonly contractRepository: Repository<Contrat>,

  @InjectRepository(UtilisateurEntreprise)
  private readonly utilisateurEntrepriseRepository: Repository<UtilisateurEntreprise>,

  @InjectRepository(Entreprise)
  private readonly entrepriseRepository: Repository<Entreprise>,

  @InjectRepository(tache)
  private readonly tacheRepository: Repository<tache>,

  @InjectRepository(Utilisateur)
  private readonly utilisateurRepository: Repository<Utilisateur>,

  @InjectRepository(Presence)
  private readonly presenceRepository: Repository<Presence>,

  @InjectRepository(Commentaire)
  private readonly commentaireRepository: Repository<Commentaire>,

  private readonly twilioService: TwilioService,
  private readonly notificationService: NotificationService,
) {}
  // CRÉER UN CONTRAT POUR UNE ENTREPRISE SPÉCIFIQUE
  async createForEntreprise(
    entrepriseId: string,
    createContractDto: CreateContractDto,
    timezone = "Africa/Douala",
  ): Promise<Contrat[]> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    // Validation des dates
    this.validateContractDates(createContractDto.dateDebut, createContractDto.dateFin, timezone)

    const createdContracts: Contrat[] = []

    // Si plusieurs utilisateurs sont spécifiés, créer un contrat pour chacun
    if (createContractDto.utilisateursIds && createContractDto.utilisateursIds.length > 0) {
      // Vérifier que tous les utilisateurs appartiennent à cette entreprise
      await this.validateUsersInEntreprise(createContractDto.utilisateursIds, entrepriseId)

      for (const utilisateurId of createContractDto.utilisateursIds) {
        const contract = await this.createSingleContractForEntreprise(
          entreprise,
          {
            ...createContractDto,
            utilisateurId,
          },
          timezone,
        )
        createdContracts.push(...contract)
      }
    } else {
      // Créer un contrat sans utilisateur assigné
      const contract = await this.createSingleContractForEntreprise(entreprise, createContractDto, timezone)
      createdContracts.push(...contract)
    }

    return createdContracts
  }

  // OBTENIR TOUS LES CONTRATS D'UNE ENTREPRISE
  async getContractsByEntreprise(entrepriseId: string): Promise<Contrat[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return this.contractRepository.find({
      where: {
        entreprise: { idEntreprise: entrepriseId },
        estGabarit: false,
      },
      relations: ["utilisateur", "taches", "presence", "comment", "entreprise"],
      order: { dateCreation: "DESC" },
    })
  }

  // OBTENIR UN CONTRAT SPÉCIFIQUE D'UNE ENTREPRISE
  async getContractByEntreprise(entrepriseId: string, contractId: string): Promise<Contrat> {
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["utilisateur", "taches", "presence", "comment", "entreprise"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    return contract
  }

  // METTRE À JOUR UN CONTRAT D'UNE ENTREPRISE
  async updateContractForEntreprise(
    entrepriseId: string,
    contractId: string,
    updateContractDto: UpdateContractDto,
    timezone = "Africa/Douala",
  ): Promise<Contrat> {
    const contract = await this.getContractByEntreprise(entrepriseId, contractId)

    // Vérifier que les utilisateurs appartiennent à l'entreprise si fournis
    if (updateContractDto.utilisateursIds && updateContractDto.utilisateursIds.length > 0) {
      await this.validateUsersInEntreprise(updateContractDto.utilisateursIds, entrepriseId)
    }

    const updatedData = { ...contract }

    // Mettre à jour les utilisateurs si fournis
    if (updateContractDto.utilisateursIds && updateContractDto.utilisateursIds.length > 0) {
      const users = await this.utilisateurRepository.find({
        where: { idUtilisateur: In(updateContractDto.utilisateursIds) },
      })

      if (users.length !== updateContractDto.utilisateursIds.length) {
        throw new NotFoundException(`Un ou plusieurs utilisateurs sont introuvables`)
      }

      contract.utilisateur = users
    }

    // Mettre à jour les horaires
    if (updateContractDto.dateDebut) {
      updatedData.dateDebut = this.convertToUTC(updateContractDto.dateDebut, timezone)
      contract.dateDebut = updatedData.dateDebut
    }
    if (updateContractDto.dateFin) {
      updatedData.dateFin = this.convertToUTC(updateContractDto.dateFin, timezone)
      contract.dateFin = updatedData.dateFin
    }

    // Vérifier les conflits d'horaires pour chaque utilisateur
    if (contract.utilisateur && contract.utilisateur.length > 0 && (updatedData.dateDebut || updatedData.dateFin)) {
      for (const user of contract.utilisateur) {
        await this.checkScheduleConflict(
          user.idUtilisateur,
          updatedData.dateDebut || contract.dateDebut,
          updatedData.dateFin || contract.dateFin,
          contractId,
          timezone,
        )
      }
    }

    // Mettre à jour les autres champs
    if (updateContractDto.lieu) {
      if (Array.isArray(updateContractDto.lieu) && updateContractDto.lieu.length === 2) {
        contract.lieu = {
          type: "Point",
          coordinates: [updateContractDto.lieu[0], updateContractDto.lieu[1]],
        }
      } else {
        throw new BadRequestException("Le lieu doit être un tableau [latitude, longitude]")
      }
    }

    if (updateContractDto.description) contract.description = updateContractDto.description
    if (updateContractDto.pause) contract.pause = updateContractDto.pause

    // Mettre à jour les tâches
    if (updateContractDto.tachesIds && updateContractDto.tachesIds.length > 0) {
      const tasks = await this.tacheRepository.findByIds(updateContractDto.tachesIds)
      contract.taches = tasks
    }

    return this.contractRepository.save(contract)
  }

  // SUPPRIMER UN CONTRAT D'UNE ENTREPRISE
  async removeContractFromEntreprise(entrepriseId: string, contractId: string): Promise<void> {
    const contract = await this.getContractByEntreprise(entrepriseId, contractId)
    await this.contractRepository.remove(contract)
  }

  // AJOUTER DES UTILISATEURS À UN CONTRAT D'UNE ENTREPRISE
  async addUsersToContractInEntreprise(
    entrepriseId: string,
    contractId: string,
    utilisateursIds: string[],
    timezone = "Africa/Douala",
  ): Promise<Contrat> {
    const contract = await this.getContractByEntreprise(entrepriseId, contractId)

    // Vérifier que les utilisateurs appartiennent à l'entreprise
    await this.validateUsersInEntreprise(utilisateursIds, entrepriseId)

    const utilisateurs = await this.utilisateurRepository.find({
      where: { idUtilisateur: In(utilisateursIds) },
    })

    if (utilisateurs.length !== utilisateursIds.length) {
      throw new NotFoundException(`Un ou plusieurs utilisateurs sont introuvables`)
    }

    // Vérifier les conflits d'horaire pour chaque nouvel utilisateur
    for (const utilisateur of utilisateurs) {
      const isAlreadyAssigned = contract.utilisateur?.some((u) => u.idUtilisateur === utilisateur.idUtilisateur)

      if (isAlreadyAssigned) {
        throw new ConflictException(`L'utilisateur ${utilisateur.nom} est déjà assigné à ce contrat`)
      }

      await this.checkScheduleConflict(
        utilisateur.idUtilisateur,
        contract.dateDebut,
        contract.dateFin,
        contractId,
        timezone,
      )
    }

    const currentUsers = contract.utilisateur || []
    contract.utilisateur = [...currentUsers, ...utilisateurs]

    const updatedContract = await this.contractRepository.save(contract)

    // Envoyer des SMS de notification si le contrat commence aujourd'hui
    if (this.isToday(contract.dateDebut)) {
      for (const user of utilisateurs) {
        try {
          await this.sendContractNotificationSMS(user, contract)
          console.log(`SMS envoyé pour le nouveau utilisateur ${user.nom} du contrat ${contract.idContrat}`)
        } catch (error) {
          console.error(`Erreur envoi SMS au nouvel utilisateur ${user.nom}:`, error)
        }
      }
    }

    return updatedContract
  }

  // RETIRER DES UTILISATEURS D'UN CONTRAT D'UNE ENTREPRISE
  async removeUsersFromContractInEntreprise(
    entrepriseId: string,
    contractId: string,
    utilisateursIds: string[],
  ): Promise<Contrat> {
    const contract = await this.getContractByEntreprise(entrepriseId, contractId)

    if (!contract.utilisateur || contract.utilisateur.length === 0) {
      throw new BadRequestException(`Aucun utilisateur n'est assigné à ce contrat`)
    }

    contract.utilisateur = contract.utilisateur.filter((user) => !utilisateursIds.includes(user.idUtilisateur))

    return await this.contractRepository.save(contract)
  }

  // POINTAGE POUR UN CONTRAT D'UNE ENTREPRISE
  async pointagePresenceForEntreprise(
    entrepriseId: string,
    contractId: string,
    pointageDto: PointageContratDto,
  ): Promise<Presence> {
    // Vérifier que le contrat appartient à l'entreprise
    const contract = await this.getContractByEntreprise(entrepriseId, contractId)

    // Vérifier que l'utilisateur appartient à l'entreprise
    await this.validateUsersInEntreprise([pointageDto.utilisateurId], entrepriseId)

    // Utiliser la logique existante de pointage
    const now = new Date()

    const matchingContract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
        dateDebut: LessThanOrEqual(now),
        dateFin: MoreThanOrEqual(now),
      },
      relations: ["utilisateur"],
    })

    if (!matchingContract) {
      console.log("Contract Debut:", contract.dateDebut)
      console.log("Now (Local):", now)
      console.log("Contract Fin:", contract.dateFin)
      throw new BadRequestException("Aucun contrat actif pour l'heure actuelle.")
    }

    // Vérifier si l'utilisateur est assigné à ce contrat
    const isUserAssigned = matchingContract.utilisateur?.some((u) => u.idUtilisateur === pointageDto.utilisateurId)
    if (!isUserAssigned) {
      throw new BadRequestException("Vous n'êtes pas assigné à ce contrat.")
    }

    const user = await this.utilisateurRepository.findOne({
      where: { idUtilisateur: pointageDto.utilisateurId },
    })

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${pointageDto.utilisateurId} non trouvé`)
    }

    // Vérifier la distance (même logique que l'original)
    if (!Array.isArray(pointageDto.localisation) || pointageDto.localisation.length !== 2) {
      throw new BadRequestException("Localisation invalide (latitude, longitude requis)")
    }

    const [userLat, userLng] = pointageDto.localisation
    const [contractLat, contractLng] = contract.lieu.coordinates

    const distance = this.calculateDistance(userLat, userLng, contractLat, contractLng)

    if (distance > 500) {
      throw new BadRequestException(
        `Pointage impossible: vous êtes à ${Math.round(distance)}m du lieu de travail, la limite est de 500m`,
      )
    }

    // Vérifier s'il existe déjà un pointage sans heure de départ pour cet utilisateur
    const existingPresence = await this.presenceRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: pointageDto.utilisateurId },
        contrat: { idContrat: contract.idContrat },
        heureDepart: IsNull(),
      },
    })

    if (existingPresence) {
      // Pointage de départ
      const currentTime = new Date()

      existingPresence.heureDepart = currentTime
      existingPresence.localisationDepart = {
        type: "Point",
        coordinates: [pointageDto.localisation[0], pointageDto.localisation[1]],
      }

      if (pointageDto.notes) {
        existingPresence.notes = existingPresence.notes
          ? existingPresence.notes + " " + pointageDto.notes
          : pointageDto.notes
      }

      // Calculer les heures supplémentaires ou départ anticipé (même logique)
      const dateFin = new Date(contract.dateFin)
      const today = new Date(currentTime)
      const finPrevue = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        dateFin.getHours(),
        dateFin.getMinutes(),
      )

      const diffMilliseconds = currentTime.getTime() - finPrevue.getTime()
      const diffMinutes = Math.round(diffMilliseconds / 60000)

      let messageDepart = ""
      if (diffMinutes < 0) {
        const absMinutes = Math.abs(diffMinutes)
        const heuresDepart = Math.floor(absMinutes / 60)
        const minutesDepart = absMinutes % 60

        messageDepart = "Départ anticipé de "
        if (heuresDepart > 0) {
          messageDepart += `${heuresDepart} heure${heuresDepart > 1 ? "s" : ""}`
          if (minutesDepart > 0) {
            messageDepart += ` et ${minutesDepart} minute${minutesDepart > 1 ? "s" : ""}`
          }
        } else {
          messageDepart += `${minutesDepart} minute${minutesDepart > 1 ? "s" : ""}`
        }
        messageDepart += " avant l'heure de fin prévue."
      } else if (diffMinutes > 0) {
        const heuresSup = Math.floor(diffMinutes / 60)
        const minutesSup = diffMinutes % 60

        messageDepart = "Heures supplémentaires effectuées: "
        if (heuresSup > 0) {
          messageDepart += `${heuresSup} heure${heuresSup > 1 ? "s" : ""}`
          if (minutesSup > 0) {
            messageDepart += ` et ${minutesSup} minute${minutesSup > 1 ? "s" : ""}`
          }
        } else {
          messageDepart += `${minutesSup} minute${minutesSup > 1 ? "s" : ""}`
        }
        messageDepart += "."
      }

      if (messageDepart) {
        if (existingPresence.notes) {
          existingPresence.notes += " " + messageDepart
        } else {
          existingPresence.notes = messageDepart
        }
      }

      return this.presenceRepository.save(existingPresence)
    } else {
      // Vérifier si l'utilisateur a déjà pointé aujourd'hui
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const hasPointedToday = await this.presenceRepository.findOne({
        where: {
          utilisateur: { idUtilisateur: pointageDto.utilisateurId },
          contrat: { idContrat: contract.idContrat },
          heureArrivee: Between(today, tomorrow),
        },
      })

      if (hasPointedToday) {
        throw new BadRequestException(
          "Vous avez déjà pointé aujourd'hui. Un seul pointage d'arrivée et de départ est autorisé par jour.",
        )
      }

      // Créer un nouveau pointage d'arrivée
      const currentTime = new Date()
      const presence = this.presenceRepository.create({
        utilisateur: user,
        contrat: contract,
        heureArrivee: currentTime,
        localisationArrivee: {
          type: "Point",
          coordinates: pointageDto.localisation,
        },
        notes: pointageDto.notes,
      })

      // Vérifier si l'employé est en retard (même logique)
      const horaireDebut = new Date(contract.dateDebut)
      const debutPrevu = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        horaireDebut.getHours(),
        horaireDebut.getMinutes(),
      )

      const diffMilliseconds = currentTime.getTime() - debutPrevu.getTime()
      const diffMinutes = Math.round(diffMilliseconds / 60000)

      if (diffMinutes > 0) {
        const heuresRetard = Math.floor(diffMinutes / 60)
        const minutesRetard = diffMinutes % 60

        let messageRetard = "Arrivée avec "
        if (heuresRetard > 0) {
          messageRetard += `${heuresRetard} heure${heuresRetard > 1 ? "s" : ""}`
          if (minutesRetard > 0) {
            messageRetard += ` et ${minutesRetard} minute${minutesRetard > 1 ? "s" : ""}`
          }
        } else {
          messageRetard += `${minutesRetard} minute${minutesRetard > 1 ? "s" : ""}`
        }
        messageRetard += " de retard."

        if (presence.notes) {
          presence.notes += " " + messageRetard
        } else {
          presence.notes = messageRetard
        }
      }

      return this.presenceRepository.save(presence)
    }
  }

  // AJOUTER UN COMMENTAIRE À UN CONTRAT D'UNE ENTREPRISE
  async addCommentToContractInEntreprise(
    entrepriseId: string,
    contractId: string,
    commentDto: CreateCommentDto,
  ): Promise<Commentaire> {
    // Vérifier que le contrat appartient à l'entreprise
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["utilisateur", "entreprise"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    // Création du commentaire avec la même logique
    const commentaire = this.commentaireRepository.create({
      message: commentDto.message,
      fichierJoint: commentDto.fichierJoint,
      contrat: contract,
    })

    const savedComment = await this.commentaireRepository.save(commentaire)

    // Notification SMS aux utilisateurs affectés au contrat (même logique)
    try {
      if (contract.utilisateur && contract.utilisateur.length > 0) {
        const messageBody = `Nouveau commentaire sur le contrat: "${commentDto.message}"`

        const smsPromises = contract.utilisateur.map(async (utilisateur) => {
          if (utilisateur.telephone) {
            try {
              await this.twilioService.sendSMS(utilisateur.telephone, messageBody)
            } catch (error) {
              console.error(`Erreur envoi SMS à ${utilisateur.telephone}:`, error.message)
            }
          }
        })

        await Promise.allSettled(smsPromises)
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi des notifications SMS:", error.message)
    }

    return savedComment
  }

  // AJOUTER UNE TÂCHE À UN CONTRAT D'UNE ENTREPRISE
  async addTaskToContractInEntreprise(
    entrepriseId: string,
    contractId: string,
    addTaskDto: AddTaskToContractDto,
  ): Promise<Contrat> {
    // Vérifier que le contrat appartient à l'entreprise
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["utilisateur", "taches", "entreprise"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    // Vérifier que la tâche existe (même logique)
    const task = await this.tacheRepository.findOne({
      where: { idTache: addTaskDto.tacheId },
    })

    if (!task) {
      throw new NotFoundException(`Tâche avec l'ID ${addTaskDto.tacheId} non trouvée`)
    }

    if (!contract.taches) {
      contract.taches = []
    }

    // Mettre à jour le statut de la tâche (même logique)
    task.type = StatutTache.EN_COURS
    await this.tacheRepository.save(task)

    contract.taches.push(task)
    return this.contractRepository.save(contract)
  }

  // OBTENIR LES PRÉSENCES D'UN CONTRAT D'UNE ENTREPRISE
  async getContractPresencesForEntreprise(entrepriseId: string, contractId: string): Promise<Presence[]> {
    // Vérifier que le contrat appartient à l'entreprise
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    return this.presenceRepository.find({
      where: { contrat: { idContrat: contract.idContrat } },
      relations: ["utilisateur", "contrat"],
      order: { heureArrivee: "DESC" },
    })
  }

  // OBTENIR LES TÂCHES D'UN CONTRAT D'UNE ENTREPRISE
  async getContractTasksForEntreprise(entrepriseId: string, contractId: string): Promise<tache[]> {
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["taches"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    return contract.taches || []
  }

  // OBTENIR LES COMMENTAIRES D'UN CONTRAT D'UNE ENTREPRISE
  async getContractCommentsForEntreprise(entrepriseId: string, contractId: string): Promise<Commentaire[]> {
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    return this.commentaireRepository.find({
      where: { contrat: { idContrat: contract.idContrat } },
      order: { dateCreation: "DESC" },
    })
  }

  // RETIRER UNE TÂCHE D'UN CONTRAT D'UNE ENTREPRISE
  async removeTaskFromContractInEntreprise(entrepriseId: string, contractId: string, taskId: string): Promise<Contrat> {
    const contract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["taches", "entreprise"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé pour cette entreprise`)
    }

    if (!contract.taches || contract.taches.length === 0) {
      throw new BadRequestException(`Aucune tâche n'est assignée à ce contrat`)
    }

    // Retirer la tâche du contrat
    contract.taches = contract.taches.filter((task) => task.idTache !== taskId)

    return await this.contractRepository.save(contract)
  }

  // SAUVEGARDER COMME TEMPLATE POUR UNE ENTREPRISE
  async saveAsTemplateForEntreprise(
    entrepriseId: string,
    contractId: string,
    saveDto: SaveAsTemplateDto,
  ): Promise<Contrat> {
    const contract = await this.getContractByEntreprise(entrepriseId, contractId)

    const template = this.contractRepository.create({
      lieu: contract.lieu,
      dateDebut: contract.dateDebut,
      dateFin: contract.dateFin,
      description: contract.description,
      pause: contract.pause,
      estGabarit: true,
      nomGabarit: saveDto.nomGabarit,
      taches: contract.taches,
      entreprise: contract.entreprise,
    })

    return this.contractRepository.save(template)
  }

  // OBTENIR TOUS LES TEMPLATES D'UNE ENTREPRISE
  async getAllTemplatesForEntreprise(entrepriseId: string): Promise<Contrat[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return this.contractRepository.find({
      where: {
        entreprise: { idEntreprise: entrepriseId },
        estGabarit: true,
      },
      relations: ["taches", "entreprise"],
    })
  }

  // CRÉER À PARTIR D'UN TEMPLATE POUR UNE ENTREPRISE
  async createFromTemplateForEntreprise(entrepriseId: string, createDto: CreateFromTemplateDto): Promise<Contrat[]> {
    const template = await this.contractRepository.findOne({
      where: {
        idContrat: createDto.gabaritId,
        estGabarit: true,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["taches", "entreprise"],
    })

    if (!template) {
      throw new NotFoundException(`Gabarit avec l'ID ${createDto.gabaritId} non trouvé pour cette entreprise`)
    }

    // Vérifier que les utilisateurs appartiennent à l'entreprise
    await this.validateUsersInEntreprise(createDto.utilisateursIds, entrepriseId)

    const createdContracts: Contrat[] = []

    for (const utilisateurId of createDto.utilisateursIds) {
      const utilisateur = await this.utilisateurRepository.findOne({
        where: { idUtilisateur: utilisateurId },
      })

      if (!utilisateur) {
        throw new NotFoundException(`Utilisateur avec l'ID ${utilisateurId} non trouvé`)
      }

      const newContract = this.contractRepository.create({
        lieu: createDto.lieu
          ? {
              type: "Point",
              coordinates: [createDto.lieu[1], createDto.lieu[0]],
            }
          : template.lieu,
        dateDebut: createDto.dateDebut || template.dateDebut,
        dateFin: createDto.dateFin || template.dateFin,
        description: template.description,
        pause: template.pause,
        estGabarit: false,
        utilisateur: [utilisateur],
        taches: template.taches,
        entreprise: template.entreprise,
      })

      const savedContract = await this.contractRepository.save(newContract)
      createdContracts.push(savedContract)

      try {
        await this.sendContractNotificationSMS(utilisateur, savedContract)
        console.log(`SMS envoyé à l'employé ${utilisateur.idUtilisateur}`)
      } catch (error) {
        console.error(`Erreur envoi SMS à l'employé ${utilisateur.idUtilisateur}:`, error)
      }
    }

    return createdContracts
  }

  // MÉTHODES PRIVÉES ET UTILITAIRES

  private async validateUsersInEntreprise(utilisateursIds: string[], entrepriseId: string): Promise<void> {
    for (const utilisateurId of utilisateursIds) {
      const userInEntreprise = await this.utilisateurEntrepriseRepository.findOne({
        where: {
          utilisateur: { idUtilisateur: utilisateurId },
          entreprise: { idEntreprise: entrepriseId },
        },
        relations: ["utilisateur", "entreprise"],
      })

      if (!userInEntreprise) {
        throw new BadRequestException(`L'utilisateur ${utilisateurId} n'appartient pas à cette entreprise`)
      }
    }
  }

  private async createSingleContractForEntreprise(
    entreprise: Entreprise,
    createContractDto: any,
    timezone: string,
  ): Promise<Contrat[]> {
    this.validateContractDates(createContractDto.dateDebut, createContractDto.dateFin, timezone)

    const contract = this.contractRepository.create({
      lieu: {
        type: "Point",
        coordinates: [
          createContractDto.lieu[1], // longitude
          createContractDto.lieu[0], // latitude
        ],
      },
      dateDebut: this.convertToUTC(createContractDto.dateDebut, timezone),
      dateFin: this.convertToUTC(createContractDto.dateFin, timezone),
      description: createContractDto.description,
      pause: createContractDto.pause,
      nombreJoursRepetition: createContractDto.nombreJoursRepetition,
      taches: [],
      entreprise: entreprise, // Lier le contrat à l'entreprise
    })

    // Ajouter l'utilisateur si l'ID est fourni
    if (createContractDto.utilisateursIds?.length > 0) {
      const utilisateurs = await this.utilisateurRepository.find({
        where: { idUtilisateur: In(createContractDto.utilisateursIds) },
      })

      if (utilisateurs.length !== createContractDto.utilisateursIds.length) {
        throw new NotFoundException(`Un ou plusieurs utilisateurs sont introuvables`)
      }

      contract.utilisateur = utilisateurs

      for (const utilisateur of utilisateurs) {
        await this.checkScheduleConflict(
          utilisateur.idUtilisateur,
          contract.dateDebut,
          contract.dateFin,
          undefined,
          timezone,
        )
      }
    }

    // Ajouter les tâches si fournies
    if (createContractDto.tachesIds && createContractDto.tachesIds.length > 0) {
      const tasks = await this.tacheRepository.findByIds(createContractDto.tachesIds)

      for (const task of tasks) {
        task.type = StatutTache.EN_COURS
        await this.tacheRepository.save(task)
      }

      contract.taches = tasks
    }

    const savedContract = await this.contractRepository.save(contract)
    const createdContracts = [savedContract]

    if (contract.utilisateur?.length && this.isToday(contract.dateDebut)) {
      for (const user of contract.utilisateur) {
        try {
          await this.sendContractNotificationSMS(user, contract)
          console.log(`SMS envoyé pour le contrat ${contract.idContrat} à ${user.nom}`)
        } catch (error) {
          console.error(`Erreur envoi SMS à ${user.nom}:`, error)
        }
      }
    }

    // Gérer la répétition
    if (createContractDto.estRepetitif && createContractDto.nombreJoursRepetition) {
      const dureeContrat = contract.dateFin.getTime() - contract.dateDebut.getTime()

      for (let jour = 1; jour <= createContractDto.nombreJoursRepetition; jour++) {
        try {
          const nouvelleDate = new Date(contract.dateDebut)
          nouvelleDate.setDate(nouvelleDate.getDate() + jour)

          const nouvelleDateFin = new Date(nouvelleDate.getTime() + dureeContrat)

          this.validateContractDates(nouvelleDate, nouvelleDateFin, timezone)

          if (createContractDto.utilisateurId) {
            await this.checkScheduleConflict(
              createContractDto.utilisateurId,
              nouvelleDate,
              nouvelleDateFin,
              undefined,
              timezone,
            )
          }

          const contractRepete = this.contractRepository.create({
            lieu: {
              type: "Point",
              coordinates: [createContractDto.lieu[1], createContractDto.lieu[0]],
            } as Point,
            dateDebut: nouvelleDate,
            dateFin: nouvelleDateFin,
            description: contract.description,
            pause: contract.pause,
            utilisateur: contract.utilisateur,
            taches: [],
            entreprise: entreprise, // Lier à l'entreprise
          })

          if (createContractDto.tachesIds && createContractDto.tachesIds.length > 0) {
            const tasks = await this.tacheRepository.findByIds(createContractDto.tachesIds)
            const newTasks: tache[] = []

            for (const task of tasks) {
              const { idTache, ...taskData } = task
              const taskCopy = this.tacheRepository.create({
                ...taskData,
                type: StatutTache.EN_COURS,
              })

              const savedTask = await this.tacheRepository.save(taskCopy)
              newTasks.push(savedTask)
            }

            contractRepete.taches = newTasks
          }

          const savedRepeatedContract = await this.contractRepository.save(contractRepete)
          createdContracts.push(savedRepeatedContract)

          if (
            contractRepete.utilisateur &&
            contractRepete.utilisateur.length > 0 &&
            this.isToday(contractRepete.dateDebut)
          ) {
            for (const user of contractRepete.utilisateur) {
              try {
                await this.sendContractNotificationSMS(user, savedRepeatedContract)
                console.log(
                  `SMS envoyé pour l'utilisateur ${user.idUtilisateur} du contrat répété ${contractRepete.idContrat}`,
                )
              } catch (error) {
                console.error(`Erreur envoi SMS contrat répété pour utilisateur ${user.idUtilisateur}:`, error)
              }
            }
          }
        } catch (error) {
          console.error(`Erreur création contrat répété jour ${jour}:`, error)
          if (error instanceof BadRequestException) {
            console.log(`Arrêt de la répétition au jour ${jour} car la date serait dans le passé`)
            break
          }
        }
      }

      savedContract.nombreJoursRepetition = createdContracts.length - 1
      await this.contractRepository.save(savedContract)
    }

    return createdContracts
  }

  // MÉTHODES EXISTANTES (pour compatibilité)
  async findAll(): Promise<Contrat[]> {
    return this.contractRepository.find({
      where: { estGabarit: false },
      relations: ["utilisateur", "taches", "entreprise"],
    })
  }

  async findContractsByEmployeeId(employeeId: string): Promise<Contrat[]> {
    return this.contractRepository
      .createQueryBuilder("contrat")
      .leftJoinAndSelect("contrat.utilisateur", "utilisateur")
      .leftJoinAndSelect("contrat.taches", "taches")
      .leftJoinAndSelect("contrat.entreprise", "entreprise")
      .where("utilisateur.idUtilisateur = :employeeId", { employeeId })
      .getMany()
  }

  async findOne(id: string): Promise<Contrat> {
    const contract = await this.contractRepository.findOne({
      where: { idContrat: id },
      relations: ["utilisateur", "taches", "entreprise"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${id} non trouvé`)
    }

    return contract
  }

  async addTaskToContract(id: string, addTaskDto: AddTaskToContractDto): Promise<Contrat> {
    const contract = await this.findOne(id)
    const task = await this.tacheRepository.findOne({
      where: { idTache: addTaskDto.tacheId },
    })

    if (!task) {
      throw new NotFoundException(`Tâche avec l'ID ${addTaskDto.tacheId} non trouvée`)
    }

    if (!contract.taches) {
      contract.taches = []
    }

    task.type = StatutTache.EN_COURS
    await this.tacheRepository.save(task)

    contract.taches.push(task)
    return this.contractRepository.save(contract)
  }

  async addCommentToContract(contractId: string, commentDto: CreateCommentDto): Promise<Commentaire> {
    const contract = await this.contractRepository.findOne({
      where: { idContrat: contractId },
      relations: ["utilisateur"],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${contractId} non trouvé`)
    }

    const commentaire = this.commentaireRepository.create({
      message: commentDto.message,
      fichierJoint: commentDto.fichierJoint,
      contrat: contract,
    })

    const savedComment = await this.commentaireRepository.save(commentaire)

    try {
      if (contract.utilisateur && contract.utilisateur.length > 0) {
        const messageBody = `Nouveau commentaire sur le contrat: "${commentDto.message}"`

        const smsPromises = contract.utilisateur.map(async (utilisateur) => {
          if (utilisateur.telephone) {
            try {
              await this.twilioService.sendSMS(utilisateur.telephone, messageBody)
            } catch (error) {
              console.error(`Erreur envoi SMS à ${utilisateur.telephone}:`, error.message)
            }
          }
        })

        await Promise.allSettled(smsPromises)
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi des notifications SMS:", error.message)
    }

    return savedComment
  }

  async pointagePresence(contractId: string, pointageDto: PointageContratDto): Promise<Presence> {
    const contract = await this.findOne(contractId)

    const now = new Date()

    const matchingContract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        dateDebut: LessThanOrEqual(now),
        dateFin: MoreThanOrEqual(now),
      },
      relations: ["utilisateur"],
    })

    if (!matchingContract) {
      console.log("Contract Debut:", contract.dateDebut)
      console.log("Now (Local):", now)
      console.log("Contract Fin:", contract.dateFin)
      throw new BadRequestException("Aucun contrat actif pour l'heure actuelle.")
    }

    const isUserAssigned = matchingContract.utilisateur?.some((u) => u.idUtilisateur === pointageDto.utilisateurId)
    if (!isUserAssigned) {
      throw new BadRequestException("Vous n'êtes pas assigné à ce contrat.")
    }

    const user = await this.utilisateurRepository.findOne({
      where: { idUtilisateur: pointageDto.utilisateurId },
    })

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${pointageDto.utilisateurId} non trouvé`)
    }

    if (!Array.isArray(pointageDto.localisation) || pointageDto.localisation.length !== 2) {
      throw new BadRequestException("Localisation invalide (latitude, longitude requis)")
    }

    const [userLat, userLng] = pointageDto.localisation
    const [contractLat, contractLng] = contract.lieu.coordinates

    const distance = this.calculateDistance(userLat, userLng, contractLat, contractLng)

    if (distance > 500) {
      throw new BadRequestException(
        `Pointage impossible: vous êtes à ${Math.round(distance)}m du lieu de travail, la limite est de 500m`,
      )
    }

    const existingPresence = await this.presenceRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: pointageDto.utilisateurId },
        contrat: { idContrat: contract.idContrat },
        heureDepart: IsNull(),
      },
    })

    if (existingPresence) {
      const currentTime = new Date()

      existingPresence.heureDepart = currentTime
      existingPresence.localisationDepart = {
        type: "Point",
        coordinates: [pointageDto.localisation[0], pointageDto.localisation[1]],
      }

      if (pointageDto.notes) {
        existingPresence.notes = existingPresence.notes
          ? existingPresence.notes + " " + pointageDto.notes
          : pointageDto.notes
      }

      const dateFin = new Date(contract.dateFin)
      const today = new Date(currentTime)
      const finPrevue = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        dateFin.getHours(),
        dateFin.getMinutes(),
      )

      const diffMilliseconds = currentTime.getTime() - finPrevue.getTime()
      const diffMinutes = Math.round(diffMilliseconds / 60000)

      let messageDepart = ""
      if (diffMinutes < 0) {
        const absMinutes = Math.abs(diffMinutes)
        const heuresDepart = Math.floor(absMinutes / 60)
        const minutesDepart = absMinutes % 60

        messageDepart = "Départ anticipé de "
        if (heuresDepart > 0) {
          messageDepart += `${heuresDepart} heure${heuresDepart > 1 ? "s" : ""}`
          if (minutesDepart > 0) {
            messageDepart += ` et ${minutesDepart} minute${minutesDepart > 1 ? "s" : ""}`
          }
        } else {
          messageDepart += `${minutesDepart} minute${minutesDepart > 1 ? "s" : ""}`
        }
        messageDepart += " avant l'heure de fin prévue."
      } else if (diffMinutes > 0) {
        const heuresSup = Math.floor(diffMinutes / 60)
        const minutesSup = diffMinutes % 60

        messageDepart = "Heures supplémentaires effectuées: "
        if (heuresSup > 0) {
          messageDepart += `${heuresSup} heure${heuresSup > 1 ? "s" : ""}`
          if (minutesSup > 0) {
            messageDepart += ` et ${minutesSup} minute${minutesSup > 1 ? "s" : ""}`
          }
        } else {
          messageDepart += `${minutesSup} minute${minutesSup > 1 ? "s" : ""}`
        }
        messageDepart += "."
      }

      if (messageDepart) {
        if (existingPresence.notes) {
          existingPresence.notes += " " + messageDepart
        } else {
          existingPresence.notes = messageDepart
        }
      }

      return this.presenceRepository.save(existingPresence)
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const hasPointedToday = await this.presenceRepository.findOne({
        where: {
          utilisateur: { idUtilisateur: pointageDto.utilisateurId },
          contrat: { idContrat: contract.idContrat },
          heureArrivee: Between(today, tomorrow),
        },
      })

      if (hasPointedToday) {
        throw new BadRequestException(
          "Vous avez déjà pointé aujourd'hui. Un seul pointage d'arrivée et de départ est autorisé par jour.",
        )
      }

      const currentTime = new Date()
      const presence = this.presenceRepository.create({
        utilisateur: user,
        contrat: contract,
        heureArrivee: currentTime,
        localisationArrivee: {
          type: "Point",
          coordinates: pointageDto.localisation,
        },
        notes: pointageDto.notes,
      })

      const horaireDebut = new Date(contract.dateDebut)
      const debutPrevu = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        horaireDebut.getHours(),
        horaireDebut.getMinutes(),
      )

      const diffMilliseconds = currentTime.getTime() - debutPrevu.getTime()
      const diffMinutes = Math.round(diffMilliseconds / 60000)

      if (diffMinutes > 0) {
        const heuresRetard = Math.floor(diffMinutes / 60)
        const minutesRetard = diffMinutes % 60

        let messageRetard = "Arrivée avec "
        if (heuresRetard > 0) {
          messageRetard += `${heuresRetard} heure${heuresRetard > 1 ? "s" : ""}`
          if (minutesRetard > 0) {
            messageRetard += ` et ${minutesRetard} minute${minutesRetard > 1 ? "s" : ""}`
          }
        } else {
          messageRetard += `${minutesRetard} minute${minutesRetard > 1 ? "s" : ""}`
        }
        messageRetard += " de retard."

        if (presence.notes) {
          presence.notes += " " + messageRetard
        } else {
          presence.notes = messageRetard
        }
      }

      return this.presenceRepository.save(presence)
    }
  }

  async getContractPresences(contractId: string): Promise<Presence[]> {
    const contract = await this.findOne(contractId)

    return this.presenceRepository.find({
      where: { contrat: { idContrat: contract.idContrat } },
      relations: ["utilisateur"],
    })
  }

  async findAllPresences(): Promise<Presence[]> {
    return this.presenceRepository.find({
      relations: ["utilisateur", "contrat"],
    })
  }

  async findPresencesByEmployeeId(employeeId: string): Promise<Presence[]> {
    const utilisateur = await this.utilisateurRepository.findOne({
      where: { idUtilisateur: employeeId },
    })

    if (!utilisateur) {
      throw new NotFoundException(`Utilisateur avec l'ID ${employeeId} non trouvé`)
    }

    return this.presenceRepository.find({
      where: { utilisateur: { idUtilisateur: employeeId } },
      relations: ["contrat", "utilisateur"],
    })
  }

  formatContractForDisplay(contract: Contrat, timezone = "Africa/Douala"): any {
    return {
      ...contract,
      horaireDebut: contract.dateDebut ? moment(contract.dateDebut).tz(timezone).format("YYYY-MM-DD HH:mm:ss") : null,
      horaireFin: contract.dateFin ? moment(contract.dateFin).tz(timezone).format("YYYY-MM-DD HH:mm:ss") : null,
      timezone,
    }
  }

  // MÉTHODES UTILITAIRES PRIVÉES
  private validateContractDates(dateDebut: Date | string, dateFin: Date | string, timezone = "Africa/Douala"): void {
    const debutUTC = this.convertToUTC(dateDebut, timezone)
    const finUTC = this.convertToUTC(dateFin, timezone)
    const maintenant = new Date()

    if (finUTC <= debutUTC) {
      throw new BadRequestException("La date de fin doit être postérieure à la date de début")
    }

    if (debutUTC < maintenant) {
      const dateDebutFormatee = moment(debutUTC).tz(timezone).format("DD/MM/YYYY à HH:mm")
      throw new BadRequestException(
        `Impossible de créer un contrat qui commence dans le passé. Date de début: ${dateDebutFormatee}`,
      )
    }

    if (finUTC < maintenant) {
      const dateFinFormatee = moment(finUTC).tz(timezone).format("DD/MM/YYYY à HH:mm")
      throw new BadRequestException(
        `Impossible de créer un contrat qui se termine dans le passé. Date de fin: ${dateFinFormatee}`,
      )
    }
  }

  private async sendContractNotificationSMS(utilisateur: Utilisateur, contract: Contrat): Promise<void> {
    let locationName
    try {
      const coords = contract.lieu?.coordinates
      locationName = coords ? await this.notificationService.getLocationName(coords) : "Lieu non spécifié"
    } catch (error) {
      console.error("Impossible de résoudre le nom du lieu, utilisation des coordonnées brutes", error)
      locationName = contract.lieu?.coordinates
        ? `${contract.lieu.coordinates[0]}, ${contract.lieu.coordinates[1]}`
        : "Lieu non spécifié"
    }

    if (!utilisateur.telephone) {
      console.log(`Pas de numéro de téléphone pour l'utilisateur ${utilisateur.idUtilisateur}`)
      return
    }

    const message = `Nouveau contrat assigné: ${utilisateur.nom} le ${moment(contract.dateDebut).format("DD/MM/YYYY à HH:mm")} et ce termine le ${moment(contract.dateFin).format("DD/MM/YYYY à HH:mm")}. Lieu: ${locationName}`

    await this.twilioService.sendSMS(utilisateur.telephone, message)
  }

  private isToday(date: Date): boolean {
    const today = new Date()
    const checkDate = new Date(date)

    return (
      checkDate.getDate() === today.getDate() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getFullYear() === today.getFullYear()
    )
  }

  private convertToUTC(date: Date | string, timezone = "Africa/Douala"): Date {
    return moment.tz(date, timezone).utc().toDate()
  }

  private async checkScheduleConflict(
    utilisateurId: string,
    horaireDebut: Date,
    horaireFin: Date,
    excludeContractId?: string,
    timezone = "Africa/Douala",
  ): Promise<void> {
    if (!utilisateurId || !horaireDebut || !horaireFin) {
      return
    }

    const debutUTC = this.convertToUTC(horaireDebut, timezone)
    const finUTC = this.convertToUTC(horaireFin, timezone)

    if (finUTC <= debutUTC) {
      throw new ConflictException("L'heure de fin doit être postérieure à l'heure de début")
    }

    const queryBuilder = this.contractRepository
      .createQueryBuilder("contract")
      .leftJoin("contract.utilisateur", "utilisateur")
      .where("utilisateur.idUtilisateur = :utilisateurId", { utilisateurId })
      .andWhere("contract.dateDebut IS NOT NULL")
      .andWhere("contract.dateFin IS NOT NULL")
      .andWhere("(contract.dateDebut < :dateFin AND contract.dateFin > :dateDebut)", {
        dateDebut: debutUTC,
        dateFin: finUTC,
      })

    if (excludeContractId) {
      queryBuilder.andWhere("contract.idContrat != :excludeContractId", { excludeContractId })
    }

    const conflictingContracts = await queryBuilder.getMany()

    if (conflictingContracts.length > 0) {
      const conflictDetails = conflictingContracts.map((contract) => ({
        id: contract.idContrat,
        debut: moment(contract.dateDebut).tz(timezone).format("DD/MM/YYYY HH:mm"),
        fin: moment(contract.dateFin).tz(timezone).format("DD/MM/YYYY HH:mm"),
        lieu: contract.lieu,
      }))

      throw new ConflictException(
        `L'employé a déjà un contrat programmé pendant cette période. Conflits détectés: ${JSON.stringify(conflictDetails)}`,
      )
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000
    const dLat = this.toRadians(lat2 - lat1)
    const dLon = this.toRadians(lon2 - lon1)

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distance = R * c

    return distance
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }

  @Cron("0 */15 * * * *")
  async checkAndTerminateContracts() {
    console.log("Vérification des contrats à terminer automatiquement...")

    const now = new Date()

    const contractsToTerminate = await this.contractRepository
      .createQueryBuilder("contract")
      .andWhere("contract.dateFin < :now", { now })
      .getMany()

    for (const contract of contractsToTerminate) {
      const activePresences = await this.presenceRepository.find({
        where: {
          contrat: { idContrat: contract.idContrat },
          heureDepart: IsNull(),
        },
        relations: ["utilisateur"],
      })

      for (const presence of activePresences) {
        presence.heureDepart = now
        presence.localisationDepart = presence.localisationArrivee

        const remarqueAuto = " Contrat arrêté automatiquement par le système à l'heure prévue."
        if (presence.notes) {
          presence.notes += remarqueAuto
        } else {
          presence.notes = remarqueAuto
        }

        await this.presenceRepository.save(presence)
      }
      await this.contractRepository.save(contract)

      console.log(`Contrat ${contract.idContrat} terminé automatiquement`)
    }
  }

  @Cron("0 7 * * *")
  async sendDailyNotifications() {
    console.log("Envoi des notifications quotidiennes...")

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayContracts = await this.contractRepository.find({
      where: {
        dateDebut: Between(today, tomorrow),
        estGabarit: false,
      },
      relations: ["utilisateur"],
    })

    for (const contract of todayContracts) {
      if (contract.utilisateur?.length) {
        for (const user of contract.utilisateur) {
          try {
            await this.sendContractNotificationSMS(user, contract)
            console.log(`Notification envoyée pour ${user.nom} sur le contrat ${contract.idContrat}`)
          } catch (error) {
            console.error(`Erreur pour ${user.nom}:`, error)
          }
        }
      }
    }
  }
}
