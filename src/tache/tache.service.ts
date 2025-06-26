import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { Repository, IsNull } from "typeorm"
import { tache } from "./entities/tache.entity"
import { CreateTacheDto } from "./dto/create-tache.dto"
import { UpdateTacheDto } from "./dto/update-tache.dto"
import { QueryTacheDto } from "./dto/query-tache.dto"
import { Priorite, StatutTache } from "src/utils/enums/enums"
import { Entreprise } from "../entreprise/entities/entreprise.entity"
import * as ExcelJS from "exceljs"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class TacheService {
  constructor(
    @InjectRepository(tache)
    private readonly tacheRepository: Repository<tache>,
    @InjectRepository(Entreprise)
    private readonly entrepriseRepository: Repository<Entreprise>,
  ) {}

  // MÉTHODES POUR LES TÂCHES PAR ENTREPRISE

  // Créer une tâche pour une entreprise spécifique
  async createForEntreprise(entrepriseId: string, createTacheDto: CreateTacheDto): Promise<tache> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    try {
      const nouvelleTache = this.tacheRepository.create({
        ...createTacheDto,
        priorite: createTacheDto.priorite || Priorite.MOYENNE,
        entreprise: entreprise, // ✅ Association correcte
      })

      const tacheSauvegardee = await this.tacheRepository.save(nouvelleTache)
      
      // ✅ Retourner la tâche avec l'entreprise associée pour vérification
      const tacheAvecEntreprise = await this.tacheRepository.findOne({
        where: { idTache: tacheSauvegardee.idTache },
        relations: ["entreprise"],
      })
      if (!tacheAvecEntreprise) {
        throw new NotFoundException(`Tâche avec l'ID ${tacheSauvegardee.idTache} non trouvée après création`)
      }
      return tacheAvecEntreprise
    } catch (error) {
      console.error('Erreur lors de la création de la tâche:', error) // ✅ Log pour debug
      throw new BadRequestException("Erreur lors de la création de la tâche")
    }
  }

  // Récupérer toutes les tâches d'une entreprise
  async findAllForEntreprise(entrepriseId: string, queryDto?: QueryTacheDto): Promise<tache[]> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const query = this.tacheRepository
      .createQueryBuilder("tache")
      .leftJoinAndSelect("tache.entreprise", "entreprise")
      .where("tache.delete_at IS NULL")
      .andWhere("entreprise.idEntreprise = :entrepriseId", { entrepriseId })

    if (queryDto?.priorite) {
      query.andWhere("tache.priorite = :priorite", { priorite: queryDto.priorite })
    }

    if (queryDto?.statut) {
      // ✅ Correction: utiliser le bon nom de colonne selon votre entité
      // Remplacez 'type' par le nom correct de votre colonne de statut
      query.andWhere("tache.type = :statut", { statut: queryDto.statut })
    }

    return await query.orderBy("tache.dateCreation", "DESC").getMany()
  }

  // Récupérer une tâche spécifique d'une entreprise
  async findOneForEntreprise(entrepriseId: string, tacheId: string): Promise<tache> {
    const tacheFound = await this.tacheRepository.findOne({
      where: {
        idTache: tacheId,
        entreprise: { idEntreprise: entrepriseId },
        delete_at: IsNull(),
      },
      relations: ["entreprise"],
    })

    if (!tacheFound) {
      throw new NotFoundException(`Tâche avec l'ID ${tacheId} non trouvée pour cette entreprise`)
    }

    return tacheFound
  }

  // Mettre à jour une tâche d'une entreprise
  async updateForEntreprise(entrepriseId: string, tacheId: string, updateTacheDto: UpdateTacheDto): Promise<tache> {
    const tacheExistante = await this.findOneForEntreprise(entrepriseId, tacheId)

    Object.assign(tacheExistante, updateTacheDto)

    try {
      return await this.tacheRepository.save(tacheExistante)
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la tâche:', error)
      throw new BadRequestException("Erreur lors de la mise à jour de la tâche")
    }
  }

  // Dupliquer une tâche d'une entreprise
  async duplicateForEntreprise(entrepriseId: string, tacheId: string): Promise<tache> {
    const tacheOriginale = await this.findOneForEntreprise(entrepriseId, tacheId)

    const tacheDupliquee = this.tacheRepository.create({
      titre: `${tacheOriginale.titre} (Copie)`,
      description: tacheOriginale.description,
      TimeEstimated: tacheOriginale.TimeEstimated,
      priorite: tacheOriginale.priorite,
      type: StatutTache.EN_ATTENTE,
      entreprise: tacheOriginale.entreprise, // ✅ Association correcte
    })

    return await this.tacheRepository.save(tacheDupliquee)
  }

  // Suppression logique d'une tâche d'une entreprise
  async removeForEntreprise(entrepriseId: string, tacheId: string): Promise<void> {
    const tacheExistante = await this.findOneForEntreprise(entrepriseId, tacheId)

    try {
      await this.tacheRepository.softDelete(tacheId)
    } catch (error) {
      console.error('Erreur lors de la suppression de la tâche:', error)
      throw new BadRequestException("Erreur lors de la suppression de la tâche")
    }
  }

  // Restaurer une tâche supprimée d'une entreprise
  async restoreForEntreprise(entrepriseId: string, tacheId: string): Promise<tache> {
    // Vérifier si la tâche existe (même supprimée) et appartient à l'entreprise
    const tacheSupprimee = await this.tacheRepository.findOne({
      where: {
        idTache: tacheId,
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["entreprise"],
      withDeleted: true,
    })

    if (!tacheSupprimee) {
      throw new NotFoundException(`Tâche avec l'ID ${tacheId} non trouvée pour cette entreprise`)
    }

    if (!tacheSupprimee.delete_at) {
      throw new BadRequestException("Cette tâche n'est pas supprimée")
    }

    try {
      await this.tacheRepository.restore(tacheId)
      return await this.findOneForEntreprise(entrepriseId, tacheId)
    } catch (error) {
      console.error('Erreur lors de la restauration de la tâche:', error)
      throw new BadRequestException("Erreur lors de la restauration de la tâche")
    }
  }

  // Lister les tâches supprimées d'une entreprise
  async findDeletedForEntreprise(entrepriseId: string): Promise<tache[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const taches = await this.tacheRepository.find({
      where: {
        entreprise: { idEntreprise: entrepriseId },
      },
      relations: ["entreprise"],
      withDeleted: true,
    })

    return taches.filter((t) => t.delete_at !== null)
  }

  // Lister les tâches par priorité ou statut pour une entreprise
  async findByPrioriteOrStatutForEntreprise(
    entrepriseId: string,
    priorite?: Priorite,
    statut?: StatutTache,
  ): Promise<tache[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const query = this.tacheRepository
      .createQueryBuilder("tache")
      .leftJoinAndSelect("tache.entreprise", "entreprise")
      .where("tache.delete_at IS NULL")
      .andWhere("entreprise.idEntreprise = :entrepriseId", { entrepriseId })

    if (priorite) {
      query.andWhere("tache.priorite = :priorite", { priorite })
    }

    if (statut) {
      query.andWhere("tache.type = :statut", { statut })
    }

    return await query.orderBy("tache.priorite", "DESC").addOrderBy("tache.dateCreation", "DESC").getMany()
  }

  // Exporter les tâches d'une entreprise
  async exportTachesEntreprise(entrepriseId: string): Promise<Buffer> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const taches = await this.tacheRepository.find({
      where: {
        entreprise: { idEntreprise: entrepriseId },
        delete_at: IsNull(),
      },
      relations: ["entreprise"],
      order: { dateCreation: "DESC" },
    })

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Tâches")

    // En-têtes
    worksheet.columns = [
      { header: "ID", key: "idTache", width: 40 },
      { header: "Titre", key: "titre", width: 30 },
      { header: "Description", key: "description", width: 50 },
      { header: "Temps estimé", key: "TimeEstimated", width: 15 },
      { header: "Priorité", key: "priorite", width: 15 },
      { header: "Statut", key: "type", width: 15 },
      { header: "Entreprise", key: "entreprise", width: 30 },
      { header: "Date création", key: "dateCreation", width: 20 },
      { header: "Dernière mise à jour", key: "update_at", width: 20 },
    ]

    // Données
    taches.forEach((tache) => {
      worksheet.addRow({
        idTache: tache.idTache,
        titre: tache.titre,
        description: tache.description || "",
        TimeEstimated: tache.TimeEstimated || 0,
        priorite: tache.priorite,
        type: tache.type,
        entreprise: tache.entreprise?.nom || "",
        dateCreation: tache.dateCreation.toLocaleDateString("fr-FR"),
        update_at: tache.update_at.toLocaleDateString("fr-FR"),
      })
    })

    // Style de l'en-tête
    worksheet.getRow(1).font = { bold: true }
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    }

    return (await workbook.xlsx.writeBuffer()) as Buffer
  }

  // Obtenir les statistiques des tâches d'une entreprise
  async getStatistiquesEntreprise(entrepriseId: string): Promise<any> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const totalTaches = await this.tacheRepository.count({
      where: {
        entreprise: { idEntreprise: entrepriseId },
        delete_at: IsNull(),
      },
    })

    const tachesParStatut = await this.tacheRepository
      .createQueryBuilder("tache")
      .select("tache.type", "statut")
      .addSelect("COUNT(*)", "count")
      .where("tache.entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("tache.delete_at IS NULL")
      .groupBy("tache.type")
      .getRawMany()

    const tachesParPriorite = await this.tacheRepository
      .createQueryBuilder("tache")
      .select("tache.priorite", "priorite")
      .addSelect("COUNT(*)", "count")
      .where("tache.entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("tache.delete_at IS NULL")
      .groupBy("tache.priorite")
      .getRawMany()

    const tempsEstimeTotal = await this.tacheRepository
      .createQueryBuilder("tache")
      .select("SUM(tache.TimeEstimated)", "total")
      .where("tache.entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("tache.delete_at IS NULL")
      .getRawOne()

    return {
      entreprise: {
        id: entreprise.idEntreprise,
        nom: entreprise.nom,
      },
      totalTaches,
      tachesParStatut,
      tachesParPriorite,
      tempsEstimeTotal: Number.parseFloat(tempsEstimeTotal.total) || 0,
    }
  }

  // ✅ Méthode de débogage pour vérifier l'association
  async debugTacheEntreprise(tacheId: string): Promise<any> {
    const tache = await this.tacheRepository.findOne({
      where: { idTache: tacheId },
      relations: ["entreprise"],
    })

    return {
      tache: tache,
      entrepriseAssociee: tache?.entreprise,
      entrepriseId: tache?.entreprise?.idEntreprise,
    }
  }


  // MÉTHODES EXISTANTES (pour compatibilité)

  // async create(createTacheDto: CreateTacheDto): Promise<tache> {
  //   try {
  //     const nouvelleTache = this.tacheRepository.create({
  //       ...createTacheDto,
  //       priorite: createTacheDto.priorite || Priorite.MOYENNE,
  //     })

  //     return await this.tacheRepository.save(nouvelleTache)
  //   } catch (error) {
  //     throw new BadRequestException("Erreur lors de la création de la tâche")
  //   }
  // }

  // async findAll(queryDto?: QueryTacheDto): Promise<tache[]> {
  //   const query = this.tacheRepository
  //     .createQueryBuilder("tache")
  //     .leftJoinAndSelect("tache.entreprise", "entreprise")
  //     .where("tache.delete_at IS NULL")

  //   if (queryDto?.priorite) {
  //     query.andWhere("tache.priorite = :priorite", { priorite: queryDto.priorite })
  //   }

  //   if (queryDto?.statut) {
  //     query.andWhere("tache.type = :statut", { statut: queryDto.statut })
  //   }

  //   return await query.getMany()
  // }

  // async findOne(id: string): Promise<tache> {
  //   const tacheFound = await this.tacheRepository.findOne({
  //     where: {
  //       idTache: id,
  //       delete_at: IsNull(),
  //     },
  //     relations: ["entreprise"],
  //   })

  //   if (!tacheFound) {
  //     throw new NotFoundException(`Tâche avec l'ID ${id} non trouvée`)
  //   }

  //   return tacheFound
  // }

  // async findByPrioriteOrStatut(priorite?: Priorite, statut?: StatutTache): Promise<tache[]> {
  //   const query = this.tacheRepository
  //     .createQueryBuilder("tache")
  //     .leftJoinAndSelect("tache.entreprise", "entreprise")
  //     .where("tache.delete_at IS NULL")

  //   if (priorite) {
  //     query.andWhere("tache.priorite = :priorite", { priorite })
  //   }

  //   if (statut) {
  //     query.andWhere("tache.type = :statut", { statut })
  //   }

  //   return await query.orderBy("tache.priorite", "DESC").addOrderBy("tache.dateCreation", "DESC").getMany()
  // }

  // async update(id: string, updateTacheDto: UpdateTacheDto): Promise<tache> {
  //   const tacheExistante = await this.findOne(id)

  //   Object.assign(tacheExistante, updateTacheDto)

  //   try {
  //     return await this.tacheRepository.save(tacheExistante)
  //   } catch (error) {
  //     throw new BadRequestException("Erreur lors de la mise à jour de la tâche")
  //   }
  // }

  // async duplicate(id: string): Promise<tache> {
  //   const tacheOriginale = await this.findOne(id)

  //   const tacheDupliquee = this.tacheRepository.create({
  //     titre: `${tacheOriginale.titre} (Copie)`,
  //     description: tacheOriginale.description,
  //     TimeEstimated: tacheOriginale.TimeEstimated,
  //     priorite: tacheOriginale.priorite,
  //     type: StatutTache.EN_ATTENTE,
  //     entreprise: tacheOriginale.entreprise,
  //   })

  //   return await this.tacheRepository.save(tacheDupliquee)
  // }

  // async remove(id: string): Promise<void> {
  //   const tacheExistante = await this.findOne(id)

  //   try {
  //     await this.tacheRepository.softDelete(id)
  //   } catch (error) {
  //     throw new BadRequestException("Erreur lors de la suppression de la tâche")
  //   }
  // }

  // async restore(id: string): Promise<tache> {
  //   const tacheSupprimee = await this.tacheRepository.findOne({
  //     where: { idTache: id },
  //     relations: ["entreprise"],
  //     withDeleted: true,
  //   })

  //   if (!tacheSupprimee) {
  //     throw new NotFoundException(`Tâche avec l'ID ${id} non trouvée`)
  //   }

  //   if (!tacheSupprimee.delete_at) {
  //     throw new BadRequestException("Cette tâche n'est pas supprimée")
  //   }

  //   try {
  //     await this.tacheRepository.restore(id)
  //     return await this.findOne(id)
  //   } catch (error) {
  //     throw new BadRequestException("Erreur lors de la restauration de la tâche")
  //   }
  // }

  // async findDeleted(): Promise<tache[]> {
  //   const taches = await this.tacheRepository.find({
  //     where: {},
  //     relations: ["entreprise"],
  //     withDeleted: true,
  //   })

  //   return taches.filter((t) => t.delete_at !== null)
  // }

  // async exportTachesUtilisateur(employeId: string): Promise<Buffer> {
  //   const taches = await this.tacheRepository.find({
  //     where: {
  //       delete_at: IsNull(),
  //     },
  //     relations: ["entreprise"],
  //     order: { dateCreation: "DESC" },
  //   })

  //   const workbook = new ExcelJS.Workbook()
  //   const worksheet = workbook.addWorksheet("Tâches")

  //   worksheet.columns = [
  //     { header: "ID", key: "idTache", width: 40 },
  //     { header: "Titre", key: "titre", width: 30 },
  //     { header: "Description", key: "description", width: 50 },
  //     { header: "Temps estimé", key: "TimeEstimated", width: 15 },
  //     { header: "Priorité", key: "priorite", width: 15 },
  //     { header: "Statut", key: "type", width: 15 },
  //     { header: "Entreprise", key: "entreprise", width: 30 },
  //     { header: "Date création", key: "dateCreation", width: 20 },
  //     { header: "Dernière mise à jour", key: "update_at", width: 20 },
  //   ]

  //   taches.forEach((tache) => {
  //     worksheet.addRow({
  //       idTache: tache.idTache,
  //       titre: tache.titre,
  //       description: tache.description || "",
  //       TimeEstimated: tache.TimeEstimated || 0,
  //       priorite: tache.priorite,
  //       type: tache.type,
  //       entreprise: tache.entreprise?.nom || "",
  //       dateCreation: tache.dateCreation.toLocaleDateString("fr-FR"),
  //       update_at: tache.update_at.toLocaleDateString("fr-FR"),
  //     })
  //   })

  //   worksheet.getRow(1).font = { bold: true }
  //   worksheet.getRow(1).fill = {
  //     type: "pattern",
  //     pattern: "solid",
  //     fgColor: { argb: "FFE0E0E0" },
  //   }

  //   return (await workbook.xlsx.writeBuffer()) as Buffer
  // }
}
