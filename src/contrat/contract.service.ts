import { Injectable, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common"
import {  Repository, IsNull, Between, LessThanOrEqual, MoreThanOrEqual, DeepPartial, In } from "typeorm"
import  { Contrat } from "./entities/contrat.entity"
import  { tache } from "../tache/entities/tache.entity"
import  { Utilisateur } from "../User/entities/utilisateur.entity"
import  { Presence } from "./../presence/entities/presence.entity"
import  { TwilioService } from "../twillio/twillio.service"
import { Cron } from "@nestjs/schedule"
import * as moment from "moment-timezone"
import {
  CreateContractDto,
  UpdateContractDto,
  AddTaskToContractDto,
  PointageContratDto,
  SaveAsTemplateDto,
  CreateFromTemplateDto,
} from "./dto/create-contrat.dto"
import { StatutTache } from "src/utils/enums/enums"
import { Point } from "src/utils/types/type"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class ContractService {
  constructor(
     @InjectRepository(Contrat)
    private readonly contractRepository: Repository<Contrat>,

    @InjectRepository(tache)
    private readonly tacheRepository: Repository<tache>,

    @InjectRepository(Utilisateur)
    private readonly utilisateurRepository: Repository<Utilisateur>,

    @InjectRepository(Presence)
    private readonly presenceRepository: Repository<Presence>,

    private readonly twilioService: TwilioService,
  ) {}

  async findAll(): Promise<Contrat[]> {
    return this.contractRepository.find({
      where: { estGabarit: false },
      relations: ["utilisateur", "taches"],
    })
  }

async findContractsByEmployeeId(employeeId: string): Promise<Contrat[]> {
  return this.contractRepository
    .createQueryBuilder('contrat')
    .leftJoinAndSelect('contrat.utilisateur', 'utilisateur')
    .leftJoinAndSelect('contrat.taches', 'taches')
    .where('utilisateur.idUtilisateur = :employeeId', { employeeId })
    .getMany();
}


  async findOne(id: string): Promise<Contrat> {
    const contract = await this.contractRepository.findOne({
      where: { idContrat: id },
      relations: [
        "utilisateur",
        "taches",
      ],
    })

    if (!contract) {
      throw new NotFoundException(`Contrat avec l'ID ${id} non trouvé`)
    }

    return contract
  }

  async create(createContractDto: CreateContractDto, timezone = "Europe/Paris"): Promise<Contrat[]> {
    const createdContracts: Contrat[] = []

    // Si plusieurs utilisateurs sont spécifiés, créer un contrat pour chacun
    if (createContractDto.utilisateursIds && createContractDto.utilisateursIds.length > 0) {
      for (const utilisateurId of createContractDto.utilisateursIds) {
        const contract = await this.createSingleContract(
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
      const contract = await this.createSingleContract(createContractDto, timezone)
      createdContracts.push(...contract)
    }

    return createdContracts
  }

  private async createSingleContract(createContractDto: any, timezone: string): Promise<Contrat[]> {
   const contract = this.contractRepository.create({
 lieu: {
    type: 'Point',
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
} )

    // Ajouter l'utilisateur si l'ID est fourni
  if (createContractDto.utilisateursIds?.length > 0) {
  const utilisateurs = await this.utilisateurRepository.find({
    where: { idUtilisateur: In(createContractDto.utilisateursIds) },
  });

  if (utilisateurs.length !== createContractDto.utilisateursIds.length) {
    throw new NotFoundException(`Un ou plusieurs utilisateurs sont introuvables`);
  }

  contract.utilisateur = utilisateurs;

  for (const utilisateur of utilisateurs) {
    await this.checkScheduleConflict(
      utilisateur.idUtilisateur,
      contract.dateDebut,
      contract.dateFin,
      undefined,
      timezone,
    );
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

   

    // Sauvegarder le contrat principal
    const savedContract = await this.contractRepository.save(contract)
    const createdContracts = [savedContract]

        if (contract.utilisateur?.length && this.isToday(contract.dateDebut)) {
  for (const user of contract.utilisateur) {
    try {
      await this.sendContractNotificationSMS(user, contract);
      console.log(`SMS envoyé pour le contrat ${contract.idContrat} à ${user.nom}`);
    } catch (error) {
      console.error(`Erreur envoi SMS à ${user.nom}:`, error);
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
    type: 'Point',
    coordinates: [
      createContractDto.lieu[1], // longitude
      createContractDto.lieu[0], // latitude
    ],
  } as Point,
            dateDebut: nouvelleDate,
            dateFin: nouvelleDateFin,
            description: contract.description,
            pause: contract.pause,
            utilisateur: contract.utilisateur,
            taches: [],
          })

          // Copier les tâches
         if (createContractDto.tachesIds && createContractDto.tachesIds.length > 0) {
         const tasks = await this.tacheRepository.findByIds(createContractDto.tachesIds);
         const newTasks: tache[] = [];

         for (const task of tasks) {
         const { idTache, ...taskData } = task; // Retire idTache
        const taskCopy = this.tacheRepository.create({
         ...taskData,
         type: StatutTache.EN_COURS,
       });

          const savedTask = await this.tacheRepository.save(taskCopy);
         newTasks.push(savedTask);
       }

           contractRepete.taches = newTasks;
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
      await this.sendContractNotificationSMS(user, savedRepeatedContract);
      console.log(`SMS envoyé pour l'utilisateur ${user.idUtilisateur} du contrat répété ${contractRepete.idContrat}`);
    } catch (error) {
      console.error(`Erreur envoi SMS contrat répété pour utilisateur ${user.idUtilisateur}:`, error);
    }
  }
}

        } catch (error) {
          console.error(`Erreur création contrat répété jour ${jour}:`, error)
        }
      }

      savedContract.nombreJoursRepetition = createdContracts.length - 1
      await this.contractRepository.save(savedContract)
    }

    return createdContracts
  }

  private async sendContractNotificationSMS(utilisateur: Utilisateur, contract: Contrat): Promise<void> {
    if (!utilisateur.telephone) {
      console.log(`Pas de numéro de téléphone pour l'utilisateur ${utilisateur.idUtilisateur}`)
      return
    }

   const message = `Nouveau contrat assigné: ${utilisateur.nom} le ${moment(contract.dateDebut).format("DD/MM/YYYY à HH:mm")} et ce termine le ${moment(contract.dateFin).format("DD/MM/YYYY à HH:mm")}. Lieu: ${contract.lieu.coordinates.join(", ")}`;


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

  private convertToUTC(date: Date | string, timezone = "Europe/Paris"): Date {
    return moment.tz(date, timezone).utc().toDate()
  }

  private async checkScheduleConflict(
  utilisateurId: string,
  horaireDebut: Date,
  horaireFin: Date,
  excludeContractId?: string,
  timezone = "Europe/Paris",
): Promise<void> {
  if (!utilisateurId || !horaireDebut || !horaireFin) {
    return;
  }

  const debutUTC = this.convertToUTC(horaireDebut, timezone);
  const finUTC = this.convertToUTC(horaireFin, timezone);

  if (finUTC <= debutUTC) {
    throw new ConflictException("L'heure de fin doit être postérieure à l'heure de début");
  }

  const queryBuilder = this.contractRepository
    .createQueryBuilder("contract")
    .leftJoin("contract.utilisateur", "utilisateur") // jointure avec la table utilisateur
    .where("utilisateur.idUtilisateur = :utilisateurId", { utilisateurId }) // filtrage sur utilisateur via jointure
    .andWhere("contract.dateDebut IS NOT NULL")
    .andWhere("contract.dateFin IS NOT NULL")
    .andWhere("(contract.dateDebut < :dateFin AND contract.dateFin > :dateDebut)", {
      dateDebut: debutUTC,
      dateFin: finUTC,
    });

  if (excludeContractId) {
    queryBuilder.andWhere("contract.idContrat != :excludeContractId", { excludeContractId });
  }

  const conflictingContracts = await queryBuilder.getMany();

  if (conflictingContracts.length > 0) {
    const conflictDetails = conflictingContracts.map((contract) => ({
      id: contract.idContrat,
      debut: moment(contract.dateDebut).tz(timezone).format("DD/MM/YYYY HH:mm"),
      fin: moment(contract.dateFin).tz(timezone).format("DD/MM/YYYY HH:mm"),
      lieu: contract.lieu,
    }));

    throw new ConflictException(
      `L'employé a déjà un contrat programmé pendant cette période. Conflits détectés: ${JSON.stringify(conflictDetails)}`,
    );
  }
}

  async update(id: string, updateContractDto: UpdateContractDto, timezone = "Europe/Paris"): Promise<Contrat> {
    const contract = await this.findOne(id)

    const updatedData = { ...contract }
   const utilisateurIds = contract.utilisateur?.map(u => u.idUtilisateur) ?? [];


    // Mettre à jour l'utilisateur si fourni
    let utilisateurId: string | undefined;
    if (updateContractDto.utilisateursIds && updateContractDto.utilisateursIds.length > 0) {
      const user = await this.utilisateurRepository.findOne({
        where: { idUtilisateur: updateContractDto.utilisateursIds[0] },
      })

      if (!user) {
        throw new NotFoundException(`Utilisateur avec l'ID ${updateContractDto.utilisateursIds[0]} non trouvé`)
      }

      contract.utilisateur = [user]
      utilisateurId = updateContractDto.utilisateursIds[0]
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

    // Vérifier les conflits d'horaires
    if (utilisateurId && (updatedData.dateDebut || updatedData.dateFin)) {
      await this.checkScheduleConflict(
        utilisateurId,
        updatedData.dateDebut || contract.dateDebut,
        updatedData.dateFin || contract.dateFin,
        id,
        timezone,
      )
    }

    // Mettre à jour les autres champs
  if (updateContractDto.lieu) {
  if (
    Array.isArray(updateContractDto.lieu) &&
    updateContractDto.lieu.length === 2
  ) {
    contract.lieu = {
      type: "Point",
      coordinates: [updateContractDto.lieu[0], updateContractDto.lieu[1]],
    };
  } else {
    throw new BadRequestException("Le lieu doit être un tableau [latitude, longitude]");
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

  async remove(id: string): Promise<void> {
    const contract = await this.findOne(id)
    await this.contractRepository.remove(contract)
  }

  formatContractForDisplay(contract: Contrat, timezone = "Europe/Paris"): any {
    return {
      ...contract,
      horaireDebut: contract.dateDebut
        ? moment(contract.dateDebut).tz(timezone).format("YYYY-MM-DD HH:mm:ss")
        : null,
      horaireFin: contract.dateFin ? moment(contract.dateFin).tz(timezone).format("YYYY-MM-DD HH:mm:ss") : null,
      timezone,
    }
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

private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000 // Rayon de la Terre en mètres
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

  async pointagePresence(contractId: string, pointageDto: PointageContratDto): Promise<Presence> {
    const contract = await this.findOne(contractId)
    const now = new Date()

    // Vérifier si le contrat est actif
    const matchingContract = await this.contractRepository.findOne({
      where: {
        idContrat: contractId,
        dateDebut: LessThanOrEqual(now),
        dateFin: MoreThanOrEqual(now),
      },
      relations: ['utilisateur'] // Charger les utilisateurs associés
    })

    if (!matchingContract) {
      throw new BadRequestException("Aucun contrat actif pour l'heure actuelle.")
    }

    // Vérifier si l'utilisateur est assigné à ce contrat
    const isUserAssigned = matchingContract.utilisateur?.some(u => u.idUtilisateur === pointageDto.utilisateurId)
    if (!isUserAssigned) {
      throw new BadRequestException("Vous n'êtes pas assigné à ce contrat.")
    }

    const user = await this.utilisateurRepository.findOne({
      where: { idUtilisateur: pointageDto.utilisateurId },
    })

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${pointageDto.utilisateurId} non trouvé`)
    }

    // Vérifier la distance
    if (!Array.isArray(pointageDto.localisation) || pointageDto.localisation.length !== 2) {
      throw new BadRequestException("Localisation invalide (latitude, longitude requis)")
    }

    const [userLat, userLng] = pointageDto.localisation
    const [ contractLat,contractLng] = contract.lieu.coordinates;

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
      const currentTime = pointageDto.heureDepart ? new Date(pointageDto.heureDepart) : new Date()
      existingPresence.heureDepart = currentTime
      existingPresence.localisationDepart = {
        type: "Point",
        coordinates: pointageDto.localisation as [number, number],
      }


      // Calculer les heures supplémentaires ou départ anticipé
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
         localisationDepart: { // <-- Valeur par défaut
    type: "Point",
    coordinates: pointageDto.localisation, // Mêmes coordonnées que l'arrivée
  },
        notes: pointageDto.notes,
      })

      // Vérifier si l'employé est en retard
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
  @Cron("0 */15 * * * *") // Toutes les 15 minutes
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

  async saveAsTemplate(contractId: string, saveDto: SaveAsTemplateDto): Promise<Contrat> {
    const contract = await this.findOne(contractId)

    const template = this.contractRepository.create({
      lieu: contract.lieu,
      dateDebut: contract.dateDebut,
      dateFin: contract.dateFin,
      description: contract.description,
      pause: contract.pause,
      estGabarit: true,
      nomGabarit: saveDto.nomGabarit,
      taches: contract.taches,
    })

    return this.contractRepository.save(template)
  }

  async getAllTemplates(): Promise<Contrat[]> {
    return this.contractRepository.find({
      where: { estGabarit: true },
      relations: ["taches", "equipements"],
    })
  }

  async createFromTemplate(createDto: CreateFromTemplateDto): Promise<Contrat[]> {
    const template = await this.contractRepository.findOne({
      where: { idContrat: createDto.gabaritId, estGabarit: true },
      relations: ["taches", "equipements"],
    })

    if (!template) {
      throw new NotFoundException(`Gabarit avec l'ID ${createDto.gabaritId} non trouvé`)
    }

    const createdContracts: Contrat[] = []

    // Créer un contrat pour chaque utilisateur
    for (const utilisateurId of createDto.utilisateursIds) {
      const utilisateur = await this.utilisateurRepository.findOne({
        where: { idUtilisateur: utilisateurId },
      })

      if (!utilisateur) {
        throw new NotFoundException(`Utilisateur avec l'ID ${utilisateurId} non trouvé`)
      }


      const newContract = this.contractRepository.create({
        lieu: template.lieu,
        dateDebut: createDto.dateDebut || template.dateDebut,
        dateFin: createDto.dateFin || template.dateFin,
        description: template.description,
        pause: template.pause,
        estGabarit: false,
         utilisateur: [utilisateur],
        taches: template.taches,
   
      })

      const savedContract = await this.contractRepository.save(newContract)
      createdContracts.push(savedContract)

      // Envoyer SMS de notification
      try {
        await this.sendContractNotificationSMS(utilisateur, savedContract)
        console.log(`SMS envoyé à l'employé ${utilisateur.idUtilisateur}`)
      } catch (error) {
        console.error(`Erreur envoi SMS à l'employé ${utilisateur.idUtilisateur}:`, error)
      }
    }

    return createdContracts
  }

  // Cron job pour envoyer les notifications quotidiennes
  @Cron("0 7 * * *") // Tous les jours à 7h
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
        await this.sendContractNotificationSMS(user, contract);
        console.log(`Notification envoyée pour ${user.nom} sur le contrat ${contract.idContrat}`);
      } catch (error) {
        console.error(`Erreur pour ${user.nom}:`, error);
      }
    }
  }
}

}
}

