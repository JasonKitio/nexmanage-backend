import { Injectable, NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common"
import  { Repository } from "typeorm"
import { IsNull } from "typeorm"
import  { Utilisateur } from "./entities/utilisateur.entity"
import  { CreateUserDto } from "../auth/dto/create-user.dto"
import  { FilterUsersDto } from "./dto/filter-users.dto"
import { Role } from "../utils/enums/enums"
import * as bcrypt from "bcrypt"
import  { UpdateUtilisateurDto } from "./dto/updateUtilisateur.dto"
import  { Entreprise } from "../entreprise/entities/entreprise.entity"
import  { UtilisateurEntreprise } from "../UtilisateurEntreprise/entities/utilisateur-entreprise.entity"
import * as ExcelJS from "exceljs"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Utilisateur)
    private readonly userRepository: Repository<Utilisateur>,
    @InjectRepository(Entreprise)
    private entrepriseRepository: Repository<Entreprise>,
    @InjectRepository(UtilisateurEntreprise)
    private readonly utilisateurEntrepriseRepository: Repository<UtilisateurEntreprise>,
  ) {}
    private readonly DEFAULT_PASSWORD = '123456';

  // Nouvelles méthodes pour récupérer les utilisateurs avec leurs entreprises
  async findByPhoneWithEntreprises(telephone: string): Promise<Utilisateur | null> {
    return await this.userRepository.findOne({
      where: { telephone, delete_at: IsNull() },
      relations: ["entreprises", "entreprises.entreprise"],
    })
  }

  async findByEmailWithEntreprises(email: string): Promise<Utilisateur | null> {
    return this.userRepository.findOne({
      where: { email, delete_at: IsNull() },
      relations: ["entreprises", "entreprises.entreprise"],
    })
  }

  async findByIdWithEntreprises(id: string): Promise<Utilisateur> {
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id, delete_at: IsNull() },
      relations: ["entreprises", "entreprises.entreprise"],
    })

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    return user
  }

  // Créer un utilisateur pour une entreprise spécifique avec mot de passe par défaut
  async createUserForEntreprise(entrepriseId: string, createUserDto: CreateUserDto): Promise<Utilisateur> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const { telephone, email, ...userData } = createUserDto

    // Vérifier si le téléphone existe déjà
    const existingUser = await this.userRepository.findOne({
      where: { telephone },
      withDeleted: true,
    })

    if (existingUser) {
      throw new ConflictException("Ce numéro de téléphone est déjà utilisé")
    }

    // Vérifier si l'email existe déjà (si fourni)
    if (email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email },
        withDeleted: true,
      })
      if (existingEmail) {
        throw new ConflictException("Cet email est déjà utilisé")
      }
    }

    // Utiliser le mot de passe par défaut "123456"
    const hashedPassword = await bcrypt.hash(this.DEFAULT_PASSWORD, 10)

    const user = this.userRepository.create({
      ...userData,
      telephone,
      email,
      motDePasse: hashedPassword,
      isActif: true,
    })

    const savedUser = await this.userRepository.save(user)

    // Créer la relation utilisateur-entreprise
    const utilisateurEntreprise = this.utilisateurEntrepriseRepository.create({
      utilisateur: savedUser,
      entreprise: entreprise,
      isOwner: createUserDto.role === Role.ADMIN,
    })

    await this.utilisateurEntrepriseRepository.save(utilisateurEntreprise)

    return savedUser
  }

  // Obtenir tous les utilisateurs d'une entreprise
  async findAllForEntreprise(
    entrepriseId: string,
    filterDto: FilterUsersDto,
  ): Promise<{ users: Utilisateur[]; total: number }> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const { role, email, nom, search, page = "1", limit = "10" } = filterDto
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL") // Seulement les utilisateurs non supprimés

    // Filtres
    if (role) {
      queryBuilder.andWhere("user.role = :role", { role })
    }

    if (email) {
      queryBuilder.andWhere("user.email LIKE :email", { email: `%${email}%` })
    }

    if (nom) {
      queryBuilder.andWhere("user.nom LIKE :nom", { nom: `%${nom}%` })
    }

    // Recherche globale
    if (search) {
      queryBuilder.andWhere("(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)", {
        search: `%${search}%`,
      })
    }

    const [users, total] = await queryBuilder.skip(skip).take(Number.parseInt(limit)).getManyAndCount()

    return { users, total }
  }

  // Obtenir un utilisateur spécifique d'une entreprise
  async findUserByIdForEntreprise(entrepriseId: string, userId: string): Promise<Utilisateur> {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.entreprises", "ue")
      .leftJoinAndSelect("ue.entreprise", "entreprise")
      .where("user.idUtilisateur = :userId", { userId })
      .andWhere("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .getOne()

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé dans cette entreprise")
    }

    return user
  }

  // Mettre à jour un utilisateur d'une entreprise
  async updateUserForEntreprise(
    entrepriseId: string,
    userId: string,
    updateDto: UpdateUtilisateurDto,
  ): Promise<Utilisateur> {
    // Vérifier que l'utilisateur appartient à l'entreprise
    const user = await this.findUserByIdForEntreprise(entrepriseId, userId)

    // Vérifier l'unicité de l'email si modifié
    if (updateDto.email && updateDto.email !== user.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: updateDto.email },
        withDeleted: true,
      })
      if (existingEmail) {
        throw new ConflictException("Cet email est déjà utilisé")
      }
    }

    // Vérifier l'unicité du téléphone si modifié
    if (updateDto.telephone && updateDto.telephone !== user.telephone) {
      const existingPhone = await this.userRepository.findOne({
        where: { telephone: updateDto.telephone },
        withDeleted: true,
      })
      if (existingPhone) {
        throw new ConflictException("Ce numéro est déjà utilisé")
      }
    }

    // Hasher le nouveau mot de passe si fourni
    if (updateDto.motDePasse) {
      updateDto.motDePasse = await bcrypt.hash(updateDto.motDePasse, 10)
    }

    Object.assign(user, updateDto)
    return await this.userRepository.save(user)
  }

  // Supprimer un utilisateur d'une entreprise
  async softDeleteUserForEntreprise(entrepriseId: string, userId: string): Promise<void> {
    // Vérifier que l'utilisateur appartient à l'entreprise
    await this.findUserByIdForEntreprise(entrepriseId, userId)

    const result = await this.userRepository.softDelete(userId)

    if (result.affected === 0) {
      throw new NotFoundException("Impossible de supprimer l'utilisateur")
    }
  }

  // Restaurer un utilisateur d'une entreprise
  async restoreUserForEntreprise(entrepriseId: string, userId: string): Promise<Utilisateur> {
    // Vérifier que l'utilisateur existe (même supprimé) et appartient à l'entreprise
    const user = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.entreprises", "ue")
      .leftJoinAndSelect("ue.entreprise", "entreprise")
      .where("user.idUtilisateur = :userId", { userId })
      .andWhere("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .withDeleted()
      .getOne()

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé dans cette entreprise")
    }

    if (!user.delete_at) {
      throw new ConflictException("L'utilisateur n'est pas supprimé")
    }

    const result = await this.userRepository.restore(userId)

    if (result.affected === 0) {
      throw new NotFoundException("Impossible de restaurer l'utilisateur")
    }

    return await this.findUserByIdForEntreprise(entrepriseId, userId)
  }

  // Activer/désactiver un utilisateur d'une entreprise
  async toggleActivationForEntreprise(entrepriseId: string, userId: string): Promise<Utilisateur> {
    const user = await this.findUserByIdForEntreprise(entrepriseId, userId)
    user.isActif = !user.isActif
    return await this.userRepository.save(user)
  }

  // Obtenir les utilisateurs supprimés d'une entreprise
  async findDeletedUsersForEntreprise(
    entrepriseId: string,
    filterDto: FilterUsersDto,
  ): Promise<{ users: Utilisateur[]; total: number }> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const { role, email, nom, search, page = "1", limit = "10" } = filterDto
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NOT NULL") // Seulement les utilisateurs supprimés
      .withDeleted()

    // Filtres
    if (role) {
      queryBuilder.andWhere("user.role = :role", { role })
    }

    if (email) {
      queryBuilder.andWhere("user.email LIKE :email", { email: `%${email}%` })
    }

    if (nom) {
      queryBuilder.andWhere("user.nom LIKE :nom", { nom: `%${nom}%` })
    }

    if (search) {
      queryBuilder.andWhere("(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)", {
        search: `%${search}%`,
      })
    }

    const [users, total] = await queryBuilder.skip(skip).take(Number.parseInt(limit)).getManyAndCount()

    return { users, total }
  }

  // Obtenir les utilisateurs par rôle dans une entreprise
  async findUsersByRoleForEntreprise(entrepriseId: string, role: Role): Promise<Utilisateur[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.role = :role", { role })
      .andWhere("user.delete_at IS NULL")
      .getMany()
  }

  // Obtenir les statistiques des utilisateurs d'une entreprise
  async getStatistiquesUsersEntreprise(entrepriseId: string): Promise<any> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const totalUsers = await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .getCount()

    const usersActifs = await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .andWhere("user.isActif = :isActif", { isActif: true })
      .getCount()

    const usersParRole = await this.userRepository
      .createQueryBuilder("user")
      .select("user.role", "role")
      .addSelect("COUNT(*)", "count")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .groupBy("user.role")
      .getRawMany()

    const usersSupprimés = await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NOT NULL")
      .withDeleted()
      .getCount()

    const nouveauxUsersCeMois = await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .andWhere("user.dateCreation >= :dateDebut", {
        dateDebut: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      })
      .getCount()

    return {
      entreprise: {
        id: entreprise.idEntreprise,
        nom: entreprise.nom,
      },
      totalUsers,
      usersActifs,
      usersInactifs: totalUsers - usersActifs,
      usersParRole,
      usersSupprimés,
      nouveauxUsersCeMois,
    }
  }

  // Exporter les utilisateurs d'une entreprise
  async exportUsersEntreprise(entrepriseId: string): Promise<Buffer> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const users = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.entreprises", "ue")
      .leftJoinAndSelect("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .orderBy("user.dateCreation", "DESC")
      .getMany()

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Utilisateurs")

    // En-têtes
    worksheet.columns = [
      { header: "ID", key: "id", width: 40 },
      { header: "Nom", key: "nom", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Téléphone", key: "telephone", width: 20 },
      { header: "Rôle", key: "role", width: 15 },
      { header: "Statut", key: "statut", width: 15 },
      { header: "Est Admin", key: "isOwner", width: 15 },
      { header: "Date création", key: "dateCreation", width: 20 },
      { header: "Dernière MAJ", key: "update_at", width: 20 },
    ]

    // Données
    users.forEach((user) => {
      const userEntreprise = user.entreprises?.find((ue) => ue.entreprise.idEntreprise === entrepriseId)
      worksheet.addRow({
        id: user.idUtilisateur,
        nom: user.nom,
        email: user.email || "",
        telephone: user.telephone,
        role: user.role,
        statut: user.isActif ? "Actif" : "Inactif",
        isOwner: userEntreprise?.isOwner ? "Oui" : "Non",
        dateCreation: user.dateCreation.toLocaleDateString("fr-FR"),
        update_at: user.update_at.toLocaleDateString("fr-FR"),
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
        const statut = row.getCell(6).value
        const role = row.getCell(5).value

        if (statut === "Inactif") {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFEAEA" },
          }
        } else if (role === Role.ADMIN) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8F4FD" },
          }
        } else {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8F5E8" },
          }
        }
      }
    })

    return (await workbook.xlsx.writeBuffer()) as Buffer
  }

  // Changer le rôle d'un utilisateur dans une entreprise
  async changeUserRoleForEntreprise(entrepriseId: string, userId: string, newRole: Role): Promise<Utilisateur> {
    const user = await this.findUserByIdForEntreprise(entrepriseId, userId)

    user.role = newRole

    // Mettre à jour aussi le statut isOwner dans la relation
    const userEntreprise = await this.utilisateurEntrepriseRepository.findOne({
      where: {
        utilisateur: { idUtilisateur: userId },
        entreprise: { idEntreprise: entrepriseId },
      },
    })

    if (userEntreprise) {
      userEntreprise.isOwner = newRole === Role.ADMIN
      await this.utilisateurEntrepriseRepository.save(userEntreprise)
    }

    return await this.userRepository.save(user)
  }

  // Obtenir les admins d'une entreprise
  async getAdminsForEntreprise(entrepriseId: string): Promise<Utilisateur[]> {
    return await this.findUsersByRoleForEntreprise(entrepriseId, Role.ADMIN)
  }

  // Obtenir les employés d'une entreprise
  async getEmployeesForEntreprise(entrepriseId: string): Promise<Utilisateur[]> {
    return await this.findUsersByRoleForEntreprise(entrepriseId, Role.EMPLOYE)
  }

  // Rechercher des utilisateurs dans une entreprise
  async searchUsersInEntreprise(entrepriseId: string, searchTerm: string): Promise<Utilisateur[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    return await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.entreprises", "ue")
      .leftJoin("ue.entreprise", "entreprise")
      .where("entreprise.idEntreprise = :entrepriseId", { entrepriseId })
      .andWhere("user.delete_at IS NULL")
      .andWhere("(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)", {
        search: `%${searchTerm}%`,
      })
      .limit(20) // Limiter les résultats de recherche
      .getMany()
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

  // MÉTHODES EXISTANTES (pour compatibilité)

  async create(createUserDto: CreateUserDto): Promise<Utilisateur> {
    const { telephone, email, motDePasse, ...userData } = createUserDto

    const existingUser = await this.userRepository.findOne({
      where: { telephone },
      withDeleted: true,
    })

    if (existingUser) {
      throw new ConflictException("Ce numéro de téléphone est déjà utilisé")
    }

    if (email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email },
        withDeleted: true,
      })
      if (existingEmail) {
        throw new ConflictException("Cet email est déjà utilisé")
      }
    }

    const hashedPassword = await bcrypt.hash(motDePasse, 10)

    const user = this.userRepository.create({
      ...userData,
      telephone,
      email,
      motDePasse: hashedPassword,
      isActif: true,
    })

    return await this.userRepository.save(user)
  }

  async findByPhone(telephone: string): Promise<Utilisateur | null> {
    return await this.userRepository.findOne({
      where: { telephone, delete_at: IsNull() },
    })
  }

  async findByPhoneWithDeleted(telephone: string): Promise<Utilisateur | null> {
    return await this.userRepository.findOne({
      where: { telephone },
      withDeleted: true,
    })
  }

  async findById(id: string): Promise<Utilisateur> {
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id, delete_at: IsNull() },
    })

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    return user
  }

  async findByEmail(email: string): Promise<Utilisateur | null> {
    return this.userRepository.findOne({ where: { email, delete_at: IsNull() } })
  }

  async findByI(id: string): Promise<Utilisateur | null> {
    return this.userRepository.findOne({ where: { idUtilisateur: id, delete_at: IsNull() } })
  }

  async findByIdWithDeleted(id: string): Promise<Utilisateur> {
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id },
      withDeleted: true,
    })

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    return user
  }

  async updatePassword(id: string, nouveauMotDePasse: string): Promise<void> {
    await this.findById(id)

    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, 10)
    await this.userRepository.update(id, { motDePasse: hashedPassword })
  }

  async toggleActivation(id: string): Promise<Utilisateur> {
    const user = await this.findById(id)
    user.isActif = !user.isActif
    return await this.userRepository.save(user)
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id)

    const result = await this.userRepository.softDelete(id)

    if (result.affected === 0) {
      throw new NotFoundException("Impossible de supprimer l'utilisateur")
    }
  }

  async restore(id: string): Promise<Utilisateur> {
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id },
      withDeleted: true,
    })

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    if (!user.delete_at) {
      throw new ConflictException("L'utilisateur n'est pas supprimé")
    }

    const result = await this.userRepository.restore(id)

    if (result.affected === 0) {
      throw new NotFoundException("Impossible de restaurer l'utilisateur")
    }

    return await this.findById(id)
  }

  async findAll(filterDto: FilterUsersDto): Promise<{ users: Utilisateur[]; total: number }> {
    const { role, email, nom, search, page = "1", limit = "10" } = filterDto
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const queryBuilder = this.userRepository.createQueryBuilder("user").where("user.delete_at IS NULL")

    if (role) {
      queryBuilder.andWhere("user.role = :role", { role })
    }

    if (email) {
      queryBuilder.andWhere("user.email LIKE :email", { email: `%${email}%` })
    }

    if (nom) {
      queryBuilder.andWhere("user.nom LIKE :nom", { nom: `%${nom}%` })
    }

    if (search) {
      queryBuilder.andWhere("(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)", {
        search: `%${search}%`,
      })
    }

    const [users, total] = await queryBuilder.skip(skip).take(Number.parseInt(limit)).getManyAndCount()

    return { users, total }
  }

  async findAllDeleted(filterDto: FilterUsersDto): Promise<{ users: Utilisateur[]; total: number }> {
    const { role, email, nom, search, page = "1", limit = "10" } = filterDto
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .where("user.delete_at IS NOT NULL")
      .withDeleted()

    if (role) {
      queryBuilder.andWhere("user.role = :role", { role })
    }

    if (email) {
      queryBuilder.andWhere("user.email LIKE :email", { email: `%${email}%` })
    }

    if (nom) {
      queryBuilder.andWhere("user.nom LIKE :nom", { nom: `%${nom}%` })
    }

    if (search) {
      queryBuilder.andWhere("(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)", {
        search: `%${search}%`,
      })
    }

    const [users, total] = await queryBuilder.skip(skip).take(Number.parseInt(limit)).getManyAndCount()

    return { users, total }
  }

  async findAllWithDeleted(filterDto: FilterUsersDto): Promise<{ users: Utilisateur[]; total: number }> {
    const { role, email, nom, search, page = "1", limit = "10" } = filterDto
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const queryBuilder = this.userRepository.createQueryBuilder("user").withDeleted()

    if (role) {
      queryBuilder.andWhere("user.role = :role", { role })
    }

    if (email) {
      queryBuilder.andWhere("user.email LIKE :email", { email: `%${email}%` })
    }

    if (nom) {
      queryBuilder.andWhere("user.nom LIKE :nom", { nom: `%${nom}%` })
    }

    if (search) {
      queryBuilder.andWhere("(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)", {
        search: `%${search}%`,
      })
    }

    const [users, total] = await queryBuilder.skip(skip).take(Number.parseInt(limit)).getManyAndCount()

    return { users, total }
  }

  async updateUtilisateur(id: string, dto: UpdateUtilisateurDto) {
    const utilisateur = await this.userRepository.findOne({
      where: {
        idUtilisateur: id,
        delete_at: IsNull(),
      },
    })

    if (!utilisateur) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    if (dto.email && dto.email !== utilisateur.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: dto.email },
      })
      if (existingEmail) {
        throw new ConflictException("Cet email est déjà utilisé")
      }
    }

    if (dto.telephone && dto.telephone !== utilisateur.telephone) {
      const existingPhone = await this.userRepository.findOne({
        where: { telephone: dto.telephone },
      })
      if (existingPhone) {
        throw new ConflictException("Ce numéro est déjà utilisé")
      }
    }

    if (dto.motDePasse) {
      dto.motDePasse = await bcrypt.hash(dto.motDePasse, 10)
    }

    Object.assign(utilisateur, dto)
    return await this.userRepository.save(utilisateur)
  }

  async updatePhone(userId: string, newPhone: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: userId },
    })

    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    await this.userRepository.update(userId, {
      telephone: newPhone,
    })
  }

async getMe(userId: string): Promise<{
    idUtilisateur: string;
    nom: string;
    telephone: string;
    role: Role;
    isActif: boolean;
    entreprises: { id: string; nom: string; isOwner: boolean }[];
  }> {
    const utilisateur = await this.userRepository.findOne({
      where: { idUtilisateur: userId },
      select: {
        idUtilisateur: true,
        nom: true,
        telephone: true,
        role: true,
        isActif: true,
      },
      relations: ["entreprises", "entreprises.entreprise"],
    })

    if (!utilisateur) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    return {
      idUtilisateur: utilisateur.idUtilisateur,
      nom: utilisateur.nom,
      telephone: utilisateur.telephone,
      role: utilisateur.role,
      isActif: utilisateur.isActif,
      entreprises: utilisateur.entreprises?.map((ue) => ({
        id: ue.entreprise.idEntreprise,
        nom: ue.entreprise.nom,
        isOwner: ue.isOwner,
      })) || [],
    }
  }
}
